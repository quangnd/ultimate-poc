import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test as base } from '@playwright/test'
import { API_PORT } from '../playwright.config'

/**
 * The release API as a process of its own: `src/server/main.ts`, what `npm run server` runs, on the data dir given.
 * Stopping it kills the process, so a restart is a real one: nothing but the files on disk survives.
 */
class Api {
  private child: ChildProcess | undefined

  constructor(readonly dataDir: string) {}

  get pid(): number | undefined {
    return this.child?.pid
  }

  start(): Promise<void> {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], {
      cwd: resolve(import.meta.dirname, '..'),
      env: { ...process.env, PORT: String(API_PORT), DATA_DIR: this.dataDir },
    })
    this.child = child
    return new Promise((resolveStarted, reject) => {
      let output = ''
      const onOutput = (chunk: Buffer) => {
        output += chunk
        if (output.includes('listening on')) resolveStarted()
      }
      child.stdout.on('data', onOutput)
      child.stderr.on('data', onOutput)
      // After a successful start this rejects a promise that is already settled, which does nothing.
      child.once('exit', (code) => reject(new Error(`The API exited (${code}) before it listened:\n${output}`)))
    })
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>((resolveExited) => child.once('exit', () => resolveExited()))
    child.kill('SIGTERM')
    await exited
  }
}

/** Every test gets its own empty data dir under the OS temp dir (never `data/`) and its own API process. */
const test = base.extend<{ api: Api }>({
  api: async ({}, use) => {
    const api = new Api(await mkdtemp(join(tmpdir(), 'rrl-e2e-')))
    try {
      await api.start()
      await use(api)
    } finally {
      await api.stop()
      await rm(api.dataDir, { recursive: true, force: true })
    }
  },
})

// The P2 gate asks for the browser workflow twice in a row, each time on a fresh store.
for (const run of [1, 2]) {
  test(`edit, reload and API restart keep the change (run ${run} of 2)`, async ({ page, api }) => {
    const summary = page.getByRole('region', { name: 'Summary' })
    const finish = (date: string) => expect(summary).toContainText(new RegExp(`Estimated finish\\s*${date}`))
    const fw03Days = page.getByLabel('Estimate in working days of FW-03')

    // Empty store, then the bundled sample.
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'No release yet' })).toBeVisible()
    await page.getByRole('button', { name: 'Load the sample release' }).click()
    await expect(summary.getByRole('heading', { name: 'Not ready', exact: true })).toBeVisible()
    await finish('Wed 10 Feb 2027')

    // FW-03: 5 -> 8 days, saved.
    await page.getByRole('link', { name: 'Edit plan' }).click()
    await expect(fw03Days).toHaveValue('5')
    await fw03Days.fill('8')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved. The dashboard shows the new plan.')).toBeVisible()

    // Reload: the editor and the dashboard both read the stored 8.
    await page.reload()
    await expect(fw03Days).toHaveValue('8')
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await finish('Mon 15 Feb 2027')

    // Restart the API process on the same data dir; the page is then reloaded against the new process.
    // (While it is down the dev server logs a proxy error: expected.)
    const before = api.pid
    await api.stop()
    expect((await page.request.get('/api/release')).ok(), 'the API is down between stop and start').toBe(false)
    await api.start()
    expect(api.pid).not.toBe(before)
    await page.reload()
    await finish('Mon 15 Feb 2027')
    await page.getByRole('link', { name: 'Edit plan' }).click()
    await expect(fw03Days).toHaveValue('8')

    // Export through the header link, as an operator would (reviewer #6253): the download is the stored file.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export' }).click()])
    expect(download.suggestedFilename()).toBe('release.json')
    const path = await download.path()
    const { tasks } = JSON.parse(await readFile(path, 'utf8')) as { tasks: { id: string; estimateDays: number }[] }
    expect(tasks.find((t) => t.id === 'FW-03')).toMatchObject({ estimateDays: 8 })
  })
}

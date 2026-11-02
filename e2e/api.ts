import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test as base } from '@playwright/test'
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
export const test = base.extend<{ api: Api }>({
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

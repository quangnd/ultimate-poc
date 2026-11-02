import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { test } from './api'

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

import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { test as base } from './api'

/**
 * Regression net for the three UI races of P2 (experiments/P2/LOG.md), which only a browser check had covered:
 * D7 (edits made while a save is in flight were lost), D10 (a view switch during a save reset the save lock) and
 * D12 (an import and an editor save could overwrite each other). Nothing here waits for a timer: a request is held
 * at the browser with `page.route()` and answered only when the test calls `release()`.
 */

interface Doc {
  tasks: { id: string; estimateDays: number }[]
}
const sampleText = readFileSync(resolve(import.meta.dirname, '../fixtures/release.json'), 'utf8')
/** A second, different release (FW-03 takes 11 days, the sample says 5), so "the import won" is observable. */
const imported = JSON.parse(sampleText) as Doc
imported.tasks.find((t) => t.id === 'FW-03')!.estimateDays = 11

/** What the page wrote (every non-GET call to the API, in order), so a test can say exactly which writes were sent. */
const test = base.extend<{ writes: string[] }>({
  writes: async ({ page }, use) => {
    const writes: string[] = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (request.method() !== 'GET' && pathname.startsWith('/api/')) writes.push(`${request.method()} ${pathname}`)
    })
    await use(writes)
  },
})

/** Holds the next `method` request to `path` until `release()`; `arrived` settles once it is in flight. */
async function hold(page: Page, method: string, path: string) {
  let release!: () => void
  let arrive!: () => void
  const released = new Promise<void>((resolveRelease) => (release = resolveRelease))
  const arrived = new Promise<void>((resolveArrive) => (arrive = resolveArrive))
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== method) return route.fallback() // the GET after a save is not held
    arrive()
    await released
    await route.continue()
  })
  return { arrived, release }
}

const fw03Days = (page: Page) => page.getByLabel('Estimate in working days of FW-03')
const storedFw03Days = async (page: Page) =>
  ((await (await page.request.get('/api/release')).json()) as Doc).tasks.find((t) => t.id === 'FW-03')!.estimateDays

/**
 * The editor is locked, whatever the reason (a save or an import in flight): Save and Discard are disabled, and an
 * edit, ⌘S in a field and a forced click on Save all do nothing (the draft keeps `value`; the caller checks `writes`).
 * Save is found as the bar's button that is not Discard, never by its label, which differs between a save and an import.
 */
async function expectLocked(page: Page, value: string) {
  const bar = page.getByRole('region', { name: 'Draft' })
  const save = bar.getByRole('button').filter({ hasNotText: 'Discard' })
  await expect(save).toBeDisabled()
  await expect(bar.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
  await fw03Days(page).fill('99')
  await fw03Days(page).press('ControlOrMeta+S')
  await save.click({ force: true })
  await expect(fw03Days(page)).toHaveValue(value)
}

const chooseImport = (page: Page) =>
  page.locator('input[type=file]').setInputFiles({ name: 'imported.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) })

test.beforeEach(async ({ page, api }) => {
  await writeFile(join(api.dataDir, 'release.json'), sampleText)
  await page.goto('/#edit')
  await expect(fw03Days(page)).toHaveValue('5')
})

test('D7: a save in flight locks the editor, and the saved value is stored', async ({ page, writes }) => {
  const put = await hold(page, 'PUT', '/api/release')
  await fw03Days(page).fill('8')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await put.arrived
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await expectLocked(page, '8') // includes a second ⌘S: one save is one write
  expect(await storedFw03Days(page), 'nothing is stored while the save is held').toBe(5)

  put.release()
  await expect(page.getByText('Saved. The dashboard shows the new plan.')).toBeVisible()
  await expect(fw03Days(page)).toHaveValue('8') // the edit tried during the save did not slip in
  expect(await storedFw03Days(page)).toBe(8)
  expect(writes).toEqual(['PUT /api/release'])
})

test('D10: switching to the dashboard and back during a save keeps the editor locked', async ({ page, writes }) => {
  const put = await hold(page, 'PUT', '/api/release')
  await fw03Days(page).fill('8')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await put.arrived

  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('region', { name: 'Summary' })).toBeVisible()
  await page.getByRole('link', { name: 'Edit plan' }).click()
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled() // a remounted editor would have forgotten the save
  await expectLocked(page, '8')

  put.release()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
  await expect(fw03Days(page)).toHaveValue('8')
  expect(await storedFw03Days(page)).toBe(8)
  expect(writes).toEqual(['PUT /api/release'])
})

test('D12: an import cannot start during a save', async ({ page, writes }) => {
  const put = await hold(page, 'PUT', '/api/release')
  await fw03Days(page).fill('8')
  await chooseImport(page) // chosen before the save, so its confirm button is already on screen
  await page.getByRole('button', { name: 'Save changes' }).click()
  await put.arrived

  await expect(page.getByRole('button', { name: 'Import…', exact: true })).toBeDisabled()
  // Forced, so that a button disabled one day cannot make this click time out: what is checked is that it sends nothing.
  await page.getByRole('button', { name: 'Discard edits and replace' }).click({ force: true })

  put.release()
  await expect(page.getByText('Saved. The dashboard shows the new plan.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import…', exact: true })).toBeEnabled()
  expect(await storedFw03Days(page)).toBe(8) // the save was not overwritten by the import
  expect(writes, 'the save is the only write: no import request was sent').toEqual(['PUT /api/release'])
})

test('D12: an editor save cannot start during an import, and the import is what is stored', async ({ page, writes }) => {
  const post = await hold(page, 'POST', '/api/import')
  await fw03Days(page).fill('8') // an unsaved draft the import is about to replace
  await chooseImport(page)
  await page.getByRole('button', { name: 'Discard edits and replace' }).click()
  await post.arrived
  await expectLocked(page, '8')

  post.release()
  await expect(page.getByText('Imported imported.json.')).toBeVisible()
  await expect(fw03Days(page)).toHaveValue('11')
  expect(await (await page.request.get('/api/release')).json()).toEqual(imported)
  expect(writes, 'the import is the only write: ⌘S and Save sent no PUT').toEqual(['POST /api/import'])
})

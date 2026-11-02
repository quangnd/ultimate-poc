import { copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect } from '@playwright/test'
import { test } from './api'

const fixture = (name: string) => resolve(import.meta.dirname, '../fixtures', name)

test('a stored release that fails validation shows the notice and no forecast until the file is fixed and checked again', async ({ page, api }) => {
  const stored = join(api.dataDir, 'release.json')
  const notice = page.getByRole('heading', { name: "The stored release can't be used" })
  const forecast = page.getByRole('heading', { name: /Forecast vs target/ })
  const summary = page.getByRole('region', { name: 'Summary' })

  // The store holds the cycle variant: well-formed JSON that fails validation (FW-05 -> SEC-04 -> SEC-03 -> FW-05).
  await copyFile(fixture('cycle-variant.json'), stored)
  await page.goto('/')

  // The notice names the error and offers the retry; nothing of the dashboard is shown next to it.
  await expect(notice).toBeVisible()
  await expect(page.getByText('The stored file failed validation')).toBeVisible()
  await expect(page.getByRole('heading', { name: '1 problem' })).toBeVisible()
  await expect(page.getByText(/dependency cycle: .*FW-05/)).toBeVisible()
  await expect(page.locator('.problems code', { hasText: 'cycle' })).toBeVisible()
  await expect(summary).toHaveCount(0)
  await expect(forecast).toHaveCount(0)

  // Fix the file on disk, then "Check again" reloads it: the dashboard and its forecast replace the notice.
  await copyFile(fixture('release.json'), stored)
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(summary).toContainText(/Estimated finish\s*Wed 10 Feb 2027/)
  await expect(forecast).toBeVisible()
  await expect(notice).toHaveCount(0)
})

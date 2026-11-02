import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { startServer } from '../../src/server/main'
import { checkImport, importRelease } from '../../src/web/transfer'

// Integration (issue #21, reviewer #5740): export through the real API, check it as the UI does, import it into a
// second store through the real API, then compare the stored file and the re-exported bytes.

let dirs: string[] = []
let closers: (() => Promise<void>)[] = []
const server = async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rrl-transfer-'))
  dirs.push(dataDir)
  const s = await startServer({ port: 0, dataDir })
  closers.push(s.close)
  return { ...s, file: join(dataDir, 'release.json') }
}
beforeEach(() => {
  dirs = []
  closers = []
})
afterEach(async () => {
  await Promise.all(closers.map((close) => close()))
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

it('export → check → import → export round-trips the stored release byte for byte', async () => {
  const source = await server()
  const fixture = readFileSync('fixtures/release.json', 'utf8')
  expect(await importRelease(fixture, source.url)).toEqual({ kind: 'imported' })

  const exported = await (await fetch(`${source.url}/api/export`)).text()
  const check = checkImport(exported)
  if (check.kind !== 'ready') throw new Error(`expected ready, got ${check.kind}`)

  const target = await server()
  expect(await importRelease(check.text, target.url)).toEqual({ kind: 'imported' })
  expect(await readFile(target.file, 'utf8')).toBe(await readFile(source.file, 'utf8'))
  expect(await (await fetch(`${target.url}/api/export`)).text()).toBe(exported)
})

it('a refused import leaves the stored file unchanged', async () => {
  const s = await server()
  await importRelease(readFileSync('fixtures/release.json', 'utf8'), s.url)
  const before = await readFile(s.file, 'utf8')
  const outcome = await importRelease(readFileSync('fixtures/cycle-variant.json', 'utf8'), s.url)
  expect(outcome).toMatchObject({ kind: 'refused', errors: [{ code: 'cycle' }] })
  expect(await readFile(s.file, 'utf8')).toBe(before)
})

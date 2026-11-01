import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReleaseDocument } from '../../src/domain/types'
import { createStore } from '../../src/server/store'

// Integration tests: the real file system, in a temp directory removed after each test (ADR-001 §3, issue #18).

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8')) as ReleaseDocument
const good = fixture('release.json')
const cyclic = fixture('cycle-variant.json')
const serialized = (doc: unknown) => JSON.stringify(doc, null, 2) + '\n'

/** A valid document that differs from the fixture by one title, so a save visibly changes the file. */
const variant = (n: number): ReleaseDocument => {
  const doc = structuredClone(good)
  doc.tasks[0]!.title = `Variant ${n}`
  return doc
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rrl-store-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createStore', () => {
  it('keeps the document in <dir>/release.json and reports a missing file without creating one', async () => {
    const store = createStore(dir)
    expect(store.file).toBe(join(dir, 'release.json'))
    expect(await store.load()).toEqual({ ok: false, missing: true })
    expect(await readdir(dir)).toEqual([])
  })

  it('round-trips a saved document and writes it as JSON.stringify(doc, null, 2) plus a newline', async () => {
    const store = createStore(dir)
    expect(await store.save(good)).toEqual({ ok: true })
    expect(await store.load()).toEqual({ ok: true, document: good })
    expect(await readFile(store.file, 'utf8')).toBe(serialized(good))
    expect(await readdir(dir)).toEqual(['release.json'])
  })

  it('creates the data directory, nested if needed', async () => {
    const store = createStore(join(dir, 'a', 'data'))
    expect(await store.save(good)).toEqual({ ok: true })
    expect(await store.load()).toEqual({ ok: true, document: good })
  })

  it('refuses an invalid document with all its errors and leaves the stored file byte-identical', async () => {
    const store = createStore(dir)
    await store.save(good)
    const before = await readFile(store.file)

    const twoProblems = { ...structuredClone(good), schemaVersion: 2, workstreams: 'FW' }
    const refused = await store.save(twoProblems)
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['invalid-schema-version', 'invalid-workstreams']))

    const cycle = await store.save(cyclic)
    expect(cycle).toMatchObject({ ok: false, errors: [{ code: 'cycle' }] })

    expect((await readFile(store.file)).equals(before)).toBe(true)
    expect(await readdir(dir)).toEqual(['release.json'])
  })

  it('does not create the directory or the file for an invalid first save', async () => {
    const store = createStore(join(dir, 'data'))
    expect(await store.save({})).toMatchObject({ ok: false })
    expect(await readdir(dir)).toEqual([])
  })

  it('refuses a corrupt file on load as invalid JSON and never repairs it', async () => {
    const store = createStore(dir)
    const garbage = '{"schemaVersion": 1, "release": '
    await writeFile(store.file, garbage)

    const result = await store.load()
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'invalid-json' }] })
    if (!result.ok && !result.missing) expect(result.errors[0]!.message).not.toBe('')
    expect(await readFile(store.file, 'utf8')).toBe(garbage)
  })

  it('refuses a parseable file that is not a valid document, with the validator errors, and never repairs it', async () => {
    const store = createStore(dir)
    const text = serialized(cyclic)
    await writeFile(store.file, text)
    expect(await store.load()).toMatchObject({ ok: false, errors: [{ code: 'cycle' }] })
    expect(await readFile(store.file, 'utf8')).toBe(text)

    await writeFile(store.file, '[]')
    expect(await store.load()).toMatchObject({ ok: false, errors: [{ code: 'invalid-document' }] })
    expect(await readFile(store.file, 'utf8')).toBe('[]')
  })

  it('survives a simulated crash between the tmp write and the rename: the old file stays good, the next save cleans up', async () => {
    const store = createStore(dir)
    await store.save(good)
    const tmp = join(dir, 'release.json.tmp')
    await writeFile(tmp, '{"schemaVersion": 1, "tas') // half-written replacement left by a crash

    expect(await store.load()).toEqual({ ok: true, document: good })
    expect(await readFile(tmp, 'utf8')).toBe('{"schemaVersion": 1, "tas')

    const next = variant(1)
    expect(await store.save(next)).toEqual({ ok: true })
    expect(await store.load()).toEqual({ ok: true, document: next })
    expect(await readFile(store.file, 'utf8')).toBe(serialized(next))
    expect(await readdir(dir)).toEqual(['release.json'])
  })

  it('serializes concurrent saves: the last call wins and the file is never partial', async () => {
    const store = createStore(dir)
    const docs = Array.from({ length: 20 }, (_, i) => variant(i))
    const results = await Promise.all(docs.map((d) => store.save(d)))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await readFile(store.file, 'utf8')).toBe(serialized(docs[19]))
    expect(await readdir(dir)).toEqual(['release.json'])
  })

  it('keeps saving after a refused save or a failed write', async () => {
    const blocker = join(dir, 'blocker')
    await writeFile(blocker, 'a file where the data directory should go')
    const store = createStore(join(blocker, 'data'))

    const [first, refused, failed] = await Promise.allSettled([store.save(good), store.save({}), store.save(good)])
    expect(first.status).toBe('rejected')
    expect(refused).toMatchObject({ status: 'fulfilled', value: { ok: false } })
    expect(failed.status).toBe('rejected')

    await rm(blocker)
    await mkdir(blocker)
    expect(await store.save(variant(7))).toEqual({ ok: true })
    expect(await store.load()).toEqual({ ok: true, document: variant(7) })
  })
})

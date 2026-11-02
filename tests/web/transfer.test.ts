import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateDocument } from '../../src/domain/validate'
import { checkImport, MAX_IMPORT_BYTES, summarize } from '../../src/web/transfer'

const text = (name: string) => readFileSync(`fixtures/${name}`, 'utf8')
/** What GET /api/export serves: the stored file, which the store writes as pretty JSON plus a newline. */
const exported = (doc: unknown) => JSON.stringify(doc, null, 2) + '\n'

describe('checkImport', () => {
  it('round-trips export → import exactly: the bytes sent are the bytes exported, and the content is unchanged', () => {
    const stored = validateDocument(JSON.parse(text('release.json')))
    if (!stored.ok) throw new Error('fixture must be valid')
    const file = exported(stored.document)

    const check = checkImport(file)
    if (check.kind !== 'ready') throw new Error(`expected ready, got ${check.kind}`)
    expect(check.text).toBe(file)
    expect(check.document).toEqual(stored.document)
    // What the server will store from this import is what was exported.
    expect(exported(JSON.parse(check.text))).toBe(file)
  })

  it('summarises the sample: 24 tasks, 5 streams, start and target dates', () => {
    const check = checkImport(text('release.json'))
    if (check.kind !== 'ready') throw new Error(`expected ready, got ${check.kind}`)
    expect(check.summary).toEqual({
      tasks: 24,
      byStatus: { todo: 15, in_progress: 5, done: 4 },
      streams: ['FW', 'SPS', 'Security', 'App', 'QA'],
      startDate: '2027-01-04',
      targetDate: '2027-02-12',
    })
  })

  it('refuses the cycle variant with the cycle error', () => {
    const check = checkImport(text('cycle-variant.json'))
    expect(check.kind).toBe('invalid')
    if (check.kind !== 'invalid') return
    expect(check.errors).toEqual([expect.objectContaining({ code: 'cycle', cycle: ['FW-05', 'SEC-04', 'SEC-03'] })])
  })

  it('says a non-JSON file is not JSON', () => {
    expect(checkImport('name,stream\nFW-01,FW\n').kind).toBe('not-json')
    expect(checkImport('').kind).toBe('not-json')
  })

  it('reports JSON that is not a release as invalid, not as broken JSON', () => {
    const check = checkImport('[1, 2, 3]')
    expect(check.kind === 'invalid' && check.errors[0]!.code).toBe('invalid-document')
  })

  it('refuses a file over the API limit before parsing it', () => {
    expect(checkImport('not even json', MAX_IMPORT_BYTES + 1)).toEqual({ kind: 'too-large', bytes: MAX_IMPORT_BYTES + 1 })
    expect(checkImport(exported({ pad: 'x'.repeat(MAX_IMPORT_BYTES) })).kind).toBe('too-large')
  })

  it('accepts a file saved with a byte-order mark and sends it without one', () => {
    const check = checkImport('\uFEFF' + text('release.json'))
    expect(check.kind).toBe('ready')
    if (check.kind === 'ready') expect(check.text).toBe(text('release.json'))
  })

  it('summarises a release without a target date', () => {
    const stored = validateDocument(JSON.parse(text('release.json')))
    if (!stored.ok) throw new Error('fixture must be valid')
    const { targetDate: _, ...release } = stored.document.release
    expect(summarize({ ...stored.document, release }).targetDate).toBeUndefined()
  })
})

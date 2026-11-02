import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ReleaseDocument } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'
import {
  addTask,
  changesOf,
  check,
  cycleLinks,
  deleteTask,
  draftFrom,
  parseEstimate,
  placeErrors,
  restoreTask,
  suggestId,
  toDocument,
  type Draft,
  type DraftTask,
} from '../../src/web/draft'

function fixture(): ReleaseDocument {
  const result = validateDocument(JSON.parse(readFileSync('fixtures/release.json', 'utf8')))
  if (!result.ok) throw new Error('fixture must be valid')
  return result.document
}

const keyOf = (draft: Draft, id: string) => draft.tasks.find((t) => t.id === id)!.key
const set = (draft: Draft, id: string, patch: Partial<DraftTask>): Draft => ({
  ...draft,
  tasks: draft.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
})
const errorsOf = (base: ReleaseDocument, draft: Draft) => {
  const c = check(base, draft)
  if (c.ok) throw new Error('expected the draft to be refused')
  return c.errors
}

describe('draft round trip', () => {
  const base = fixture()

  it('an untouched draft is the stored document, byte for byte, with no changes', () => {
    const draft = draftFrom(base)
    expect(JSON.stringify(toDocument(base, draft))).toBe(JSON.stringify(base))
    expect(changesOf(base, draft).any).toBe(false)
  })

  it('FW-03 from 5 to 8 moves the forecast to day 30, Mon 15 Feb 2027', () => {
    const c = check(base, set(draftFrom(base), 'FW-03', { estimate: '8' }))
    expect(c.ok && [c.forecast.finish, c.forecast.finishDate]).toEqual([30, '2027-02-15'])
  })

  it('clearing a target date or a gate drops the key instead of storing an empty string', () => {
    const doc = toDocument(base, set(set(draftFrom(base), 'FW-02', { targetDate: '' }), 'FW-06', { gate: '' })) as ReleaseDocument
    expect('targetDate' in doc.tasks.find((t) => t.id === 'FW-02')!).toBe(false)
    expect('gate' in doc.tasks.find((t) => t.id === 'FW-06')!).toBe(false)
  })
})

describe('parseEstimate keeps what was typed for the validator to judge', () => {
  it.each([
    ['8', 8],
    [' 8 ', 8],
    // Fractions stay text, so the validator refuses them and the field keeps them (reviewer #5081: Number() rounded
    // "1.0000000000000001" to 1 and it was stored as 1).
    ['1.5', '1.5'],
    ['1.0000000000000001', '1.0000000000000001'],
    ['0.99999999999999999', '0.99999999999999999'],
    ['3.0', 3],
    ['-2', -2],
    ['', ''],
    ['3d', '3d'],
    ['1e3', '1e3'],
  ])('%j -> %j', (text, value) => expect(parseEstimate(text)).toBe(value))
})

describe('refused drafts', () => {
  const base = fixture()

  it('a fractional estimate is refused on its task and field', () => {
    const draft = set(draftFrom(base), 'FW-03', { estimate: '1.5' })
    const placed = placeErrors(errorsOf(base, draft), draft)
    expect(placed).toEqual([expect.objectContaining({ field: 'estimate', keys: [keyOf(draft, 'FW-03')] })])
    expect(placed[0]!.error.code).toBe('invalid-estimate')
  })

  it('a cycle is placed on every task in it, with the links that close it', () => {
    const draft = set(draftFrom(base), 'FW-01', { predecessors: ['FW-03'] })
    const errors = errorsOf(base, draft)
    expect(errors.map((e) => e.cycle)).toEqual([['FW-03', 'FW-02', 'FW-01']])
    const [placed] = placeErrors(errors, draft)
    expect(placed!.field).toBe('predecessors')
    expect(placed!.keys.sort()).toEqual(['FW-01', 'FW-02', 'FW-03'].map((id) => keyOf(draft, id)).sort())
    expect([...cycleLinks(errors)].sort()).toEqual(['FW-01>FW-03', 'FW-02>FW-01', 'FW-03>FW-02'])
  })

  it('reports every error at once: negative estimate, missing id, duplicate id, duplicate gate', () => {
    let draft = draftFrom(base)
    draft = set(draft, 'FW-04', { estimate: '-2' })
    draft = set(draft, 'SPS-01', { id: '' })
    draft = set(draft, 'SPS-02', { id: 'SPS-03' })
    draft = set(draft, 'APP-05', { gate: 'fw-integrated' })
    const placed = placeErrors(errorsOf(base, draft), draft)
    const codes = placed.map((p) => p.error.code)
    expect(codes).toEqual(expect.arrayContaining(['invalid-estimate', 'missing-id', 'duplicate-id', 'duplicate-gate']))

    const missing = placed.find((p) => p.error.code === 'missing-id')!
    expect(missing.keys).toEqual([base.tasks.findIndex((t) => t.id === 'SPS-01')])
    const gate = placed.find((p) => p.error.code === 'duplicate-gate')!
    expect(gate.keys).toEqual([base.tasks.findIndex((t) => t.id === 'FW-06'), base.tasks.findIndex((t) => t.id === 'APP-05')])
    // With SPS-03 twice, an unknown link is placed only on the task that holds it.
    const unknownSps02 = placed.find((p) => p.error.message === 'unknown predecessor SPS-02 on task SPS-03')!
    expect(unknownSps02.keys).toEqual([base.tasks.findIndex((t) => t.id === 'SPS-03')])
    // Every error lands on at least one task.
    expect(placed.every((p) => p.keys.length > 0)).toBe(true)
  })
})

describe('delete: dependents keep their links, so the validator names them', () => {
  const base = fixture()

  it('deleting FW-05 refuses the save with unknown predecessors on FW-06 and SEC-03', () => {
    const draft = deleteTask(draftFrom(base), keyOf(draftFrom(base), 'FW-05'))
    expect(draft.tasks.find((t) => t.id === 'FW-06')!.predecessors).toEqual(['FW-05'])
    const errors = errorsOf(base, draft)
    expect(errors.map((e) => [e.code, e.taskId])).toEqual([
      ['unknown-predecessor', 'FW-06'],
      ['unknown-predecessor', 'SEC-03'],
    ])
    expect(changesOf(base, draft).deleted).toEqual([{ key: 4, id: 'FW-05' }])
  })

  it('a task nobody depends on deletes cleanly', () => {
    // QA-04 is the end of the plan: nothing waits for it.
    const clean = check(base, deleteTask(draftFrom(base), keyOf(draftFrom(base), 'QA-04')))
    expect(clean.ok).toBe(true)
  })

  it('restore puts the stored task back in its place', () => {
    const draft = deleteTask(draftFrom(base), 4)
    const restored = restoreTask(base, draft, 4)
    expect(JSON.stringify(toDocument(base, restored))).toBe(JSON.stringify(base))
    expect(changesOf(base, restored).any).toBe(false)
  })
})

describe('add', () => {
  const base = fixture()

  it('suggests the next id in the stream pattern', () => {
    expect(suggestId(draftFrom(base), 'FW')).toBe('FW-07')
    expect(suggestId(draftFrom(base), 'Security')).toBe('SEC-06')
    expect(suggestId({ tasks: [], nextKey: 0 }, 'Security')).toBe('SEC-01')
  })

  // Regression (reviewer #5081): an unsafe numeric suffix never advanced, so this looped forever.
  it('terminates beside an id whose number is past the safe integer range', () => {
    const draft = draftFrom({ ...base, tasks: [{ ...base.tasks[0]!, id: 'FW-9007199254740992' }] })
    expect(suggestId(draft, 'FW')).toBe('FW-01')
  })

  it('a new task is valid once it has an id, and counts as added', () => {
    const { draft, key } = addTask(draftFrom(base), 'QA')
    expect(check(base, draft).ok).toBe(true)
    const changes = changesOf(base, draft)
    expect([...changes.added]).toEqual([key])
    expect(changes.edited.size).toBe(0)
  })
})

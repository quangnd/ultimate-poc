// EXP-08 task 1 hidden acceptance suite. Written before any arm ran; no arm sees it.
// Grading: copy to tests/hidden/ of the arm's tree and run `npx vitest run tests/hidden`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addLink, removeLink } from '../../src/domain/links'
import type { ReleaseDocument } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'

const load = () =>
  JSON.parse(readFileSync(new URL('../../fixtures/release.json', import.meta.url), 'utf8')) as ReleaseDocument
const pred = (doc: ReleaseDocument, id: string) => doc.tasks.find((t) => t.id === id)!.predecessors

describe('task 1 hidden', () => {
  it('H1 addLink appends the predecessor, keeps order and every other task', () => {
    const doc = load()
    const r = addLink(doc, 'SPS-04', 'SEC-02')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(pred(r.document, 'SPS-04')).toEqual(['SPS-03', 'FW-04', 'SEC-02'])
    const expected = load()
    expected.tasks.find((t) => t.id === 'SPS-04')!.predecessors.push('SEC-02')
    expect(r.document).toEqual(expected)
    expect(validateDocument(r.document).ok).toBe(true)
  })

  it('H2 removeLink removes only that predecessor, keeping the order of the rest', () => {
    const doc = load()
    const r = removeLink(doc, 'QA-03', 'APP-05')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(pred(r.document, 'QA-03')).toEqual(['QA-02', 'SEC-05'])
    const expected = load()
    expected.tasks.find((t) => t.id === 'QA-03')!.predecessors = ['QA-02', 'SEC-05']
    expect(r.document).toEqual(expected)
    expect(validateDocument(r.document).ok).toBe(true)
  })

  it('H3 neither function mutates its input, on success or failure', () => {
    const doc = load()
    const snapshot = JSON.stringify(doc)
    addLink(doc, 'SPS-04', 'SEC-02')
    addLink(doc, 'FW-01', 'QA-04') // cycle
    addLink(doc, 'nope', 'FW-01')
    removeLink(doc, 'QA-03', 'APP-05')
    removeLink(doc, 'QA-03', 'FW-01')
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('H4 unknown task gives exactly one unknown-task error (both functions)', () => {
    for (const r of [addLink(load(), 'NOPE', 'FW-01'), removeLink(load(), 'NOPE', 'FW-01')]) {
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.errors).toHaveLength(1)
      expect(r.errors[0]!.code).toBe('unknown-task')
      expect(r.errors[0]!.taskId).toBe('NOPE')
    }
  })

  it('H5 unknown predecessor is rejected with unknown-predecessor only', () => {
    const r = addLink(load(), 'FW-03', 'GHOST')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.map((e) => e.code)).toEqual(['unknown-predecessor'])
  })

  it('H6 self link is rejected with self-predecessor only (no cycle error too)', () => {
    const r = addLink(load(), 'FW-03', 'FW-03')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.map((e) => e.code)).toEqual(['self-predecessor'])
  })

  it('H7 an existing link is rejected with repeated-predecessor only', () => {
    const r = addLink(load(), 'FW-03', 'FW-02')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.map((e) => e.code)).toEqual(['repeated-predecessor'])
  })

  it('H8 a two-task cycle is rejected with the validator cycle and message', () => {
    const doc = load()
    const r = addLink(doc, 'FW-02', 'FW-03')
    expect(r.ok).toBe(false)
    if (r.ok) return
    const bad = load()
    bad.tasks.find((t) => t.id === 'FW-02')!.predecessors.push('FW-03')
    const v = validateDocument(bad)
    if (v.ok) throw new Error('reference: expected a cycle')
    const ref = v.errors.find((e) => e.code === 'cycle')!
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]!.code).toBe('cycle')
    expect(r.errors[0]!.cycle).toEqual(ref.cycle)
    expect(r.errors[0]!.message).toBe(ref.message)
  })

  it('H9 a long cross-stream cycle is rejected with the validator cycle', () => {
    const r = addLink(load(), 'FW-01', 'QA-04')
    expect(r.ok).toBe(false)
    if (r.ok) return
    const bad = load()
    bad.tasks.find((t) => t.id === 'FW-01')!.predecessors.push('QA-04')
    const v = validateDocument(bad)
    if (v.ok) throw new Error('reference: expected a cycle')
    const ref = v.errors.find((e) => e.code === 'cycle')!
    expect(r.errors.map((e) => e.code)).toEqual(['cycle'])
    expect(r.errors[0]!.cycle).toEqual(ref.cycle)
    expect(r.errors[0]!.message).toBe(ref.message)
  })

  it('H10 removeLink of a link that does not exist gives unknown-link', () => {
    const r = removeLink(load(), 'QA-03', 'FW-01')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]!.code).toBe('unknown-link')
    expect(r.errors[0]!.taskId).toBe('QA-03')
  })

  it('H11 add then remove round-trips to the original document', () => {
    const doc = load()
    const added = addLink(doc, 'APP-04', 'SEC-01')
    if (!added.ok) throw new Error('add failed')
    const removed = removeLink(added.document, 'APP-04', 'SEC-01')
    if (!removed.ok) throw new Error('remove failed')
    expect(removed.document).toEqual(load())
  })

  it('H12 deterministic: same input gives deep-equal output', () => {
    expect(addLink(load(), 'SPS-04', 'SEC-02')).toEqual(addLink(load(), 'SPS-04', 'SEC-02'))
    expect(addLink(load(), 'FW-01', 'QA-04')).toEqual(addLink(load(), 'FW-01', 'QA-04'))
  })
})

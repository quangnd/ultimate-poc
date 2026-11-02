// EXP-08 task 2 hidden acceptance suite. Written before any arm ran; no arm sees it.
// Grading: copy to tests/hidden/ of the arm's tree and run `npx vitest run tests/hidden`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gateStatus } from '../../src/domain/gates'
import { schedule } from '../../src/domain/schedule'
import { GATES, type ReleaseDocument } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'

const load = () =>
  JSON.parse(readFileSync(new URL('../../fixtures/release.json', import.meta.url), 'utf8')) as ReleaseDocument
const task = (doc: ReleaseDocument, id: string) => doc.tasks.find((t) => t.id === id)!
/** Remove a gate flag; a 0-day task must be a gate (ADR-002 §2), so it becomes a 1-day task. */
const ungate = (doc: ReleaseDocument, id: string) => {
  const t = task(doc, id)
  delete t.gate
  if (t.estimateDays === 0) t.estimateDays = 1
}

describe('task 2 hidden', () => {
  it('H1 four entries in GATES order', () => {
    expect(gateStatus(load()).map((g) => g.gate)).toEqual([...GATES])
  })

  it('H2 order is independent of task order', () => {
    const doc = load()
    const reversed = { ...doc, tasks: [...doc.tasks].reverse() }
    expect(JSON.stringify(gateStatus(reversed))).toBe(JSON.stringify(gateStatus(doc)))
  })

  it('H3 fixture: exact entry for fw-integrated (FW-06)', () => {
    const doc = load()
    const f = schedule(doc).tasks.find((t) => t.id === 'FW-06')!
    expect(gateStatus(doc)[0]).toEqual({
      gate: 'fw-integrated',
      defined: true,
      taskId: 'FW-06',
      status: 'todo',
      done: false,
      forecastFinishDate: f.finishDate,
      targetDate: '2027-01-22',
      slipDays: f.slipDays,
    })
  })

  it('H4 fixture: every defined gate matches the scheduler', () => {
    const doc = load()
    const slots = new Map(schedule(doc).tasks.map((t) => [t.id, t]))
    for (const g of gateStatus(doc)) {
      const s = slots.get(g.taskId!)!
      expect(g.defined).toBe(true)
      expect(g.forecastFinishDate).toBe(s.finishDate)
      expect(g.slipDays).toBe(s.slipDays)
      expect(g.targetDate).toBe(task(doc, g.taskId!).targetDate)
    }
  })

  it('H5 a missing gate is exactly { gate, defined: false, done: false }', () => {
    const doc = load()
    ungate(doc, 'SEC-05')
    expect(validateDocument(doc).ok).toBe(true)
    const entry = gateStatus(doc)[1]!
    expect(entry).toStrictEqual({ gate: 'security-verified', defined: false, done: false })
    expect(Object.keys(entry).sort()).toEqual(['defined', 'done', 'gate'])
  })

  it('H6 done gate gives done: true and status done', () => {
    const doc = load()
    task(doc, 'FW-06').status = 'done'
    const entry = gateStatus(doc)[0]!
    expect(entry.done).toBe(true)
    expect(entry.status).toBe('done')
    const s = schedule(doc).tasks.find((t) => t.id === 'FW-06')!
    expect(entry.forecastFinishDate).toBe(s.finishDate)
  })

  it('H7 in_progress gate is not done', () => {
    const doc = load()
    task(doc, 'QA-04').status = 'in_progress'
    const entry = gateStatus(doc)[3]!
    expect(entry.status).toBe('in_progress')
    expect(entry.done).toBe(false)
  })

  it('H8 a gate without targetDate has no targetDate and no slipDays keys', () => {
    const doc = load()
    delete task(doc, 'APP-05').targetDate
    const entry = gateStatus(doc)[2]!
    expect(entry.defined).toBe(true)
    expect('targetDate' in entry).toBe(false)
    expect('slipDays' in entry).toBe(false)
    expect(typeof entry.forecastFinishDate).toBe('string')
  })

  it('H9 a non-zero-estimate gate on a later task follows the scheduler', () => {
    const doc = load()
    const t = task(doc, 'SEC-04')
    ungate(doc, 'SEC-05')
    t.gate = 'security-verified'
    t.targetDate = '2027-01-04'
    expect(validateDocument(doc).ok).toBe(true)
    const s = schedule(doc).tasks.find((x) => x.id === 'SEC-04')!
    const entry = gateStatus(doc)[1]!
    expect(entry.taskId).toBe('SEC-04')
    expect(entry.forecastFinishDate).toBe(s.finishDate)
    expect(entry.slipDays).toBe(s.slipDays)
    expect(entry.slipDays).toBeGreaterThan(0)
  })

  it('H10 no gates at all: four undefined entries', () => {
    const doc = load()
    for (const t of doc.tasks) ungate(doc, t.id)
    expect(validateDocument(doc).ok).toBe(true)
    expect(gateStatus(doc)).toStrictEqual(GATES.map((gate) => ({ gate, defined: false, done: false })))
  })

  it('H11 no undefined or null values anywhere; input not mutated; deterministic', () => {
    const doc = load()
    delete task(doc, 'APP-05').targetDate
    ungate(doc, 'SEC-05')
    const before = JSON.stringify(doc)
    const a = gateStatus(doc)
    expect(JSON.stringify(doc)).toBe(before)
    for (const e of a) for (const v of Object.values(e)) expect(v === undefined || v === null).toBe(false)
    expect(JSON.stringify(gateStatus(doc))).toBe(JSON.stringify(a))
  })
})

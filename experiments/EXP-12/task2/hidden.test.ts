// EXP-12 task 2 hidden acceptance suite. Written before any arm ran; no arm sees it.
// Grading: copy to tests/hidden/ of the arm's tree and run `npx vitest run tests/hidden`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ReleaseDocument } from '../../src/domain/types'
import { delayImpact } from '../../src/domain/whatif'

const load = () =>
  JSON.parse(readFileSync(new URL('../../fixtures/release.json', import.meta.url), 'utf8')) as ReleaseDocument

describe('EXP-12 task 2 hidden', () => {
  it('H1 firmware-delay scenario (FW-03 +3)', () => {
    expect(delayImpact(load(), 'FW-03', 3)).toEqual({
      ok: true,
      impact: {
        taskId: 'FW-03', extraDays: 3, beforeFinishDate: '2027-02-10', afterFinishDate: '2027-02-15',
        deltaWorkingDays: 3, beforeSlipDays: -2, afterSlipDays: 1, onDrivingChain: true,
      },
    })
  })

  it('H2 a task off the driving chain with slack: finish does not move', () => {
    expect(delayImpact(load(), 'APP-04', 2)).toEqual({
      ok: true,
      impact: {
        taskId: 'APP-04', extraDays: 2, beforeFinishDate: '2027-02-10', afterFinishDate: '2027-02-10',
        deltaWorkingDays: 0, beforeSlipDays: -2, afterSlipDays: -2, onDrivingChain: false,
      },
    })
  })

  it('H3 driving-chain task QA-03 +4 crosses a weekend: +4 working days', () => {
    const r = delayImpact(load(), 'QA-03', 4)
    expect(r.ok && r.impact).toMatchObject({ afterFinishDate: '2027-02-16', deltaWorkingDays: 4, afterSlipDays: 2, onDrivingChain: true })
  })

  it('H4 a 0-day gate task can be delayed (SEC-05 +2)', () => {
    const r = delayImpact(load(), 'SEC-05', 2)
    expect(r.ok && r.impact).toMatchObject({ afterFinishDate: '2027-02-12', deltaWorkingDays: 2, afterSlipDays: 0, onDrivingChain: true })
  })

  it('H4b onDrivingChain is read BEFORE the delay: SPS-04 +5 joins the chain only after it', () => {
    const r = delayImpact(load(), 'SPS-04', 5)
    expect(r.ok && r.impact).toMatchObject({ afterFinishDate: '2027-02-12', deltaWorkingDays: 2, onDrivingChain: false })
  })

  it('H5 no release targetDate: both slips are null', () => {
    const doc = load()
    delete doc.release.targetDate
    const r = delayImpact(doc, 'FW-03', 3)
    expect(r.ok && r.impact).toMatchObject({ deltaWorkingDays: 3, beforeSlipDays: null, afterSlipDays: null })
  })

  it('H6 unknown task id', () => {
    const r = delayImpact(load(), 'NOPE-1', 3)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('unknown-task')
    expect(r.error.message).toContain('NOPE-1')
  })

  it('H7 done task is refused', () => {
    const r = delayImpact(load(), 'FW-01', 3)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('done-task')
    expect(r.error.message).toContain('FW-01')
  })

  it('H8 invalid extraDays: 0, negative, fractional, NaN, Infinity', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = delayImpact(load(), 'FW-03', bad)
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.error.code).toBe('invalid-days')
      expect(r.error.message.length).toBeGreaterThan(0)
    }
  })

  it('H9 error order: unknown task before done before invalid days', () => {
    const a = delayImpact(load(), 'NOPE-1', 0)
    expect(!a.ok && a.error.code).toBe('unknown-task')
    const b = delayImpact(load(), 'FW-01', 0)
    expect(!b.ok && b.error.code).toBe('done-task')
  })

  it('H10 input never mutated, on success or failure', () => {
    const doc = load()
    const snapshot = JSON.stringify(doc)
    delayImpact(doc, 'FW-03', 3)
    delayImpact(doc, 'FW-01', 3)
    delayImpact(doc, 'FW-03', -2)
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('H11 order-independent: reversed tasks, predecessors and workstreams', () => {
    const doc = load()
    const shuffled = structuredClone(doc)
    shuffled.tasks.reverse()
    for (const t of shuffled.tasks) t.predecessors.reverse()
    shuffled.workstreams.reverse()
    for (const [id, n] of [['FW-03', 3], ['APP-04', 2], ['QA-03', 4]] as const)
      expect(delayImpact(shuffled, id, n)).toEqual(delayImpact(doc, id, n))
  })
})

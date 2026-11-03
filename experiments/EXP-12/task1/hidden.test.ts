// EXP-12 task 1 hidden acceptance suite. Written before any arm ran; no arm sees it.
// Grading: copy to tests/hidden/ of the arm's tree and run `npx vitest run tests/hidden`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lateTasks } from '../../src/domain/late'
import type { ReleaseDocument, Task } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'

const load = () =>
  JSON.parse(readFileSync(new URL('../../fixtures/release.json', import.meta.url), 'utf8')) as ReleaseDocument
const task = (doc: ReleaseDocument, id: string) => doc.tasks.find((t) => t.id === id)!
const delayed = () => {
  const doc = load()
  task(doc, 'FW-03').estimateDays = 8
  return doc
}
const mini = (tasks: Partial<Task>[], targetDate?: string): ReleaseDocument => {
  const doc: ReleaseDocument = {
    schemaVersion: 1,
    release: { startDate: '2027-01-04', ...(targetDate ? { targetDate } : {}) },
    workstreams: ['A', 'B'],
    tasks: tasks.map((t) => ({
      title: t.id!,
      stream: 'A',
      ownerRole: 'dev',
      status: 'todo',
      estimateDays: 1,
      predecessors: [],
      ...t,
    })) as Task[],
  }
  expect(validateDocument(doc).ok).toBe(true)
  return doc
}

describe('EXP-12 task 1 hidden', () => {
  it('H1 baseline sample fixture: no task is late', () => {
    expect(lateTasks(load())).toEqual([])
  })

  it('H2 firmware-delay scenario: exact entries, slip desc then id', () => {
    expect(lateTasks(delayed())).toEqual([
      { id: 'FW-06', stream: 'FW', targetDate: '2027-01-22', finishDate: '2027-01-26', slipDays: 2, onDrivingChain: false },
      { id: 'FW-03', stream: 'FW', targetDate: '2027-01-15', finishDate: '2027-01-18', slipDays: 1, onDrivingChain: true },
      { id: 'QA-04', stream: 'QA', targetDate: '2027-02-12', finishDate: '2027-02-15', slipDays: 1, onDrivingChain: false },
      { id: 'SEC-05', stream: 'Security', targetDate: '2027-02-05', finishDate: '2027-02-08', slipDays: 1, onDrivingChain: true },
    ])
  })

  it('H3 done tasks never appear, even with a target long past', () => {
    const doc = delayed()
    task(doc, 'FW-01').targetDate = '2026-01-01'
    task(doc, 'FW-03').status = 'done'
    const ids = lateTasks(doc).map((t) => t.id)
    expect(ids).not.toContain('FW-01')
    expect(ids).not.toContain('FW-03')
  })

  it('H4 slip of exactly 0 is not late; a task without targetDate never appears', () => {
    // A: 5 days from Mon 2027-01-04 finishes Fri 2027-01-08.
    const doc = mini([
      { id: 'A', estimateDays: 5, targetDate: '2027-01-08' },
      { id: 'B', stream: 'B', estimateDays: 9 },
      { id: 'C', stream: 'B', estimateDays: 1, predecessors: ['B'], targetDate: '2027-01-15' },
    ])
    expect(lateTasks(doc)).toEqual([])
  })

  it('H5 weekend target counts like the Friday before (clarification 1)', () => {
    // A finishes Mon 2027-01-11 (6 days); target Sun 2027-01-10 behaves like Fri 2027-01-08 -> slip 1.
    const doc = mini([{ id: 'A', estimateDays: 6, targetDate: '2027-01-10' }])
    expect(lateTasks(doc)).toEqual([
      { id: 'A', stream: 'A', targetDate: '2027-01-10', finishDate: '2027-01-11', slipDays: 1, onDrivingChain: true },
    ])
  })

  it('H6 ties on slipDays are broken by code-unit id order, not localeCompare', () => {
    const doc = mini([
      { id: 'b', estimateDays: 3, targetDate: '2027-01-05' },
      { id: 'B', stream: 'B', estimateDays: 3, targetDate: '2027-01-05' },
    ])
    expect(lateTasks(doc).map((t) => [t.id, t.slipDays])).toEqual([
      ['B', 1],
      ['b', 1],
    ])
  })

  it('H7 in-progress tasks qualify like todo tasks', () => {
    const doc = delayed()
    task(doc, 'FW-02').estimateDays = 6
    const fw02 = lateTasks(doc).find((t) => t.id === 'FW-02')
    expect(fw02).toEqual({
      id: 'FW-02', stream: 'FW', targetDate: '2027-01-08', finishDate: '2027-01-11', slipDays: 1, onDrivingChain: true,
    })
  })

  it('H8 every task done, or no targets: empty array', () => {
    const allDone = load()
    for (const t of allDone.tasks) t.status = 'done'
    expect(lateTasks(allDone)).toEqual([])
    const noTargets = delayed()
    for (const t of noTargets.tasks) delete t.targetDate
    expect(lateTasks(noTargets)).toEqual([])
  })

  it('H9 input is not mutated', () => {
    const doc = delayed()
    const snapshot = JSON.stringify(doc)
    lateTasks(doc)
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('H10 order-independent: reversed tasks, predecessors and workstreams give the same result', () => {
    const doc = delayed()
    const shuffled = structuredClone(doc)
    shuffled.tasks.reverse()
    for (const t of shuffled.tasks) t.predecessors.reverse()
    shuffled.workstreams.reverse()
    expect(lateTasks(shuffled)).toEqual(lateTasks(doc))
  })

  it('H11 deterministic: two calls deep-equal', () => {
    expect(lateTasks(delayed())).toEqual(lateTasks(delayed()))
  })
})

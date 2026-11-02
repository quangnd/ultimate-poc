// EXP-08 task 3 hidden acceptance suite. Written before any arm ran; no arm sees it.
// Grading: copy to tests/hidden/ of the arm's tree and run `npx vitest run tests/hidden`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schedule } from '../../src/domain/schedule'
import { streamSummary } from '../../src/domain/streams'
import type { ReleaseDocument } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'

const load = () =>
  JSON.parse(readFileSync(new URL('../../fixtures/release.json', import.meta.url), 'utf8')) as ReleaseDocument
const task = (doc: ReleaseDocument, id: string) => doc.tasks.find((t) => t.id === id)!
const byStream = (doc: ReleaseDocument) => new Map(streamSummary(doc).map((s) => [s.stream, s]))

describe('task 3 hidden', () => {
  it('H1 one entry per workstream in document order', () => {
    expect(streamSummary(load()).map((s) => s.stream)).toEqual(['FW', 'SPS', 'Security', 'App', 'QA'])
  })

  it('H2 fixture FW: exact summary', () => {
    const doc = load()
    const finish = schedule(doc).tasks.find((t) => t.id === 'FW-06')!.finishDate
    expect(byStream(doc).get('FW')).toEqual({
      stream: 'FW',
      counts: { todo: 4, in_progress: 1, done: 1 },
      total: 6,
      remainingDays: 3 + 5 + 4 + 2 + 0,
      blocked: ['FW-03', 'FW-04', 'FW-05', 'FW-06'],
      forecastFinishDate: finish,
    })
  })

  it('H3 fixture QA: cross-stream blockers, in_progress counts, remaining', () => {
    const qa = byStream(load()).get('QA')!
    expect(qa.counts).toEqual({ todo: 3, in_progress: 1, done: 0 })
    expect(qa.total).toBe(4)
    expect(qa.remainingDays).toBe(12)
    expect(qa.blocked).toEqual(['QA-02', 'QA-03', 'QA-04'])
  })

  it('H4 forecastFinishDate is the latest scheduler finish of each stream', () => {
    const doc = load()
    const f = schedule(doc)
    const finishes = new Map(f.tasks.map((t) => [t.id, t.finishDate]))
    for (const s of streamSummary(doc)) {
      const dates = doc.tasks.filter((t) => t.stream === s.stream).map((t) => finishes.get(t.id)!)
      expect(s.forecastFinishDate).toBe(dates.sort().at(-1))
    }
  })

  it('H5 a stream with no tasks: zeros, empty blocked, null finish', () => {
    const doc = load()
    doc.workstreams.push('Docs')
    expect(validateDocument(doc).ok).toBe(true)
    expect(byStream(doc).get('Docs')).toStrictEqual({
      stream: 'Docs',
      counts: { todo: 0, in_progress: 0, done: 0 },
      total: 0,
      remainingDays: 0,
      blocked: [],
      forecastFinishDate: null,
    })
  })

  it('H6 all-done stream: remaining 0 and the day -1 finish date', () => {
    const doc = load()
    for (const t of doc.tasks) if (t.stream === 'SPS') t.status = 'done'
    const sps = byStream(doc).get('SPS')!
    expect(sps.remainingDays).toBe(0)
    expect(sps.counts).toEqual({ todo: 0, in_progress: 0, done: 4 })
    expect(sps.forecastFinishDate).toBe('2027-01-01') // day0 Mon 2027-01-04, day -1 = Fri 2027-01-01
    // SPS-04 is done but FW-04 is open: listed as blocked (done with open predecessor)
    expect(sps.blocked).toEqual(['SPS-04'])
  })

  it('H7 blocked is in code-unit order, not locale order', () => {
    const doc = load()
    // Rename two FW tasks so locale and code-unit orders differ ("Z" < "a" in code units).
    const rename = (from: string, to: string) => {
      for (const t of doc.tasks) {
        if (t.id === from) t.id = to
        t.predecessors = t.predecessors.map((p) => (p === from ? to : p))
      }
    }
    rename('FW-03', 'fw-a')
    rename('FW-04', 'FW-Z')
    expect(validateDocument(doc).ok).toBe(true)
    const blocked = byStream(doc).get('FW')!.blocked
    expect(blocked).toEqual([...blocked].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(blocked).toEqual(['FW-05', 'FW-06', 'FW-Z', 'fw-a'])
  })

  it('H8 predecessors done do not block', () => {
    const doc = load()
    task(doc, 'FW-02').status = 'done'
    const fw = byStream(doc).get('FW')!
    expect(fw.blocked).toEqual(['FW-04', 'FW-05', 'FW-06'])
    expect(fw.counts).toEqual({ todo: 4, in_progress: 0, done: 2 })
    expect(fw.remainingDays).toBe(11)
  })

  it('H9 result is independent of task and predecessor order', () => {
    const doc = load()
    const shuffled: ReleaseDocument = {
      ...doc,
      tasks: [...doc.tasks].reverse().map((t) => ({ ...t, predecessors: [...t.predecessors].reverse() })),
    }
    expect(JSON.stringify(streamSummary(shuffled))).toBe(JSON.stringify(streamSummary(doc)))
  })

  it('H10 input not mutated; deterministic', () => {
    const doc = load()
    const before = JSON.stringify(doc)
    const a = streamSummary(doc)
    expect(JSON.stringify(doc)).toBe(before)
    expect(streamSummary(doc)).toEqual(a)
  })

  it('H11 counts and total agree for every stream', () => {
    for (const s of streamSummary(load())) {
      expect(Object.keys(s.counts).sort()).toEqual(['done', 'in_progress', 'todo'])
      expect(s.counts.todo + s.counts.in_progress + s.counts.done).toBe(s.total)
    }
  })
})

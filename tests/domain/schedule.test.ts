import { describe, expect, it } from 'vitest'
import { schedule, type ScheduledTask } from '../../src/domain/schedule'
import type { Gate, ReleaseDocument, Status, Task } from '../../src/domain/types'

// Every hand computation below uses day0 = Mon 2026-01-05 unless a test says otherwise:
// day 0 Mon 01-05, 1 Tue 01-06, 2 Wed 01-07, 3 Thu 01-08, 4 Fri 01-09, 5 Mon 01-12, 6 Tue 01-13, 7 Wed 01-14.

const START = '2026-01-05'

function task(
  id: string,
  stream: string,
  estimateDays: number,
  predecessors: string[] = [],
  extra: { status?: Status; targetDate?: string; gate?: Gate } = {},
): Task {
  return { id, title: id, stream, ownerRole: 'owner', status: 'todo', estimateDays, predecessors, ...extra }
}

function doc(tasks: Task[], release: { startDate?: string; targetDate?: string } = {}): ReleaseDocument {
  return {
    schemaVersion: 1,
    release: { startDate: START, ...release },
    workstreams: ['FW', 'SPS', 'Security', 'App', 'QA'],
    tasks,
  }
}

/** Looks a scheduled task up by id; fails the test when it is missing. */
function byId(tasks: ScheduledTask[], id: string): ScheduledTask {
  const found = tasks.find((t) => t.id === id)
  if (!found) throw new Error(`task ${id} not in forecast`)
  return found
}

/** [start, finish] of a task. */
function span(tasks: ScheduledTask[], id: string): [number | undefined, number] {
  const t = byId(tasks, id)
  return [t.start, t.finish]
}

describe('schedule: day 0 and the empty document (ADR-002 §1, §6)', () => {
  it('anchors day 0 at the next Monday when the start date is a weekend', () => {
    // Sat 2026-01-03 -> day0 Mon 2026-01-05; a 1-day task occupies day 0 only.
    const f = schedule(doc([task('A', 'FW', 1)], { startDate: '2026-01-03' }))
    expect(f.day0).toBe('2026-01-05')
    expect(span(f.tasks, 'A')).toEqual([0, 0])
    expect(byId(f.tasks, 'A').finishDate).toBe('2026-01-05')
    expect(schedule(doc([], { startDate: '2026-01-04' })).day0).toBe('2026-01-05') // Sun
    expect(schedule(doc([], { startDate: START })).day0).toBe(START) // Mon stays
  })

  it('finishes at day -1 when there are no tasks', () => {
    // max over no tasks = -1; day -1 from Mon 01-05 is Fri 2026-01-02
    expect(schedule(doc([]))).toEqual({ day0: START, tasks: [], finish: -1, finishDate: '2026-01-02' })
  })
})

describe('schedule: capacity and dependencies (ADR-002 §3-5)', () => {
  it('gives each stream one capacity unit: two independent FW tasks of 2 days serialize', () => {
    // A, B: earliest 0, tie -> A. A = [0,1], FW free at 2. B: earliest max(0, 2) = 2 -> [2,3]; B waits on A.
    const f = schedule(doc([task('B', 'FW', 2), task('A', 'FW', 2)]))
    expect(span(f.tasks, 'A')).toEqual([0, 1])
    expect(span(f.tasks, 'B')).toEqual([2, 3])
    expect(byId(f.tasks, 'A').capacityBinder).toBeUndefined()
    expect(byId(f.tasks, 'B').capacityBinder).toBe('A')
    expect(f.finish).toBe(3)
    expect(f.finishDate).toBe('2026-01-08') // day 3 = Thu
    expect(byId(f.tasks, 'A').finishDate).toBe('2026-01-06') // day 1 = Tue
  })

  it('runs an FW -> App -> QA chain across streams', () => {
    // F FW 2d [0,1]. P App 3d after F: earliest 1+1 = 2 -> [2,4]. Q QA 1d after P: earliest 1+4 = 5 -> [5,5] (Mon 01-12).
    const f = schedule(doc([task('Q', 'QA', 1, ['P']), task('P', 'App', 3, ['F']), task('F', 'FW', 2)]))
    expect(span(f.tasks, 'F')).toEqual([0, 1])
    expect(span(f.tasks, 'P')).toEqual([2, 4])
    expect(span(f.tasks, 'Q')).toEqual([5, 5])
    expect(byId(f.tasks, 'Q').finishDate).toBe('2026-01-12')
    // each is the first task of its stream: nothing to bind capacity
    expect(f.tasks.every((t) => t.capacityBinder === undefined)).toBe(true)
    expect(f.finish).toBe(5)
  })

  it('keeps streams independent except through dependencies', () => {
    // F FW 2d [0,1]; S SPS 3d no predecessors [0,2]: SPS is not delayed by FW.
    const f = schedule(doc([task('F', 'FW', 2), task('S', 'SPS', 3)]))
    expect(span(f.tasks, 'F')).toEqual([0, 1])
    expect(span(f.tasks, 'S')).toEqual([0, 2])
    expect(f.finish).toBe(2)
  })
})

describe('schedule: deterministic tie-breaking (ADR-002 §5)', () => {
  it('breaks equal-earliest ties by smallest id in code-unit order', () => {
    // "B" (0x42) < "a" (0x61): B first although localeCompare would put "a" first.
    // B [0,0], then a: earliest max(0, 1) = 1 -> [1,1], capacity bound by B.
    const f = schedule(doc([task('a', 'FW', 1), task('B', 'FW', 1)]))
    expect(span(f.tasks, 'B')).toEqual([0, 0])
    expect(span(f.tasks, 'a')).toEqual([1, 1])
    expect(byId(f.tasks, 'a').capacityBinder).toBe('B')
  })

  it('compares ids as strings, not numbers', () => {
    // "T10" < "T2" in code-unit order, so T10 is first: T10 [0,0], T2 [1,1].
    const f = schedule(doc([task('T2', 'FW', 1), task('T10', 'FW', 1)]))
    expect(span(f.tasks, 'T10')).toEqual([0, 0])
    expect(span(f.tasks, 'T2')).toEqual([1, 1])
  })

  it('prefers the smallest earliest over the smallest id', () => {
    // P App 1d [0,0]. A FW 1d after P: earliest 1. Z FW 1d no predecessors: earliest 0.
    // Z is scheduled before A although "A" < "Z": Z [0,0], then A: earliest max(1, 1) = 1 -> [1,1], binder Z.
    const f = schedule(doc([task('A', 'FW', 1, ['P']), task('Z', 'FW', 1), task('P', 'App', 1)]))
    expect(span(f.tasks, 'P')).toEqual([0, 0])
    expect(span(f.tasks, 'Z')).toEqual([0, 0])
    expect(span(f.tasks, 'A')).toEqual([1, 1])
    expect(byId(f.tasks, 'A').capacityBinder).toBe('Z')
  })

  it('recomputes earliest after every placement because streamFree moves', () => {
    // P App 1d [0,0]; X FW 2d [0,1] (X < Z, both earliest 0); then FW is free at 2.
    // Y FW 1d after P: earliest max(1, 2) = 2. Z FW 1d: earliest max(0, 2) = 2. Tie -> Y [2,2], then Z [3,3].
    // (Stale earliest values would put Z, earliest 0, before Y, earliest 1.)
    const f = schedule(
      doc([task('Z', 'FW', 1), task('Y', 'FW', 1, ['P']), task('X', 'FW', 2), task('P', 'App', 1)]),
    )
    expect(span(f.tasks, 'X')).toEqual([0, 1])
    expect(span(f.tasks, 'Y')).toEqual([2, 2])
    expect(span(f.tasks, 'Z')).toEqual([3, 3])
    expect(byId(f.tasks, 'Y').capacityBinder).toBe('X')
    expect(byId(f.tasks, 'Z').capacityBinder).toBe('Y')
  })
})

/** Deterministic PRNG (mulberry32) so the shuffles are reproducible without Math.random. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: T[], next: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

describe('schedule: input order never matters (ADR-002 §5)', () => {
  const tasks = [
    task('FW1', 'FW', 2),
    task('FW2', 'FW', 3),
    task('SEC1', 'Security', 2),
    task('APP1', 'App', 2, ['FW1']),
    task('APP2', 'App', 1, ['FW1', 'SEC1']),
    task('QA1', 'QA', 2, ['APP1', 'APP2']),
    task('G', 'FW', 0, ['FW1', 'FW2'], { gate: 'fw-integrated' }),
    task('QA2', 'QA', 1, ['G']),
  ]

  it('matches the hand-computed schedule', () => {
    // Eligible at the start: FW1, FW2, SEC1 (all earliest 0).
    // FW1 [0,1] (FW free 2). SEC1 [0,1] (Security free 2): FW2 is 2 now, SEC1 still 0.
    // Then APP1 (earliest 2), APP2 (earliest 2) and FW2 (earliest 2) tie; APP1 < APP2 < FW2.
    // APP1 [2,3] (App free 4). FW2 earliest 2 -> [2,4] (binder FW1, FW free 5). APP2 earliest max(2, 4) = 4 -> [4,4] (binder APP1).
    // G: preds FW1 1, FW2 4 -> earliest 5, start 5, finish 4, no binder. QA1: preds APP1 3, APP2 4 -> earliest 5.
    // Tie at 5: G < QA1. QA1 [5,6], QA2 (after G): earliest max(5, 7) = 7 -> [7,7], binder QA1.
    const f = schedule(doc(tasks))
    const summary = f.tasks.map((t) => [t.id, t.start, t.finish, t.capacityBinder])
    expect(summary).toEqual([
      ['APP1', 2, 3, undefined],
      ['APP2', 4, 4, 'APP1'],
      ['FW1', 0, 1, undefined],
      ['FW2', 2, 4, 'FW1'],
      ['G', 5, 4, undefined],
      ['QA1', 5, 6, undefined],
      ['QA2', 7, 7, 'QA1'],
      ['SEC1', 0, 1, undefined],
    ])
    expect(f.finish).toBe(7)
    expect(f.finishDate).toBe('2026-01-14') // day 7 = Wed
  })

  it('gives a byte-identical forecast for shuffled task and predecessor order', () => {
    const baseline = JSON.stringify(schedule(doc(tasks)))
    expect(JSON.parse(baseline).tasks.map((t: ScheduledTask) => t.id)).toEqual(
      ['APP1', 'APP2', 'FW1', 'FW2', 'G', 'QA1', 'QA2', 'SEC1'], // sorted by id ascending
    )
    const reversed = [...tasks].reverse().map((t) => ({ ...t, predecessors: [...t.predecessors].reverse() }))
    expect(JSON.stringify(schedule(doc(reversed)))).toBe(baseline)
    for (let seed = 1; seed <= 25; seed++) {
      const next = prng(seed)
      const permuted = shuffled(tasks, next).map((t) => ({ ...t, predecessors: shuffled(t.predecessors, next) }))
      expect(JSON.stringify(schedule(doc(permuted))), `seed ${seed}`).toBe(baseline)
    }
  })
})

describe('schedule: 0-day gates (ADR-002 §5, §7)', () => {
  it('reproduces the ADR §7 worked example', () => {
    // A FW 2d [0,1], B App 1d [0,0], gate G FW 0d after B: earliest 1 -> start 1, finish 0 (ignores FW being busy, no binder).
    // T FW 1d after G: earliest max(1 + 0, FW free 2) = 2 -> [2,2]; FW was last set by A (G sets nothing) -> binder A.
    const f = schedule(
      doc([
        task('T', 'FW', 1, ['G']),
        task('G', 'FW', 0, ['B'], { gate: 'fw-integrated' }),
        task('B', 'App', 1),
        task('A', 'FW', 2),
      ]),
    )
    expect(span(f.tasks, 'A')).toEqual([0, 1])
    expect(span(f.tasks, 'B')).toEqual([0, 0])
    expect(span(f.tasks, 'G')).toEqual([1, 0])
    expect(span(f.tasks, 'T')).toEqual([2, 2])
    expect(byId(f.tasks, 'G').capacityBinder).toBeUndefined()
    expect(byId(f.tasks, 'T').capacityBinder).toBe('A')
    expect(byId(f.tasks, 'G').finishDate).toBe('2026-01-05') // finish 0 = Mon
    expect(f.finish).toBe(2)
  })

  it('places a gate without predecessors at day 0, finishing on day -1', () => {
    // earliest = 1 + (-1) = 0 -> start 0, finish -1 (Fri 2026-01-02); it contributes no capacity.
    const f = schedule(doc([task('G', 'FW', 0, [], { gate: 'qa-complete' }), task('A', 'FW', 1)]))
    expect(span(f.tasks, 'G')).toEqual([0, -1])
    expect(byId(f.tasks, 'G').finishDate).toBe('2026-01-02')
    expect(span(f.tasks, 'A')).toEqual([0, 0])
    expect(byId(f.tasks, 'A').capacityBinder).toBeUndefined()
  })
})

describe('schedule: done tasks occupy nothing (ADR-002 §2, §5)', () => {
  it('starts a todo task at day 0 next to a done task of the same stream', () => {
    // D FW done: finish -1, no start, no binder, finishDate = day -1 = Fri 2026-01-02.
    // T FW 2d, no predecessors: earliest 0 (D never set streamFree) -> [0,1], no binder.
    const f = schedule(doc([task('T', 'FW', 2), task('D', 'FW', 3, [], { status: 'done' })]))
    const d = byId(f.tasks, 'D')
    expect(d.start).toBeUndefined()
    expect('start' in d).toBe(false)
    expect(d.finish).toBe(-1)
    expect(d.finishDate).toBe('2026-01-02')
    expect('capacityBinder' in d).toBe(false)
    expect(span(f.tasks, 'T')).toEqual([0, 1])
    expect(byId(f.tasks, 'T').capacityBinder).toBeUndefined()
    expect(f.finish).toBe(1)
  })

  it('treats a done predecessor as finished before day 0 and ignores a done task\'s own predecessors', () => {
    // D done -> finish -1; U App after D: earliest 1 + (-1) = 0 -> [0,0].
    // E done with the open predecessor U (allowed by §7): still finish -1, and U is not delayed by it.
    const f = schedule(
      doc([
        task('U', 'App', 1, ['D']),
        task('D', 'FW', 4, [], { status: 'done' }),
        task('E', 'App', 2, ['U'], { status: 'done' }),
      ]),
    )
    expect(span(f.tasks, 'U')).toEqual([0, 0])
    expect(byId(f.tasks, 'E').finish).toBe(-1)
    expect(f.finish).toBe(0) // only U (day 0) and the done tasks (-1)
  })

  it('finishes at day -1 when everything is done', () => {
    const f = schedule(doc([task('D', 'FW', 3, [], { status: 'done' })]))
    expect(f.finish).toBe(-1)
    expect(f.finishDate).toBe('2026-01-02')
  })
})

describe('schedule: target dates are compared, never constraints (ADR-002 §6)', () => {
  // ADR §7 example: A FW 2d [0,1], B App 1d [0,0], G FW 0d [1,0], T FW 1d [2,2]; release finish 2 (Wed 2026-01-07).
  const plain = [
    task('A', 'FW', 2),
    task('B', 'App', 1),
    task('G', 'FW', 0, ['B'], { gate: 'fw-integrated' }),
    task('T', 'FW', 1, ['G']),
  ]
  const withTargets = [
    task('A', 'FW', 2, [], { targetDate: '2026-01-09' }), // finish Tue 01-06, target Fri 01-09: (Tue, Fri] = 3 -> -3
    task('B', 'App', 1),
    task('G', 'FW', 0, ['B'], { gate: 'fw-integrated' }),
    task('T', 'FW', 1, ['G'], { targetDate: '2026-01-05' }), // finish Wed 01-07, target Mon 01-05: (Mon, Wed] = 2 -> +2
  ]

  const strip = ({ slipDays: _slip, ...rest }: ScheduledTask) => rest

  it('does not change start, finish or capacityBinder, however early or late the targets are', () => {
    const base = schedule(doc(plain))
    for (const releaseTarget of ['2025-06-02', '2026-01-05', '2026-01-09', '2030-01-01']) {
      const f = schedule(doc(withTargets, { targetDate: releaseTarget }))
      expect(f.tasks.map(strip)).toEqual(base.tasks.map(strip))
      expect(f.finish).toBe(base.finish)
      expect(f.finishDate).toBe(base.finishDate)
    }
  })

  it('reports slipDays per task and for the release only where a target exists', () => {
    const late = schedule(doc(withTargets, { targetDate: '2026-01-05' })) // release finish Wed 01-07 vs Mon 01-05: +2
    expect(byId(late.tasks, 'A').slipDays).toBe(-3)
    expect(byId(late.tasks, 'T').slipDays).toBe(2)
    expect('slipDays' in byId(late.tasks, 'B')).toBe(false)
    expect('slipDays' in byId(late.tasks, 'G')).toBe(false)
    expect(late.slipDays).toBe(2)

    const early = schedule(doc(withTargets, { targetDate: '2026-01-09' })) // Wed 01-07 vs Fri 01-09: (Wed, Fri] = 2 -> -2
    expect(early.slipDays).toBe(-2)

    const onTime = schedule(doc(withTargets, { targetDate: '2026-01-07' }))
    expect(onTime.slipDays).toBe(0)

    const none = schedule(doc(plain))
    expect('slipDays' in none).toBe(false)
    expect(none.tasks.every((t) => !('slipDays' in t))).toBe(true)
  })
})

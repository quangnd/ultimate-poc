import { describe, expect, it } from 'vitest'
import { assessReadiness, type ForecastLike } from '../../src/domain/readiness'
import type { Gate, ReleaseDocument, Status, Task } from '../../src/domain/types'

// Forecasts are written by hand, as [start, finish, capacityBinder?] per task id. A done task is [undefined, -1]
// (ADR-002 §2, §5.1: finished before day 0, no start); a 0-day gate starts at `earliest` and finishes at `earliest - 1`.

type Span = [start: number | undefined, finish: number, capacityBinder?: string]

function forecastOf(spans: Record<string, Span>): ForecastLike {
  return {
    tasks: Object.entries(spans).map(([id, [start, finish, capacityBinder]]) => ({
      id,
      ...(start === undefined ? {} : { start }),
      finish,
      ...(capacityBinder === undefined ? {} : { capacityBinder }),
    })),
  }
}

/** A forecast with the right shape only: open tasks at [0,0], done tasks at -1. For tests that never read the chain. */
function flatForecast(d: ReleaseDocument): ForecastLike {
  return forecastOf(Object.fromEntries(d.tasks.map((t): [string, Span] => [t.id, t.status === 'done' ? [undefined, -1] : [0, 0]])))
}

function task(
  id: string,
  stream: string,
  estimateDays: number,
  predecessors: string[] = [],
  extra: { status?: Status; gate?: Gate } = {},
): Task {
  return { id, title: id, stream, ownerRole: 'owner', status: 'todo', estimateDays, predecessors, ...extra }
}

function doc(tasks: Task[]): ReleaseDocument {
  return {
    schemaVersion: 1,
    release: { startDate: '2026-01-05' },
    workstreams: ['FW', 'SPS', 'Security', 'App', 'QA'],
    tasks,
  }
}

/** The four mandatory gates as done 0-day tasks with ids FW, SEC, APP, QA; `override` replaces one by gate value. */
function gateTasks(override: Partial<Record<Gate, Task | null>> = {}): Task[] {
  const done = (id: string, stream: string, gate: Gate): Task => task(id, stream, 0, [], { status: 'done', gate })
  const base: Record<Gate, Task> = {
    'fw-integrated': done('FW', 'FW', 'fw-integrated'),
    'security-verified': done('SEC', 'Security', 'security-verified'),
    'app-integration': done('APP', 'App', 'app-integration'),
    'qa-complete': done('QA', 'QA', 'qa-complete'),
  }
  return (Object.keys(base) as Gate[]).flatMap((gate) => {
    const replacement = override[gate]
    return replacement === null ? [] : [replacement ?? base[gate]]
  })
}

describe('ADR-002 §7 worked example', () => {
  // A/FW 2 days, B/App 1 day, gate G/FW 0 days after B, T/FW 1 day after G. All todo.
  // Schedule (day 0 = first working day): A [0,1], B [0,0] (App is its own stream), G earliest = 1 + 0 = 1 so
  // start 1 / finish 0, T earliest = max(1 + 0, FW free after A = 2) = 2 so [2,2] with capacityBinder A.
  const d = doc([
    task('A', 'FW', 2),
    task('B', 'App', 1),
    task('G', 'FW', 0, ['B'], { gate: 'fw-integrated' }),
    task('T', 'FW', 1, ['G']),
  ])
  const forecast = forecastOf({ A: [0, 1], B: [0, 0], G: [1, 0], T: [2, 2, 'A'] })

  it('has the driving chain T <- A', () => {
    // Open task with the latest finish: T (2). At T (start 2): its predecessor G is open but finishes on 0, not 1,
    // so it does not bind; T's capacity binder A finishes on 1 = 2 - 1, step to A. A (start 0) has no predecessor
    // and no binder: stop.
    expect(assessReadiness(d, forecast).drivingChain).toEqual(['T', 'A'])
  })

  it('derives blocked tasks, blocking tasks and critical blockers around it', () => {
    const r = assessReadiness(d, forecast)
    expect(r.blockedBy).toEqual({ G: ['B'], T: ['G'] }) // A and B have no predecessors
    expect(r.blockingTasks).toEqual(['B']) // only B precedes the gate; G is the gate itself, T comes after it
    expect(r.criticalBlockers).toEqual([]) // chain {T, A} and blocking {B} do not meet
    expect(r.inconsistencies).toEqual([])
  })
})

describe('driving chain (ADR-002 §7)', () => {
  it('steps to a predecessor that finishes the day before the start', () => {
    // A FW 2 [0,1]; B App 1 after A: earliest 2, [2,2]. At B (start 2): A finishes on 1 = 2 - 1, step. A: stop.
    const d = doc([task('A', 'FW', 2), task('B', 'App', 1, ['A'])])
    expect(assessReadiness(d, forecastOf({ A: [0, 1], B: [2, 2] })).drivingChain).toEqual(['B', 'A'])
  })

  it('steps to the smallest id when several predecessors bind', () => {
    // X FW 2 [0,1] and Y SPS 2 [0,1] both finish on 1; Z App 1 after both starts on 2. Both bind: X wins.
    // Predecessors are listed as [Y, X] to show that list order does not matter.
    const d = doc([task('Y', 'SPS', 2), task('X', 'FW', 2), task('Z', 'App', 1, ['Y', 'X'])])
    expect(assessReadiness(d, forecastOf({ X: [0, 1], Y: [0, 1], Z: [2, 2] })).drivingChain).toEqual(['Z', 'X'])
  })

  it('prefers a binding predecessor over the capacity binder', () => {
    // Q FW 2 [0,1] and P SPS 2 [0,1]; X FW 1 after P: earliest max(1 + 1, FW free 2) = 2, binder Q (finish 1).
    // Both Q (binder) and P (predecessor) finish on 1 = 2 - 1; the predecessor rule comes first: X <- P.
    const d = doc([task('Q', 'FW', 2), task('P', 'SPS', 2), task('X', 'FW', 1, ['P'])])
    const f = forecastOf({ P: [0, 1], Q: [0, 1], X: [2, 2, 'Q'] })
    expect(assessReadiness(d, f).drivingChain).toEqual(['X', 'P'])
  })

  it('stops when no predecessor binds and there is no capacity binder', () => {
    // Hand-built: A finishes on 0 but B starts on 3, so A is not on 3 - 1 = 2; B has no binder. Chain: B only.
    const d = doc([task('A', 'FW', 1), task('B', 'App', 1, ['A'])])
    expect(assessReadiness(d, forecastOf({ A: [0, 0], B: [3, 3] })).drivingChain).toEqual(['B'])
  })

  it('never steps into a done predecessor, even one whose finish is start - 1', () => {
    // D is done (finish -1). B is the first App task, earliest = 1 + (-1) = 0, [0,0]; -1 = 0 - 1 but D is done.
    const d = doc([task('D', 'FW', 1, [], { status: 'done' }), task('B', 'App', 1, ['D'])])
    expect(assessReadiness(d, forecastOf({ D: [undefined, -1], B: [0, 0] })).drivingChain).toEqual(['B'])
  })

  it('steps to the capacity binder when no predecessor binds', () => {
    // Q FW 2 [0,1]; R FW 1 has no predecessors, earliest = FW free = 2, [2,2] with binder Q (finish 1 = 2 - 1).
    const d = doc([task('Q', 'FW', 2), task('R', 'FW', 1)])
    expect(assessReadiness(d, forecastOf({ Q: [0, 1], R: [2, 2, 'Q'] })).drivingChain).toEqual(['R', 'Q'])
  })

  it('walks a 0-day gate like any other task', () => {
    // Z FW 2 [0,1]; gate G (0 days) after Z: earliest 2, start 2 / finish 1. Z and G tie on finish 1; the smaller id
    // G is the end task. At G (start 2): Z finishes on 1 = 2 - 1, step to Z.
    const d = doc([task('Z', 'FW', 2), task('G', 'FW', 0, ['Z'], { gate: 'fw-integrated' })])
    expect(assessReadiness(d, forecastOf({ Z: [0, 1], G: [2, 1] })).drivingChain).toEqual(['G', 'Z'])
  })

  it('is empty when every task is done', () => {
    const d = doc([task('A', 'FW', 1, [], { status: 'done' }), task('B', 'App', 1, ['A'], { status: 'done' })])
    const r = assessReadiness(d, forecastOf({ A: [undefined, -1], B: [undefined, -1] }))
    expect(r.drivingChain).toEqual([])
    expect(r.criticalBlockers).toEqual([])
  })

  it('starts at the smallest id when end tasks tie on the latest finish', () => {
    // B FW 2 [0,1] and A SPS 2 [0,1] have no links and tie on finish 1: A is the end task, and nothing binds it.
    const d = doc([task('B', 'FW', 2), task('A', 'SPS', 2)])
    expect(assessReadiness(d, forecastOf({ A: [0, 1], B: [0, 1] })).drivingChain).toEqual(['A'])
  })

  it('starts at the open task with the latest finish, ignoring done tasks', () => {
    // D is done (finish -1); O1 finishes on 0, O2 on 3. The end task is O2.
    const d = doc([task('D', 'FW', 1, [], { status: 'done' }), task('O1', 'SPS', 1), task('O2', 'App', 4)])
    expect(assessReadiness(d, forecastOf({ D: [undefined, -1], O1: [0, 0], O2: [0, 3] })).drivingChain).toEqual(['O2'])
  })
})

describe('blockedBy and blocked tasks (ADR-002 §7, task level)', () => {
  // A done. B todo after A. C todo after A and B. D todo after C and B (listed [C, B]). E done after D. F todo, no links.
  const d = doc([
    task('A', 'FW', 1, [], { status: 'done' }),
    task('B', 'FW', 1, ['A']),
    task('C', 'SPS', 1, ['A', 'B']),
    task('D', 'App', 1, ['C', 'B']),
    task('E', 'QA', 1, ['D'], { status: 'done' }),
    task('F', 'Security', 1),
  ])
  const r = assessReadiness(d, flatForecast(d))

  it('lists each task\'s direct predecessors that are not done, sorted by id', () => {
    // B: A is done -> none. C: A done, B open -> [B]. D: [C, B] both open -> sorted [B, C]. E: D open -> [D].
    expect(r.blockedBy).toEqual({ C: ['B'], D: ['B', 'C'], E: ['D'] })
  })

  it('has no entry for a task whose predecessors are all done or that has none', () => {
    // A (no predecessors), B (only predecessor A is done) and F (no predecessors) are not blocked.
    expect(Object.keys(r.blockedBy).sort()).toEqual(['C', 'D', 'E'])
  })

  it('reports a done task with an open predecessor as an inconsistency', () => {
    expect(r.inconsistencies).toEqual([{ taskId: 'E', openPredecessors: ['D'] }])
  })
})

describe('blockingTasks (ADR-002 §7, release level)', () => {
  it('collects open direct and transitive predecessors of a gate, sorted by id', () => {
    // Gate G after Z; Z after Y; Y after X and V (V done). W is unrelated and open; U comes after G.
    // Blocking = open ancestors of G = X, Y, Z. Not V (done), W (not an ancestor), U (successor) or G itself.
    const d = doc([
      task('Z', 'SPS', 1, ['Y']),
      task('Y', 'App', 1, ['X', 'V']),
      task('X', 'FW', 1),
      task('V', 'QA', 1, [], { status: 'done' }),
      task('W', 'Security', 1),
      task('G', 'FW', 0, ['Z'], { gate: 'fw-integrated' }),
      task('U', 'FW', 1, ['G']),
    ])
    expect(assessReadiness(d, flatForecast(d)).blockingTasks).toEqual(['X', 'Y', 'Z'])
  })

  it('looks through a done task: its open predecessor still blocks (§7)', () => {
    // G (gate) after D (done) after X (open). X is a transitive predecessor of G, so it blocks; D is done, so it does not.
    const d = doc([
      task('X', 'FW', 1),
      task('D', 'SPS', 1, ['X'], { status: 'done' }),
      task('G', 'FW', 0, ['D'], { gate: 'fw-integrated' }),
    ])
    expect(assessReadiness(d, flatForecast(d)).blockingTasks).toEqual(['X'])
  })

  it('counts an open gate that precedes another gate, but not a gate with no gate after it', () => {
    // G1 (open gate) precedes G2 (open gate): G1 blocks G2. G2 precedes no gate, so it is not blocking.
    const d = doc([
      task('G2', 'QA', 0, ['G1'], { gate: 'qa-complete' }),
      task('G1', 'FW', 0, [], { gate: 'fw-integrated' }),
    ])
    expect(assessReadiness(d, flatForecast(d)).blockingTasks).toEqual(['G1'])
  })
})

describe('criticalBlockers (ADR-002 §7)', () => {
  it('is blockingTasks intersected with the driving chain, in chain order', () => {
    // A FW 2 [0,1]; B App 1 after A [2,2]; C SPS 1 [0,0]; gate G after B and C: earliest 3, start 3 / finish 2;
    // T FW 1 after G: earliest max(3, FW free 2) = 3, [3,3], binder A.
    // Chain: T (finish 3) <- G (finish 2 = 3 - 1, predecessor) <- B (finish 2 = 3 - 1; C finishes on 0 so it does not
    // bind) <- A (finish 1 = 2 - 1). So [T, G, B, A].
    // Blocking = open ancestors of G = A, B, C. Critical = chain order filtered to blocking = [B, A]
    // (not T and G: they are not predecessors of a gate; not C: it is blocking but off the chain).
    const d = doc([
      task('A', 'FW', 2),
      task('B', 'App', 1, ['A']),
      task('C', 'SPS', 1),
      task('G', 'QA', 0, ['B', 'C'], { gate: 'qa-complete' }),
      task('T', 'FW', 1, ['G']),
    ])
    const r = assessReadiness(d, forecastOf({ A: [0, 1], B: [2, 2], C: [0, 0], G: [3, 2], T: [3, 3, 'A'] }))
    expect(r.drivingChain).toEqual(['T', 'G', 'B', 'A'])
    expect(r.blockingTasks).toEqual(['A', 'B', 'C'])
    expect(r.criticalBlockers).toEqual(['B', 'A'])
  })
})

describe('readiness (ADR-002 §8)', () => {
  it('is true when all four gates are done and nothing blocks, even with open work after the gates', () => {
    // POST is open but comes after the last gate: it is not a predecessor of any gate, so it does not block.
    const d = doc([...gateTasks(), task('POST', 'FW', 1, ['QA'])])
    const r = assessReadiness(d, flatForecast(d))
    expect(r.ready).toBe(true)
    expect(r.reasons).toEqual([])
    expect(r.blockingTasks).toEqual([])
    expect(r.blockedBy).toEqual({})
  })

  it('is false for a missing gate, with the message "gate fw-integrated not defined"', () => {
    const d = doc(gateTasks({ 'fw-integrated': null }))
    const r = assessReadiness(d, flatForecast(d))
    expect(r.ready).toBe(false)
    expect(r.reasons).toEqual([{ kind: 'missing-gate', gate: 'fw-integrated', message: 'gate fw-integrated not defined' }])
  })

  it('lists several missing gates in GATES order', () => {
    const r = assessReadiness(doc([]), forecastOf({}))
    expect(r.ready).toBe(false)
    expect(r.reasons.map((x) => x.kind === 'missing-gate' && x.gate)).toEqual([
      'fw-integrated',
      'security-verified',
      'app-integration',
      'qa-complete',
    ])
  })

  it('is false for an open gate, naming the gate task; several are listed in GATES order, not id order', () => {
    // qa-complete is on task A and fw-integrated on task B: id order would be A, B; GATES order is B (fw), A (qa).
    const d = doc(
      gateTasks({
        'qa-complete': task('A', 'QA', 0, [], { status: 'in_progress', gate: 'qa-complete' }),
        'fw-integrated': task('B', 'FW', 0, [], { gate: 'fw-integrated' }),
      }),
    )
    const r = assessReadiness(d, flatForecast(d))
    expect(r.ready).toBe(false)
    expect(r.reasons).toEqual([
      { kind: 'open-gate', gate: 'fw-integrated', taskId: 'B', message: 'gate fw-integrated is not done (task B)' },
      { kind: 'open-gate', gate: 'qa-complete', taskId: 'A', message: 'gate qa-complete is not done (task A)' },
    ])
  })

  it('is false for blocking tasks, naming all their ids', () => {
    // fw-integrated gate FWG (open) after X and Y (open). The gate is also reported as open; no inconsistency.
    const d = doc(
      gateTasks({ 'fw-integrated': task('FWG', 'FW', 0, ['Y', 'X'], { gate: 'fw-integrated' }) }).concat([
        task('X', 'FW', 1),
        task('Y', 'App', 1),
      ]),
    )
    const r = assessReadiness(d, flatForecast(d))
    expect(r.ready).toBe(false)
    expect(r.reasons).toEqual([
      { kind: 'open-gate', gate: 'fw-integrated', taskId: 'FWG', message: 'gate fw-integrated is not done (task FWG)' },
      { kind: 'blocking-tasks', taskIds: ['X', 'Y'], message: 'blocking tasks not done: X, Y' },
    ])
  })

  it('reports inconsistencies with another reason, after missing, open and blocking, sorted by task id', () => {
    // X, Y open. gate fw-integrated FWG open after X. gate security-verified SEC DONE after Y (open): an inconsistency,
    // and it makes Y blocking. AD is done after X (open): also an inconsistency, sorts before SEC. APP (app-integration)
    // is in progress. qa-complete is missing.
    // Order: missing qa-complete; open fw-integrated (FWG), open app-integration (APP); blocking [X, Y];
    // inconsistencies AD [X], SEC [Y] (sorted by task id although SEC is listed first).
    const d = doc([
      task('SEC', 'Security', 0, ['Y'], { status: 'done', gate: 'security-verified' }),
      task('FWG', 'FW', 0, ['X'], { gate: 'fw-integrated' }),
      task('APP', 'App', 0, [], { status: 'in_progress', gate: 'app-integration' }),
      task('AD', 'SPS', 1, ['X'], { status: 'done' }),
      task('X', 'FW', 1),
      task('Y', 'App', 1),
    ])
    const r = assessReadiness(d, flatForecast(d))
    expect(r.ready).toBe(false)
    expect(r.reasons).toEqual([
      { kind: 'missing-gate', gate: 'qa-complete', message: 'gate qa-complete not defined' },
      { kind: 'open-gate', gate: 'fw-integrated', taskId: 'FWG', message: 'gate fw-integrated is not done (task FWG)' },
      { kind: 'open-gate', gate: 'app-integration', taskId: 'APP', message: 'gate app-integration is not done (task APP)' },
      { kind: 'blocking-tasks', taskIds: ['X', 'Y'], message: 'blocking tasks not done: X, Y' },
      { kind: 'inconsistency', taskId: 'AD', openPredecessors: ['X'], message: 'task AD is done but predecessors are not: X' },
      { kind: 'inconsistency', taskId: 'SEC', openPredecessors: ['Y'], message: 'task SEC is done but predecessors are not: Y' },
    ])
    expect(r.inconsistencies).toEqual([
      { taskId: 'AD', openPredecessors: ['X'] },
      { taskId: 'SEC', openPredecessors: ['Y'] },
    ])
  })

  it('is false for a done gate with an open predecessor: blocking task plus inconsistency', () => {
    // All gates done, but FW (done) has the open predecessor X, so X blocks and FW is inconsistent.
    const d = doc([...gateTasks({ 'fw-integrated': task('FW', 'FW', 0, ['X'], { status: 'done', gate: 'fw-integrated' }) }), task('X', 'FW', 1)])
    const r = assessReadiness(d, flatForecast(d))
    expect(r.ready).toBe(false)
    expect(r.reasons).toEqual([
      { kind: 'blocking-tasks', taskIds: ['X'], message: 'blocking tasks not done: X' },
      { kind: 'inconsistency', taskId: 'FW', openPredecessors: ['X'], message: 'task FW is done but predecessors are not: X' },
    ])
  })

  it('stays true despite an inconsistency that is on no gate path (clarification 2a)', () => {
    // All gates done. DONE is done after P (open), but neither precedes a gate: P is not blocking.
    // The inconsistency is exposed, yet it does not make the release NOT READY and is not in `reasons`.
    const d = doc([...gateTasks(), task('P', 'FW', 1), task('DONE', 'SPS', 1, ['P'], { status: 'done' })])
    const r = assessReadiness(d, flatForecast(d))
    expect(r.ready).toBe(true)
    expect(r.reasons).toEqual([])
    expect(r.blockingTasks).toEqual([])
    expect(r.inconsistencies).toEqual([{ taskId: 'DONE', openPredecessors: ['P'] }])
  })

  // Regression (reviewer #4342): blockedBy was a plain object, so the valid id `constructor` found Object's property.
  it('has no inherited entries in blockedBy for ids like constructor', () => {
    const d = doc([...gateTasks(), task('constructor', 'FW', 1), task('toString', 'FW', 1, ['constructor'])])
    const r = assessReadiness(d, flatForecast(d))
    expect(r.blockedBy['constructor']).toBeUndefined()
    expect(r.blockedBy['toString']).toEqual(['constructor'])
    expect(r.blockedBy['hasOwnProperty']).toBeUndefined()
  })
})

/**
 * Independent QA acceptance tests for issue #8 "P1-4: Blocking, driving chain and readiness".
 *
 * Black-box, written from ADR-002 (§5 capacity binder, §7 blocking / driving chain / critical blocker, §8 readiness,
 * Clarification 2a), `src/domain/types.ts`, `fixtures/README.md`, the issue's acceptance criteria and the agreed
 * contract of `src/domain/readiness.ts` only. Every expectation is derived by hand and the derivation is written next
 * to it.
 *
 * Rules as agreed (the contract under test):
 * - blockedBy: for every task of any status, its direct predecessors that are not done; only tasks with at least one;
 *   each list sorted by code-unit id.
 * - blockingTasks: tasks that are not done and are direct or transitive predecessors of any task carrying a `gate`;
 *   the walk goes through done tasks too; sorted by id. An open gate task counts only if it precedes another gate.
 * - inconsistencies: done tasks with at least one predecessor that is not done; sorted by taskId.
 * - drivingChain (ids from the end backwards): all done -> []. Otherwise start at the open task with the max finish
 *   (tie: smallest id). At task X (start s): step to the smallest-id predecessor that is not done and has
 *   finish = s-1; else to X.capacityBinder if its finish = s-1; else stop.
 * - criticalBlockers: blockingTasks intersected with drivingChain, in chain order.
 * - ready iff all 4 gates exist, all are done and blockingTasks is empty. Otherwise reasons, in this order: missing
 *   gates (GATES order), open gates (GATES order), one blocking-tasks reason, then one inconsistency reason per
 *   inconsistency sorted by taskId - the last group ONLY when ready is false for another reason (clarification 2a).
 *   reasons is empty iff ready.
 *
 * Deliberately NOT asserted (the contract does not fix them), see `shape`:
 * - any reason message except the missing-gate one (`gate ${gate} not defined`);
 * - the order of ids inside a blocking-tasks reason's taskIds (compared sorted);
 * - the order inside an inconsistency's openPredecessors, in `inconsistencies` and in the reason (compared sorted).
 *
 * Forecasts: most tests pass a forecast written by hand (so they do not depend on the scheduler). A separate block
 * ("hand-written forecasts agree with schedule()") checks that the hand forecasts equal what the real scheduler
 * produces, so a wrong hand forecast or a scheduler bug is reported there and not as a readiness failure.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assessReadiness, type ForecastLike, type Inconsistency, type NotReadyReason, type Readiness } from '../../src/domain/readiness'
import { schedule, type ScheduledTask } from '../../src/domain/schedule'
import { GATES, type Gate, type ReleaseDocument, type Task } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'

// ---------------------------------------------------------------- builders

const STREAMS = ['FW', 'SPS', 'Security', 'App', 'QA']

/** An ordinary task; `over` replaces fields (predecessors, status, gate). */
function task(id: string, stream: string, estimateDays: number, over: Partial<Task> = {}): Task {
  return { id, title: id, stream, ownerRole: 'owner', status: 'todo', estimateDays, predecessors: [], ...over }
}

/** A 0-day gate task. */
function gate(id: string, stream: string, gateName: Gate, predecessors: string[], over: Partial<Task> = {}): Task {
  return task(id, stream, 0, { gate: gateName, predecessors, ...over })
}

/** A valid document (the validator guards the fixtures, so a mistake here is reported as such). */
function docOf(tasks: Task[]): ReleaseDocument {
  const document: ReleaseDocument = {
    schemaVersion: 1,
    release: { startDate: '2026-01-05' },
    workstreams: [...STREAMS],
    tasks,
  }
  const validation = validateDocument(document)
  if (!validation.ok) throw new Error(`QA fixture is invalid: ${JSON.stringify(validation.errors)}`)
  return document
}

/**
 * The four gate tasks `G-<gate>`: 0-day, done, no predecessors. `over[gate]` patches one of them, or 'missing' leaves
 * it out.
 */
function gateSet(over: Partial<Record<Gate, Partial<Task> | 'missing'>> = {}): Task[] {
  const tasks: Task[] = []
  for (const g of GATES) {
    const patch = over[g]
    if (patch === 'missing') continue
    tasks.push(gate(`G-${g}`, 'FW', g, [], { status: 'done', ...patch }))
  }
  return tasks
}

type FTask = ForecastLike['tasks'][number]

/** Hand-written forecast entry: `at('X', 2, 4)` starts on day 2 and finishes on day 4. */
function at(id: string, start: number, finish: number, capacityBinder?: string): FTask {
  return capacityBinder === undefined ? { id, start, finish } : { id, start, finish, capacityBinder }
}

/** A done task: finished on day -1 (ADR-002 §5.1), no start. */
function done(id: string): FTask {
  return { id, finish: -1 }
}

const forecastOf = (...tasks: FTask[]): ForecastLike => ({ tasks })

/** What the readiness tests compare: the fields of the contract, with the unfixed details normalised (see header). */
/** A reason with the unfixed details normalised; explicit types, so the tests below typecheck on their own. */
interface ReasonShape {
  kind: string
  gate?: string
  message?: string
  taskId?: string
  taskIds?: string[]
  openPredecessors?: string[]
}

function shape(r: Readiness): {
  ready: boolean
  reasons: ReasonShape[]
  blockedBy: Record<string, string[]>
  blockingTasks: string[]
  drivingChain: string[]
  criticalBlockers: string[]
  inconsistencies: { taskId: string; openPredecessors: string[] }[]
} {
  return {
    ready: r.ready,
    reasons: r.reasons.map(reasonShape),
    blockedBy: Object.fromEntries(Object.entries(r.blockedBy)),
    blockingTasks: r.blockingTasks,
    drivingChain: r.drivingChain,
    criticalBlockers: r.criticalBlockers,
    inconsistencies: r.inconsistencies.map((i: Inconsistency) => ({ taskId: i.taskId, openPredecessors: [...i.openPredecessors].sort() })),
  }
}

function reasonShape(r: NotReadyReason): ReasonShape {
  switch (r.kind) {
    case 'missing-gate':
      return { kind: r.kind, gate: r.gate, message: r.message } // the one message the contract fixes
    case 'open-gate':
      return { kind: r.kind, gate: r.gate, taskId: r.taskId }
    case 'blocking-tasks':
      return { kind: r.kind, taskIds: [...r.taskIds].sort() }
    case 'inconsistency':
      return { kind: r.kind, taskId: r.taskId, openPredecessors: [...r.openPredecessors].sort() }
    default:
      throw new Error('readiness returned a reason of a kind outside the contract')
  }
}

// Expected reasons.
const missing = (g: Gate) => ({ kind: 'missing-gate', gate: g, message: `gate ${g} not defined` })
const openGate = (g: Gate, taskId: string) => ({ kind: 'open-gate', gate: g, taskId })
const blocking = (...ids: string[]) => ({ kind: 'blocking-tasks', taskIds: [...ids].sort() })
const inconsistent = (taskId: string, ...openPredecessors: string[]) => ({
  kind: 'inconsistency',
  taskId,
  openPredecessors: [...openPredecessors].sort(),
})

/** assessReadiness plus the invariant "reasons is empty iff ready", which every scenario must satisfy. */
function assess(document: ReleaseDocument, forecast: ForecastLike) {
  const result = assessReadiness(document, forecast)
  expect(result.reasons.length === 0, 'reasons is empty iff ready').toBe(result.ready)
  return shape(result)
}

/** assess() with the forecast produced by the real scheduler; for tests where the forecast numbers do not matter. */
const assessScheduled = (document: ReleaseDocument) => assess(document, schedule(document))

// ---------------------------------------------------------------- scenarios with a hand-written forecast

/**
 * ADR-002 §7 worked example: A/FW 2 days, B/App 1 day, gate G/FW 0 days after B, T/FW 1 day after G.
 * §5: A [0,1] (first FW task, no binder); B [0,0]; G earliest = 1 + 0 = 1, start 1 / finish 0, never a binder;
 * T earliest = max(1 + 0, streamFree FW = 2) = 2 -> [2,2], binder = A (the last task that set streamFree of FW).
 */
const ADR_EXAMPLE = {
  doc: docOf([
    task('A', 'FW', 2),
    task('B', 'App', 1),
    gate('G', 'FW', 'fw-integrated', ['B']),
    task('T', 'FW', 1, { predecessors: ['G'] }),
  ]),
  forecast: forecastOf(at('A', 0, 1), at('B', 0, 0), at('G', 1, 0), at('T', 2, 2, 'A')),
}

/**
 * Mixed chain. A/FW 2, B/App 3, C/FW 1 after B, D/FW 2. List scheduling: A [0,1]; B [0,2]; D earliest 2 (FW free
 * at 2; C would be 3) -> [2,3] binder A; C earliest max(1 + 2, FW free 4) = 4 -> [4,4] binder D.
 */
const CAPACITY_CHAIN = {
  doc: docOf([
    task('A', 'FW', 2),
    task('B', 'App', 3),
    task('C', 'FW', 1, { predecessors: ['B'] }),
    task('D', 'FW', 2),
  ]),
  forecast: forecastOf(at('A', 0, 1), at('B', 0, 2), at('C', 4, 4, 'D'), at('D', 2, 3, 'A')),
}

/** A/FW 5 [0,4]; Z/App 5 [0,4]; X/FW 1 after Z: earliest max(4 + 1, FW free 5) = 5 -> [5,5], binder A (finish 4 = 5 - 1). */
const PRED_BEATS_BINDER = {
  doc: docOf([task('A', 'FW', 5), task('Z', 'App', 5), task('X', 'FW', 1, { predecessors: ['Z'] })]),
  forecast: forecastOf(at('A', 0, 4), at('Z', 0, 4), at('X', 5, 5, 'A')),
}

/** A/FW 3 [0,2]; P/App 5 [0,4]; X/FW 1 after P: earliest max(5, FW free 3) = 5 -> [5,5], binder A (finish 2, slack). */
const SLACK_BINDER = {
  doc: docOf([task('A', 'FW', 3), task('P', 'App', 5), task('X', 'FW', 1, { predecessors: ['P'] })]),
  forecast: forecastOf(at('A', 0, 2), at('P', 0, 4), at('X', 5, 5, 'A')),
}

/** P/FW 1 [0,0]; Q/App 3 [0,2]; X/QA 1 after both: earliest 1 + max(0, 2) = 3 -> [3,3]. Q binds, P has slack. */
const PRED_SLACK = {
  doc: docOf([task('P', 'FW', 1), task('Q', 'App', 3), task('X', 'QA', 1, { predecessors: ['P', 'Q'] })]),
  forecast: forecastOf(at('P', 0, 0), at('Q', 0, 2), at('X', 3, 3)),
}

/** P1/FW 2, P2/App 2 both [0,1]; X/QA 1 after both (listed P2, P1): [2,2]. Both finish on 1 = 2 - 1. */
const PRED_TIE = {
  doc: docOf([
    task('P1', 'FW', 2),
    task('P2', 'App', 2),
    task('X', 'QA', 1, { predecessors: ['P2', 'P1'] }),
  ]),
  forecast: forecastOf(at('P1', 0, 1), at('P2', 0, 1), at('X', 2, 2)),
}

/** D/FW done (finish -1, occupies nothing); X/FW 2 after D: earliest max(1 + -1, 0) = 0 -> [0,1]. D finishes on 0 - 1. */
const DONE_PRED = {
  doc: docOf([task('D', 'FW', 3, { status: 'done' }), task('X', 'FW', 2, { predecessors: ['D'] })]),
  forecast: forecastOf(done('D'), at('X', 0, 1)),
}

/** A/FW 1 [0,0]; B/App 1 after A [1,1]; C/QA 1 after B [2,2]: each task starts the day after its predecessor. */
const LINEAR = {
  doc: docOf([
    task('A', 'FW', 1),
    task('B', 'App', 1, { predecessors: ['A'] }),
    task('C', 'QA', 1, { predecessors: ['B'] }),
  ]),
  forecast: forecastOf(at('A', 0, 0), at('B', 1, 1), at('C', 2, 2)),
}

/** A1/FW 1 [0,0]; B1/App 5 [0,4]; independent: the latest finish is B1 although A1 has the smaller id. */
const LATEST_FINISH = {
  doc: docOf([task('A1', 'FW', 1), task('B1', 'App', 5)]),
  forecast: forecastOf(at('A1', 0, 0), at('B1', 0, 4)),
}

/** 'a1'/FW 3 and 'B1'/App 3, both [0,2]. Code-unit order puts 'B1' (66) before 'a1' (97); a locale sort would not. */
const TIE_FINISH = {
  doc: docOf([task('a1', 'FW', 3), task('B1', 'App', 3)]),
  forecast: forecastOf(at('a1', 0, 2), at('B1', 0, 2)),
}

/**
 * 'A1'/FW is done (finish -1); G1 is a 0-day gate without predecessors: start 0, finish -1. Both finish on -1 and
 * 'A1' < 'G1', but only open tasks may start the chain.
 */
const DONE_VS_OPEN_GATE = {
  doc: docOf([task('A1', 'FW', 2, { status: 'done' }), gate('G1', 'FW', 'fw-integrated', [])]),
  forecast: forecastOf(done('A1'), at('G1', 0, -1)),
}

/**
 * Critical-blocker scenario. Y/FW 2 [0,1]; W/Security 1 [0,0]; Z/App 2 after Y [2,3]; gate G (fw-integrated) after
 * Z and W: earliest 1 + max(3, 0) = 4 -> start 4 / finish 3; X/QA 1 after G: earliest 4 -> [4,4].
 */
const CRITICAL = {
  doc: docOf([
    task('X', 'QA', 1, { predecessors: ['G'] }),
    gate('G', 'FW', 'fw-integrated', ['W', 'Z']),
    task('Z', 'App', 2, { predecessors: ['Y'] }),
    task('W', 'Security', 1),
    task('Y', 'FW', 2),
  ]),
  forecast: forecastOf(at('Y', 0, 1), at('W', 0, 0), at('Z', 2, 3), at('G', 4, 3), at('X', 4, 4)),
}

/** A forecast that the scheduler would not produce: FW is free on day 3, yet X starts on 5. Used for the "stop" rule. */
const GAP_AFTER_BINDER = {
  doc: docOf([task('A', 'FW', 3), task('X', 'FW', 1)]),
  forecast: forecastOf(at('A', 0, 2), at('X', 5, 5, 'A')),
}

// ================================================================= forecasts used by the tests

describe('hand-written forecasts agree with schedule() (guards the QA fixtures, not the readiness code)', () => {
  const pick = (t: ScheduledTask): FTask => ({
    id: t.id,
    ...(t.start === undefined ? {} : { start: t.start }),
    finish: t.finish,
    ...(t.capacityBinder === undefined ? {} : { capacityBinder: t.capacityBinder }),
  })
  const byId = (a: FTask, b: FTask) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

  it.each(
    Object.entries({
      ADR_EXAMPLE,
      CAPACITY_CHAIN,
      PRED_BEATS_BINDER,
      SLACK_BINDER,
      PRED_SLACK,
      PRED_TIE,
      DONE_PRED,
      LINEAR,
      LATEST_FINISH,
      TIE_FINISH,
      DONE_VS_OPEN_GATE,
      CRITICAL,
    }),
  )('%s', (_name, scenario) => {
    expect(schedule(scenario.doc).tasks.map(pick).sort(byId)).toStrictEqual([...scenario.forecast.tasks].sort(byId))
  })
})

// ================================================================= ADR-002 §7 worked example

describe('ADR-002 §7 worked example (issue #8 acceptance criterion 1)', () => {
  it('the driving chain is T <- A, listed from the end backwards', () => {
    expect(assess(ADR_EXAMPLE.doc, ADR_EXAMPLE.forecast).drivingChain).toStrictEqual(['T', 'A'])
  })

  it('the chain is the same for the real scheduler forecast', () => {
    expect(assessScheduled(ADR_EXAMPLE.doc).drivingChain).toStrictEqual(['T', 'A'])
  })

  // Walk: latest finish among open tasks is T (2). T starts on 2: its only predecessor G finishes on 0 (not 1), so no
  // predecessor binds; T's capacity binder A finishes on 1 = 2 - 1 -> A. A starts on 0 with no predecessor and no binder.
  // Blocking tasks: only G carries a gate; its open predecessors are {B}. G itself precedes no other gate, A and T do
  // not precede G. So blockingTasks = [B], and B is not on the chain -> no critical blocker.
  it('the rest of the result for the same example', () => {
    expect(assess(ADR_EXAMPLE.doc, ADR_EXAMPLE.forecast)).toStrictEqual({
      ready: false,
      // gates: fw-integrated = G (open); the other three are not defined
      reasons: [
        missing('security-verified'),
        missing('app-integration'),
        missing('qa-complete'),
        openGate('fw-integrated', 'G'),
        blocking('B'),
      ],
      blockedBy: { G: ['B'], T: ['G'] }, // A and B have no predecessors
      blockingTasks: ['B'],
      drivingChain: ['T', 'A'],
      criticalBlockers: [],
      inconsistencies: [],
    })
  })
})

// ================================================================= driving chain

describe('driving chain (ADR-002 §7)', () => {
  it('is empty when every task is done', () => {
    // all done, so the chain is empty even though the forecast still has finish values (-1) for the tasks
    const document = docOf([
      task('A', 'FW', 2, { status: 'done' }),
      task('B', 'App', 1, { status: 'done', predecessors: ['A'] }),
    ])
    const result = assess(document, forecastOf(done('A'), done('B')))
    expect(result.drivingChain).toStrictEqual([])
    expect(result.criticalBlockers).toStrictEqual([])
  })

  it('starts at the open task with the latest finish, not at the smallest id', () => {
    // A1 finishes on 0, B1 on 4 -> start at B1; B1 starts on 0 with no predecessor and no binder -> stop
    expect(assess(LATEST_FINISH.doc, LATEST_FINISH.forecast).drivingChain).toStrictEqual(['B1'])
  })

  it.each([
    ['listed a1, B1', [at('a1', 0, 2), at('B1', 0, 2)]],
    ['listed B1, a1', [at('B1', 0, 2), at('a1', 0, 2)]],
  ])('on a tie of the latest finish takes the smallest id by code unit, whatever the forecast order (%s)', (_name, tasks) => {
    // both finish on 2; 'B1' < 'a1' by code unit; neither has a predecessor or a binder -> chain is just ['B1']
    expect(assess(TIE_FINISH.doc, forecastOf(...tasks)).drivingChain).toStrictEqual(['B1'])
  })

  it('only open tasks can start the chain: a done task with the same finish and a smaller id is skipped', () => {
    // A1 (done, finish -1) and G1 (open gate, finish -1) tie on -1; only G1 is open
    expect(assess(DONE_VS_OPEN_GATE.doc, DONE_VS_OPEN_GATE.forecast).drivingChain).toStrictEqual(['G1'])
  })

  it('steps to a predecessor that finishes on the day before the start, across streams', () => {
    // C [2,2]: predecessor B finishes on 1 = 2 - 1 -> B [1,1]: A finishes on 0 = 1 - 1 -> A [0,0]: stop
    expect(assess(LINEAR.doc, LINEAR.forecast).drivingChain).toStrictEqual(['C', 'B', 'A'])
  })

  it('does not step to a predecessor that has slack', () => {
    // X [3,3]: Q finishes on 2 = 3 - 1 -> Q; P finishes on 0, not 2, so P is not on the chain. Q [0,2]: stop.
    expect(assess(PRED_SLACK.doc, PRED_SLACK.forecast).drivingChain).toStrictEqual(['X', 'Q'])
  })

  it('takes the smallest id when several predecessors finish on the day before the start', () => {
    // X [2,2] lists P2, P1; both finish on 1 -> P1 (smallest id); P1 [0,1] has no predecessor or binder -> stop
    expect(assess(PRED_TIE.doc, PRED_TIE.forecast).drivingChain).toStrictEqual(['X', 'P1'])
  })

  it('never steps to a done predecessor, even one that finishes on the day before the start', () => {
    // X starts on 0; its done predecessor D finishes on -1 = 0 - 1 but is done; X has no capacity binder -> stop
    expect(assess(DONE_PRED.doc, DONE_PRED.forecast).drivingChain).toStrictEqual(['X'])
  })

  it('steps to the capacity binder when no predecessor binds, and keeps following binders', () => {
    // C [4,4]: predecessor B finishes on 2 (not 3); binder D finishes on 3 -> D [2,3]: no predecessor; binder A
    // finishes on 1 = 2 - 1 -> A [0,1]: no predecessor, no binder -> stop
    expect(assess(CAPACITY_CHAIN.doc, CAPACITY_CHAIN.forecast).drivingChain).toStrictEqual(['C', 'D', 'A'])
  })

  it('prefers a binding predecessor over a binding capacity binder, even with a larger id', () => {
    // X [5,5]: predecessor Z finishes on 4 = 5 - 1 and binder A finishes on 4 as well -> predecessor Z wins although
    // 'A' < 'Z'; Z [0,4]: stop. A is not on the chain.
    expect(assess(PRED_BEATS_BINDER.doc, PRED_BEATS_BINDER.forecast).drivingChain).toStrictEqual(['X', 'Z'])
  })

  it('ignores a capacity binder with slack when a predecessor binds', () => {
    // X [5,5]: predecessor P finishes on 4 -> P. The binder A finishes on 2 and would not bind anyway.
    expect(assess(SLACK_BINDER.doc, SLACK_BINDER.forecast).drivingChain).toStrictEqual(['X', 'P'])
  })

  it('stops when neither a predecessor nor the capacity binder finishes on the day before the start', () => {
    // X starts on 5; it has no predecessor; the binder A finishes on 2, not 4 -> stop at X (literal ADR rule)
    expect(assess(GAP_AFTER_BINDER.doc, GAP_AFTER_BINDER.forecast).drivingChain).toStrictEqual(['X'])
  })

  it('walks through a 0-day gate (start 4, finish 3) and on to the predecessor that binds', () => {
    // CRITICAL: X [4,4] <- G (start 4, finish 3 = 4 - 1) <- Z (finish 3 = 4 - 1; W finishes on 0, slack)
    // <- Y (finish 1 = 2 - 1) -> stop at Y [0,1]
    expect(assess(CRITICAL.doc, CRITICAL.forecast).drivingChain).toStrictEqual(['X', 'G', 'Z', 'Y'])
  })

  it('does not depend on the order of the document or forecast tasks', () => {
    const reversed = { ...PRED_TIE.doc, tasks: [...PRED_TIE.doc.tasks].reverse() }
    expect(assess(reversed, forecastOf(...[...PRED_TIE.forecast.tasks].reverse())).drivingChain).toStrictEqual(['X', 'P1'])
  })
})

// ================================================================= blockedBy

describe('blockedBy (ADR-002 §7, task level)', () => {
  // Tasks: 'B1' todo, 'a1' in_progress, 'c1' done; X (todo) after c1, a1, B1; Y (done) after a1; Z (todo) after c1
  // only; W (todo) after X.
  // X: open direct predecessors are B1, a1 (c1 is done) -> ['B1', 'a1'] (code-unit order: 'B1' < 'a1').
  // Y is done but its predecessor a1 is open: a task of any status is listed -> ['a1'].
  // Z has only a done predecessor -> absent. W is blocked by X only, not by X's predecessors (direct, not transitive).
  // B1, a1, c1 have no predecessors -> absent.
  const document = docOf([
    task('W', 'QA', 1, { predecessors: ['X'] }),
    task('c1', 'SPS', 1, { status: 'done' }),
    task('X', 'FW', 1, { predecessors: ['c1', 'a1', 'B1'] }),
    task('a1', 'App', 2, { status: 'in_progress' }),
    task('Y', 'Security', 1, { status: 'done', predecessors: ['a1'] }),
    task('B1', 'SPS', 2),
    task('Z', 'Security', 1, { predecessors: ['c1'] }),
  ])

  it('lists the open direct predecessors of every task, sorted by id; tasks with none are absent', () => {
    expect(assessScheduled(document).blockedBy).toStrictEqual({ W: ['X'], X: ['B1', 'a1'], Y: ['a1'] })
  })

  it('is empty when no task has an open predecessor', () => {
    const allDone = docOf([task('A', 'FW', 1, { status: 'done' }), task('B', 'App', 1, { status: 'done', predecessors: ['A'] })])
    expect(assessScheduled(allDone).blockedBy).toStrictEqual({})
  })
})

// ================================================================= blocking tasks

describe('blocking tasks (ADR-002 §7, release level)', () => {
  it('includes direct and transitive open predecessors of a gate, sorted by code-unit id, in_progress included', () => {
    // c1 -> a1 (in_progress) -> B1 -> gate. All three are open predecessors of the gate (direct: B1; transitive: a1,
    // c1). Code-unit order: 'B1' < 'a1' < 'c1'. The gate itself is open but precedes no other gate -> not listed.
    const document = docOf([
      gate('G', 'QA', 'qa-complete', ['B1']),
      task('c1', 'FW', 1),
      task('B1', 'App', 1, { predecessors: ['a1'] }),
      task('a1', 'SPS', 1, { status: 'in_progress', predecessors: ['c1'] }),
    ])
    expect(assessScheduled(document).blockingTasks).toStrictEqual(['B1', 'a1', 'c1'])
  })

  it('the walk goes through done tasks: an open task behind a done task still blocks', () => {
    // P (todo) -> D1 (done) -> D2 (done) -> gate. P blocks; D1 and D2 are done, so they are not blocking tasks.
    // blockedBy: D1 is blocked by P; D2's predecessor D1 is done; the gate's predecessor D2 is done.
    // Inconsistencies look at direct predecessors only: D1 (open predecessor P). D2's predecessor D1 is done.
    const document = docOf([
      task('P', 'FW', 1),
      task('D1', 'App', 1, { status: 'done', predecessors: ['P'] }),
      task('D2', 'SPS', 1, { status: 'done', predecessors: ['D1'] }),
      gate('G', 'QA', 'qa-complete', ['D2']),
    ])
    const result = assessScheduled(document)
    expect(result.blockingTasks).toStrictEqual(['P'])
    expect(result.blockedBy).toStrictEqual({ D1: ['P'] })
    expect(result.inconsistencies).toStrictEqual([{ taskId: 'D1', openPredecessors: ['P'] }])
  })

  it('does not list done tasks, successors of a gate, or tasks unrelated to any gate', () => {
    // P -> G (gate); S after G; U unrelated; DONE_P done and before G. Only P blocks.
    const document = docOf([
      task('P', 'FW', 1),
      task('DONE_P', 'App', 1, { status: 'done' }),
      gate('G', 'QA', 'qa-complete', ['P', 'DONE_P']),
      task('S', 'FW', 1, { predecessors: ['G'] }),
      task('U', 'Security', 1),
    ])
    expect(assessScheduled(document).blockingTasks).toStrictEqual(['P'])
  })

  it('lists each task once when it reaches the gate along several paths', () => {
    // P -> A -> G and P -> B -> G (diamond): [A, B, P], P once
    const document = docOf([
      task('P', 'FW', 1),
      task('A', 'App', 1, { predecessors: ['P'] }),
      task('B', 'SPS', 1, { predecessors: ['P'] }),
      gate('G', 'QA', 'qa-complete', ['A', 'B']),
    ])
    expect(assessScheduled(document).blockingTasks).toStrictEqual(['A', 'B', 'P'])
  })

  it('an open gate counts only if it precedes another gate (open gate -> ordinary task -> gate)', () => {
    // GF (fw-integrated, todo) -> X (todo) -> GQ (qa-complete, todo). GF and X precede GQ; GQ precedes no gate.
    const document = docOf([
      gate('GF', 'FW', 'fw-integrated', []),
      task('X', 'App', 1, { predecessors: ['GF'] }),
      gate('GQ', 'QA', 'qa-complete', ['X']),
    ])
    expect(assessScheduled(document).blockingTasks).toStrictEqual(['GF', 'X'])
  })

  it('a done gate that precedes another gate is not blocking', () => {
    // GF done -> GQ todo: nothing open precedes a gate
    const document = docOf([
      gate('GF', 'FW', 'fw-integrated', [], { status: 'done' }),
      gate('GQ', 'QA', 'qa-complete', ['GF']),
    ])
    expect(assessScheduled(document).blockingTasks).toStrictEqual([])
  })

  it('is empty without any gate task, however many open tasks there are', () => {
    const document = docOf([task('A', 'FW', 2), task('B', 'App', 1, { predecessors: ['A'] })])
    expect(assessScheduled(document).blockingTasks).toStrictEqual([])
  })
})

// ================================================================= critical blockers

describe('critical blockers (ADR-002 §7)', () => {
  it('are the blocking tasks on the driving chain, in chain order, not id order', () => {
    // CRITICAL: chain [X, G, Z, Y]; blocking tasks = open predecessors of G = [W, Y, Z]. Chain order of those: Z, Y
    // (X and G are on the chain but are not predecessors of a gate; W is blocking but has slack, off the chain).
    const result = assess(CRITICAL.doc, CRITICAL.forecast)
    expect(result.blockingTasks).toStrictEqual(['W', 'Y', 'Z'])
    expect(result.drivingChain).toStrictEqual(['X', 'G', 'Z', 'Y'])
    expect(result.criticalBlockers).toStrictEqual(['Z', 'Y'])
  })

  it('are empty when the only blocking task is off the chain (ADR worked example: B blocks, chain is T, A)', () => {
    expect(assess(ADR_EXAMPLE.doc, ADR_EXAMPLE.forecast).criticalBlockers).toStrictEqual([])
  })
})

// ================================================================= NOT READY: each reason

describe('NOT READY: missing gate', () => {
  it.each(GATES)('only %s is not defined: exactly one missing-gate reason with the exact message', (g) => {
    // the other three gates exist and are done, no blocking task -> the single reason is the missing gate
    const result = assessScheduled(docOf(gateSet({ [g]: 'missing' })))
    expect(result.ready).toBe(false)
    expect(result.reasons).toStrictEqual([{ kind: 'missing-gate', gate: g, message: `gate ${g} not defined` }])
    expect(result.blockingTasks).toStrictEqual([])
    expect(result.inconsistencies).toStrictEqual([])
  })

  it('several missing gates are reported in GATES order', () => {
    // security-verified and qa-complete missing; GATES order is fw-integrated, security-verified, app-integration,
    // qa-complete
    const result = assessScheduled(docOf(gateSet({ 'qa-complete': 'missing', 'security-verified': 'missing' })))
    expect(result.reasons).toStrictEqual([missing('security-verified'), missing('qa-complete')])
  })

  it('a document without any gate reports all four, in GATES order, and has no blocking task', () => {
    // N1 [0,1], N2 [2,2]; no gate, so nothing blocks, but the release is NOT READY. Chain: N2 (start 2) <- N1 (finish
    // 1 = 2 - 1).
    const document = docOf([task('N1', 'FW', 2), task('N2', 'App', 1, { predecessors: ['N1'] })])
    const result = assess(document, forecastOf(at('N1', 0, 1), at('N2', 2, 2)))
    expect(result.ready).toBe(false)
    expect(result.reasons).toStrictEqual(GATES.map(missing))
    expect(result.blockingTasks).toStrictEqual([])
    expect(result.drivingChain).toStrictEqual(['N2', 'N1'])
  })
})

describe('NOT READY: open gate', () => {
  it.each(GATES.map((g, i) => [g, i % 2 === 0 ? 'todo' : 'in_progress'] as const))(
    'only %s is open (%s): exactly one open-gate reason naming its task',
    (g, status) => {
      // the other gates are done and nothing precedes any gate -> no blocking task; the open gate is the only open
      // task: chain [G-<gate>] (0-day gate, start 0, finish -1)
      const result = assessScheduled(docOf(gateSet({ [g]: { status } })))
      expect(result.ready).toBe(false)
      expect(result.reasons).toStrictEqual([openGate(g, `G-${g}`)])
      expect(result.blockingTasks).toStrictEqual([])
      expect(result.drivingChain).toStrictEqual([`G-${g}`])
      expect(result.criticalBlockers).toStrictEqual([])
    },
  )

  it('several open gates are reported in GATES order whatever the document order', () => {
    // all four open, listed qa-complete first
    const tasks = gateSet({
      'fw-integrated': { status: 'todo' },
      'security-verified': { status: 'in_progress' },
      'app-integration': { status: 'todo' },
      'qa-complete': { status: 'todo' },
    }).reverse()
    const result = assessScheduled(docOf(tasks))
    expect(result.reasons).toStrictEqual(GATES.map((g) => openGate(g, `G-${g}`)))
  })
})

describe('NOT READY: blocking tasks', () => {
  it('all four gates done but an open task precedes a gate: blocking-tasks, then the inconsistency of the done gate', () => {
    // P (todo) precedes G-qa-complete, which is marked done: P blocks (the open predecessor still counts) and the gate
    // is an inconsistency. The release is not ready because of the blocking task, so the inconsistency is listed last.
    const tasks = gateSet({ 'qa-complete': { predecessors: ['P'] } })
    const result = assessScheduled(docOf([task('P', 'FW', 1), ...tasks]))
    expect(result.ready).toBe(false)
    expect(result.reasons).toStrictEqual([blocking('P'), inconsistent('G-qa-complete', 'P')])
    expect(result.blockingTasks).toStrictEqual(['P'])
    expect(result.inconsistencies).toStrictEqual([{ taskId: 'G-qa-complete', openPredecessors: ['P'] }])
  })

  it('lists every blocking id in the one blocking-tasks reason', () => {
    // CRITICAL: blocking tasks are W, Y, Z (see above); one reason carries all three
    const result = assess(CRITICAL.doc, CRITICAL.forecast)
    expect(result.reasons).toContainEqual(blocking('W', 'Y', 'Z'))
    expect(result.reasons.filter((r) => r.kind === 'blocking-tasks')).toHaveLength(1)
  })
})

describe('NOT READY: several reasons at once, in the fixed order', () => {
  // P1 (todo), P2 (todo); GF = fw-integrated (todo, after P1); GP = app-integration (DONE, after P2); GQ = qa-complete
  // (todo, after GF and GP); D1 (done, after P1); security-verified is not defined.
  // - missing: security-verified
  // - open gates: fw-integrated (GF), qa-complete (GQ), in GATES order (app-integration is done)
  // - blocking tasks: open predecessors of a gate: GF <- P1; GP <- P2; GQ <- GF (an open gate that precedes another
  //   gate counts), GP (done), P1, P2 -> [GF, P1, P2]; GQ itself precedes no gate
  // - inconsistencies (done with an open predecessor): D1 [P1], GP [P2], sorted by task id: D1, GP
  // Grouped by kind, not by gate: the missing gate (security-verified) comes before the open fw-integrated.
  const document = docOf([
    gate('GQ', 'QA', 'qa-complete', ['GF', 'GP']),
    task('D1', 'SPS', 1, { status: 'done', predecessors: ['P1'] }),
    gate('GP', 'App', 'app-integration', ['P2'], { status: 'done' }),
    gate('GF', 'FW', 'fw-integrated', ['P1']),
    task('P2', 'App', 1),
    task('P1', 'FW', 2),
  ])
  // Schedule: P1 FW [0,1]; P2 App [0,0]; D1, GP done; GF after P1: start 2 / finish 1; GQ after GF (1) and GP (-1):
  // start 2 / finish 1. Latest finish among open tasks is 1 (P1, GF, GQ) -> smallest id GF. GF starts on 2: P1
  // finishes on 1 -> P1; P1 starts on 0 -> stop. Chain [GF, P1]; both block, so critical blockers [GF, P1].
  const forecast = forecastOf(at('P1', 0, 1), at('P2', 0, 0), done('D1'), done('GP'), at('GF', 2, 1), at('GQ', 2, 1))

  it('reports missing gates, open gates, the blocking-tasks reason, then the inconsistencies sorted by task id', () => {
    expect(assess(document, forecast)).toStrictEqual({
      ready: false,
      reasons: [
        missing('security-verified'),
        openGate('fw-integrated', 'GF'),
        openGate('qa-complete', 'GQ'),
        blocking('GF', 'P1', 'P2'),
        inconsistent('D1', 'P1'),
        inconsistent('GP', 'P2'),
      ],
      // GQ is blocked by GF only (GP is done); D1 by P1; GF by P1; GP by P2; P1 and P2 have no predecessors
      blockedBy: { D1: ['P1'], GF: ['P1'], GP: ['P2'], GQ: ['GF'] },
      blockingTasks: ['GF', 'P1', 'P2'],
      drivingChain: ['GF', 'P1'],
      criticalBlockers: ['GF', 'P1'],
      inconsistencies: [
        { taskId: 'D1', openPredecessors: ['P1'] },
        { taskId: 'GP', openPredecessors: ['P2'] },
      ],
    })
  })
})

// ================================================================= READY

describe('READY', () => {
  it('all four gates exist and are done, nothing is open: ready with no reason', () => {
    const result = assessScheduled(docOf(gateSet()))
    expect(result).toStrictEqual({
      ready: true,
      reasons: [],
      blockedBy: {},
      blockingTasks: [],
      drivingChain: [], // every task is done
      criticalBlockers: [],
      inconsistencies: [],
    })
  })

  it('ready ignores an open task that precedes no gate; the chain still lists it', () => {
    // all gates done; X (todo) comes after a done gate and precedes nothing: X starts on 0 (done predecessor) and
    // finishes on 1. Not a predecessor of a gate -> not blocking. Chain [X]. X's only predecessor is done -> blockedBy {}.
    const tasks = [...gateSet(), task('X', 'App', 2, { predecessors: ['G-qa-complete'] })]
    const result = assess(docOf(tasks), forecastOf(...GATES.map((g) => done(`G-${g}`)), at('X', 0, 1)))
    expect(result).toStrictEqual({
      ready: true,
      reasons: [],
      blockedBy: {},
      blockingTasks: [],
      drivingChain: ['X'],
      criticalBlockers: [],
      inconsistencies: [],
    })
  })
})

// ================================================================= clarification 2a

describe('inconsistencies never decide readiness alone (ADR-002 clarification 2a)', () => {
  // O1, O2 (todo) precede only the done tasks Dz and Da, which precede no gate, so nothing open precedes a gate:
  // blockingTasks is empty. Dz (done) after O2, O1; Da (done) after O1. Inconsistencies sorted by task id: Da, Dz.
  const inconsistentTasks = (): Task[] => [
    task('Dz', 'App', 1, { status: 'done', predecessors: ['O2', 'O1'] }),
    task('O1', 'FW', 2),
    task('Da', 'SPS', 1, { status: 'done', predecessors: ['O1'] }),
    task('O2', 'Security', 1),
  ]
  const expectedInconsistencies = [
    { taskId: 'Da', openPredecessors: ['O1'] },
    { taskId: 'Dz', openPredecessors: ['O1', 'O2'] },
  ]

  it('with all four gates done an inconsistency alone stays READY: no reason, but it is reported', () => {
    // O1 [0,1], O2 [0,0] are the open tasks; latest finish O1 -> chain [O1] (start 0, no binder). blockedBy lists the
    // done tasks' open predecessors.
    const result = assessScheduled(docOf([...gateSet(), ...inconsistentTasks()]))
    expect(result.ready).toBe(true)
    expect(result.reasons).toStrictEqual([])
    expect(result.blockingTasks).toStrictEqual([])
    expect(result.inconsistencies).toStrictEqual(expectedInconsistencies)
    expect(result.blockedBy).toStrictEqual({ Da: ['O1'], Dz: ['O1', 'O2'] })
    expect(result.drivingChain).toStrictEqual(['O1'])
  })

  it('alongside another reason the inconsistencies are listed last, one reason per task sorted by id', () => {
    // same tasks, but qa-complete is not defined: NOT READY, missing gate first, then Da, then Dz
    const result = assessScheduled(docOf([...gateSet({ 'qa-complete': 'missing' }), ...inconsistentTasks()]))
    expect(result.ready).toBe(false)
    expect(result.reasons).toStrictEqual([
      missing('qa-complete'),
      inconsistent('Da', 'O1'),
      inconsistent('Dz', 'O1', 'O2'),
    ])
    expect(result.inconsistencies).toStrictEqual(expectedInconsistencies)
  })

  it('a done task whose predecessors are all done is not an inconsistency', () => {
    const document = docOf([
      task('A', 'FW', 1, { status: 'done' }),
      task('B', 'App', 1, { status: 'done', predecessors: ['A'] }),
    ])
    expect(assessScheduled(document).inconsistencies).toStrictEqual([])
  })
})

// ================================================================= fixtures/release.json

describe('fixtures/release.json scheduled with the real schedule()', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../fixtures/release.json', import.meta.url), 'utf8')) as ReleaseDocument
  const withFwEstimate = (days: number): ReleaseDocument => ({
    ...fixture,
    tasks: fixture.tasks.map((t) => (t.id === 'FW-03' ? { ...t, estimateDays: days } : t)),
  })

  /**
   * Hand derivation of the baseline (fixtures/README.md; day 0 = Mon 2027-01-04; done tasks FW-01, SPS-01, SEC-01,
   * APP-01 finish on -1).
   * FW: FW-02 0-2, FW-03 3-7, FW-04 8-11, FW-05 12-13, gate FW-06 start 14 / fin 13.
   * SPS: SPS-02 0-2, SPS-03 3-6, SPS-04 after SPS-03 (6) and FW-04 (11): earliest 12 -> 12-14.
   * Security: SEC-02 0-2, SEC-03 after SEC-02 (2) and FW-05 (13): 14-17, SEC-04 after SEC-03 (17) and SPS-04 (14):
   *   18-22, gate SEC-05 start 23 / fin 22.
   * App: APP-02 0-5, APP-04 6-9, APP-03 after APP-02 and FW-06 (13): 14-16, gate APP-05 start 17 / fin 16.
   * QA: QA-01 0-2, QA-02 after QA-01 and FW-06 (13): 14-17, QA-03 after QA-02 (17), APP-05 (16), SEC-05 (22): 23-27,
   *   gate QA-04 start 28 / fin 27.
   * Delayed (FW-03 = 8 days): FW-03 3-10, FW-04 11-14, FW-05 15-16, FW-06 fin 16, SEC-03 17-20, SEC-04 21-25,
   * SEC-05 fin 25, QA-03 26-30, QA-04 fin 30 (SPS-04 15-17, APP-05 fin 19, QA-02 17-20 all earlier).
   */
  it('hand-derived baseline and delayed finishes agree with the scheduler (guard for the derivation below)', () => {
    const finishes = (document: ReleaseDocument) =>
      Object.fromEntries(schedule(document).tasks.map((t) => [t.id, [t.start, t.finish]]))
    const base = finishes(fixture)
    expect(base['FW-03']).toStrictEqual([3, 7])
    expect(base['SEC-04']).toStrictEqual([18, 22])
    expect(base['SEC-05']![1]).toBe(22)
    expect(base['QA-03']).toStrictEqual([23, 27])
    expect(base['QA-04']![1]).toBe(27) // ties QA-03 on the latest finish
    expect(base['SPS-04']![1]).toBe(14)
    expect(base['APP-05']![1]).toBe(16)
    const delayed = finishes(withFwEstimate(8))
    expect(delayed['FW-03']).toStrictEqual([3, 10])
    expect(delayed['QA-03']).toStrictEqual([26, 30])
    expect(delayed['QA-04']![1]).toBe(30)
  })

  // Open tasks (20): FW-02..06, SPS-02..04, SEC-02..05, APP-02..05, QA-01..04.
  // Blocking tasks = open predecessors (transitive) of the four gate tasks FW-06, SEC-05, APP-05, QA-04. QA-04 is the
  // last gate: every other open task precedes it (QA-03 <- QA-02 <- QA-01, FW-06; APP-05 <- APP-03, APP-04 <- APP-02;
  // SEC-05 <- SEC-04 <- SEC-03, SPS-04 <- SPS-03 <- SPS-02, FW-04; SEC-03 <- SEC-02, FW-05; FW-05 <- FW-04 <- FW-03
  // <- FW-02), so all of them block except QA-04 itself, which precedes no gate: 19 tasks, code-unit sorted.
  const BLOCKING = [
    'APP-02', 'APP-03', 'APP-04', 'APP-05',
    'FW-02', 'FW-03', 'FW-04', 'FW-05', 'FW-06',
    'QA-01', 'QA-02', 'QA-03',
    'SEC-02', 'SEC-03', 'SEC-04', 'SEC-05',
    'SPS-02', 'SPS-03', 'SPS-04',
  ]

  // Driving chain (literal ADR §7). Latest finish among open tasks is 27: QA-03 (23-27) and the gate QA-04 (fin 27).
  // Tie -> smallest id 'QA-03'. QA-03 starts on 23: predecessors finishing on 22: SEC-05 (22) -> SEC-05 (QA-02 17,
  // APP-05 16 have slack). SEC-05 starts on 23: SEC-04 finishes on 22 -> SEC-04 (18-22). Predecessors finishing on
  // 17: SEC-03 (17); SPS-04 finishes on 14 (slack) -> SEC-03 (14-17). Predecessors finishing on 13: FW-05 (13);
  // SEC-02 (2) -> FW-05 (12-13) -> FW-04 (8-11) -> FW-03 (3-7) -> FW-02 (0-2). FW-02's only predecessor FW-01 is done
  // and its capacity binder does not exist (FW-01 is done, so it never set streamFree) -> stop.
  // Note: README lists QA-04 at the end of its zero-slack chain; the literal tie rule starts one task earlier, at QA-03.
  const CHAIN = ['QA-03', 'SEC-05', 'SEC-04', 'SEC-03', 'FW-05', 'FW-04', 'FW-03', 'FW-02']

  it('is NOT READY: no gate is missing, all four are open, 19 tasks block and nothing is inconsistent', () => {
    const result = assessScheduled(fixture)
    expect(result.ready).toBe(false)
    // gates in GATES order: fw-integrated FW-06, security-verified SEC-05, app-integration APP-05, qa-complete QA-04
    expect(result.reasons).toStrictEqual([
      openGate('fw-integrated', 'FW-06'),
      openGate('security-verified', 'SEC-05'),
      openGate('app-integration', 'APP-05'),
      openGate('qa-complete', 'QA-04'),
      blocking(...BLOCKING),
    ])
    expect(result.blockingTasks).toStrictEqual(BLOCKING)
    expect(result.blockingTasks).not.toContain('QA-04')
    expect(result.inconsistencies).toStrictEqual([]) // the four done tasks have no predecessors
  })

  it('the driving chain contains FW-03 and is the zero-slack chain from the README (from QA-03 backwards)', () => {
    const result = assessScheduled(fixture)
    expect(result.drivingChain).toContain('FW-03')
    expect(result.drivingChain).toStrictEqual(CHAIN)
  })

  it('every chain task is a blocking task, so the critical blockers are the whole chain, in chain order', () => {
    // QA-03, SEC-05, SEC-04, SEC-03, FW-05, FW-04, FW-03, FW-02 are all in BLOCKING; chain order is not id order
    expect(assessScheduled(fixture).criticalBlockers).toStrictEqual(CHAIN)
  })

  // Direct open predecessors of each task (done: FW-01, SPS-01, SEC-01, APP-01), sorted by code-unit id.
  it('blockedBy lists the open direct predecessors of the 15 blocked tasks', () => {
    expect(assessScheduled(fixture).blockedBy).toStrictEqual({
      'FW-03': ['FW-02'],
      'FW-04': ['FW-03'],
      'FW-05': ['FW-04'],
      'FW-06': ['FW-05'],
      'SPS-03': ['SPS-02'],
      'SPS-04': ['FW-04', 'SPS-03'],
      'SEC-03': ['FW-05', 'SEC-02'],
      'SEC-04': ['SEC-03', 'SPS-04'],
      'SEC-05': ['SEC-04'],
      'APP-03': ['APP-02', 'FW-06'],
      'APP-04': ['APP-02'],
      'APP-05': ['APP-03', 'APP-04'],
      'QA-02': ['FW-06', 'QA-01'],
      'QA-03': ['APP-05', 'QA-02', 'SEC-05'],
      'QA-04': ['QA-03'],
      // FW-02, SPS-02, SEC-02, APP-02 have only done predecessors; QA-01 and the four done tasks have none
    })
  })

  it('the FW-delay scenario (FW-03 = 8 days) keeps the same chain: 27 -> 30, QA-03 still first by id', () => {
    // see the derivation above: QA-03 and QA-04 tie again on 30; SEC-05 fin 25 = 26 - 1; SEC-04 21-25; SEC-03 17-20
    // (SPS-04 ends on 17, not 20); FW-05 15-16; FW-04 11-14; FW-03 3-10; FW-02 0-2
    const result = assessScheduled(withFwEstimate(8))
    expect(result.drivingChain).toStrictEqual(CHAIN)
    expect(result.criticalBlockers).toStrictEqual(CHAIN)
    expect(result.blockingTasks).toStrictEqual(BLOCKING)
  })

  it('with every task done it is READY and the chain is empty', () => {
    const allDone: ReleaseDocument = { ...fixture, tasks: fixture.tasks.map((t) => ({ ...t, status: 'done' })) }
    expect(assessScheduled(allDone)).toStrictEqual({
      ready: true,
      reasons: [],
      blockedBy: {},
      blockingTasks: [],
      drivingChain: [],
      criticalBlockers: [],
      inconsistencies: [],
    })
  })

  it('with only the last gate open: one open-gate reason, nothing blocks, chain [QA-04]', () => {
    // QA-04 precedes no gate, so nothing blocks; it is the only open task: 0-day gate with only done predecessors, start 0
    const almost: ReleaseDocument = {
      ...fixture,
      tasks: fixture.tasks.map((t) => ({ ...t, status: t.id === 'QA-04' ? 'todo' : 'done' })),
    }
    const result = assessScheduled(almost)
    expect(result.ready).toBe(false)
    expect(result.reasons).toStrictEqual([openGate('qa-complete', 'QA-04')])
    expect(result.blockingTasks).toStrictEqual([])
    expect(result.drivingChain).toStrictEqual(['QA-04'])
    expect(result.criticalBlockers).toStrictEqual([])
    expect(result.blockedBy).toStrictEqual({}) // every predecessor of QA-04 is done
  })

  it('does not depend on the order of tasks or predecessors in the document or the forecast', () => {
    const reference = assessScheduled(fixture)
    const rotated = [...fixture.tasks.slice(7), ...fixture.tasks.slice(0, 7)].map((t) => ({
      ...t,
      predecessors: [...t.predecessors].reverse(),
    }))
    const shuffled: ReleaseDocument = { ...fixture, tasks: rotated }
    expect(assess(shuffled, forecastOf(...[...schedule(fixture).tasks].reverse()))).toStrictEqual(reference)
  })
})

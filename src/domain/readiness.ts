/**
 * Blocking tasks, driving chain and release readiness (ADR-002 §7-8). Pure: no I/O, no clock, no randomness.
 * Preconditions, not re-checked: the document passed validateDocument (known ids, no cycles, each gate on at most one
 * task) and the forecast was scheduled from it (one entry per task, open tasks have a start).
 */
import { GATES, type Gate, type ReleaseDocument, type Task } from './types'

/** The part of the scheduler's `Forecast` (src/domain/schedule.ts) this module reads. */
export type ForecastLike = { tasks: { id: string; start?: number; finish: number; capacityBinder?: string }[] }

/** A done task with predecessors that are not done (ADR-002 §7). */
export interface Inconsistency {
  taskId: string
  openPredecessors: string[]
}

export type NotReadyReason =
  | { kind: 'missing-gate'; gate: Gate; message: string }
  | { kind: 'open-gate'; gate: Gate; taskId: string; message: string }
  | { kind: 'blocking-tasks'; taskIds: string[]; message: string }
  | { kind: 'inconsistency'; taskId: string; openPredecessors: string[]; message: string }

export interface Readiness {
  ready: boolean
  /** Empty if and only if `ready`. Order: missing gates, open gates, blocking tasks, inconsistencies (§8). */
  reasons: NotReadyReason[]
  /** §7 task level: task id -> its direct predecessors that are not done, sorted by id; only tasks with at least one. */
  blockedBy: Record<string, string[]>
  /** §7 release level: tasks not done that are direct or transitive predecessors of a gate task, sorted by id. */
  blockingTasks: string[]
  /** §7: task ids from the end task backwards; empty when every task is done. */
  drivingChain: string[]
  /** §7: `blockingTasks` on the driving chain, in chain order. */
  criticalBlockers: string[]
  /** Sorted by task id. Never makes the release NOT READY on its own (ADR-002 clarification 2a). */
  inconsistencies: Inconsistency[]
}

/** Code-unit order (not localeCompare), so the result does not depend on the runtime's locale. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function assessReadiness(doc: ReleaseDocument, forecast: ForecastLike): Readiness {
  const tasks = new Map(doc.tasks.map((t) => [t.id, t]))
  const slots = new Map(forecast.tasks.map((t) => [t.id, t]))
  const sorted = [...doc.tasks].sort((a, b) => compareIds(a.id, b.id))
  const isOpen = (id: string) => tasks.get(id)!.status !== 'done'
  const slot = (id: string) => {
    const found = slots.get(id)
    if (!found) throw new Error(`readiness: task ${id} is not in the forecast`)
    return found
  }

  // §7 task level: direct predecessors not done, for every task of any status. A done task that has some is an inconsistency.
  const blocked: [string, string[]][] = []
  const inconsistencies: Inconsistency[] = []
  for (const task of sorted) {
    const openPredecessors = task.predecessors.filter(isOpen).sort(compareIds)
    if (openPredecessors.length === 0) continue
    blocked.push([task.id, openPredecessors])
    if (task.status === 'done') inconsistencies.push({ taskId: task.id, openPredecessors })
  }
  // Null prototype: a task id such as `constructor` must never find an inherited Object property (reviewer #4342).
  const blockedBy: Record<string, string[]> = Object.assign(Object.create(null), Object.fromEntries(blocked))

  // §7 release level: open tasks that precede a gate task, directly or through any path (also through done tasks).
  const ancestors = new Set<string>()
  const toVisit = doc.tasks.filter((t) => t.gate !== undefined).flatMap((t) => t.predecessors)
  for (let id = toVisit.pop(); id !== undefined; id = toVisit.pop()) {
    if (ancestors.has(id)) continue
    ancestors.add(id)
    toVisit.push(...tasks.get(id)!.predecessors)
  }
  const blockingTasks = [...ancestors].filter(isOpen).sort(compareIds)

  // §7 driving chain: the predecessor or capacity binder that finishes the day before X starts.
  const stepFrom = (task: Task): string | undefined => {
    const { start, capacityBinder } = slot(task.id)
    if (start === undefined) return undefined
    const binding = task.predecessors.filter((p) => isOpen(p) && slot(p).finish === start - 1).sort(compareIds)
    if (binding[0] !== undefined) return binding[0]
    return capacityBinder !== undefined && slot(capacityBinder).finish === start - 1 ? capacityBinder : undefined
  }
  const drivingChain: string[] = []
  // `sorted` is in ascending id order, so on equal finishes the first (smallest id) open task is kept.
  let current = sorted.filter((t) => t.status !== 'done').reduce<Task | undefined>(
    (end, t) => (end === undefined || slot(t.id).finish > slot(end.id).finish ? t : end),
    undefined,
  )
  while (current !== undefined) {
    drivingChain.push(current.id)
    const next = stepFrom(current)
    current = next === undefined ? undefined : tasks.get(next)
  }
  const criticalBlockers = drivingChain.filter((id) => blockingTasks.includes(id))

  // §8 readiness: one reason per failed condition, in a fixed order.
  const reasons: NotReadyReason[] = []
  const gateTasks = GATES.map((gate) => ({ gate, task: doc.tasks.find((t) => t.gate === gate) }))
  for (const { gate, task } of gateTasks) {
    if (task === undefined) reasons.push({ kind: 'missing-gate', gate, message: `gate ${gate} not defined` })
  }
  for (const { gate, task } of gateTasks) {
    if (task !== undefined && task.status !== 'done') {
      reasons.push({ kind: 'open-gate', gate, taskId: task.id, message: `gate ${gate} is not done (task ${task.id})` })
    }
  }
  if (blockingTasks.length > 0) {
    reasons.push({ kind: 'blocking-tasks', taskIds: blockingTasks, message: `blocking tasks not done: ${blockingTasks.join(', ')}` })
  }
  // Clarification 2a: inconsistencies are listed only alongside another reason; they never fail readiness alone.
  if (reasons.length > 0) {
    for (const { taskId, openPredecessors } of inconsistencies) {
      reasons.push({
        kind: 'inconsistency',
        taskId,
        openPredecessors,
        message: `task ${taskId} is done but predecessors are not: ${openPredecessors.join(', ')}`,
      })
    }
  }

  return { ready: reasons.length === 0, reasons, blockedBy, blockingTasks, drivingChain, criticalBlockers, inconsistencies }
}

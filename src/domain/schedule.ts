/**
 * Deterministic serial list scheduler (ADR-002 §1, §3-6). Pure: no I/O, no clock, no randomness.
 * Input order of tasks and predecessors never affects the result; `id` is the only tie-breaker.
 */
import { firstWorkingDay, slipDays, workingDayDate } from './calendar'
import type { IsoDate, ReleaseDocument, Task } from './types'

export interface ScheduledTask {
  id: string
  /** day index; undefined for done tasks (§2: finished before day 0, occupy nothing) */
  start?: number
  /** day index; done tasks: -1; 0-day gate: earliest - 1 */
  finish: number
  finishDate: IsoDate // workingDayDate(day0, finish)
  /** §5: task that last set streamFree of its stream before this task was scheduled; absent for first task of a stream, 0-day gates, done tasks */
  capacityBinder?: string
  /** §6, only when the task has a targetDate */
  slipDays?: number
}

export interface Forecast {
  day0: IsoDate
  /** sorted by id ascending (code-unit), so JSON output is order-independent */
  tasks: ScheduledTask[]
  /** §6: latest finish over all tasks */
  finish: number
  finishDate: IsoDate
  /** only when release.targetDate is set */
  slipDays?: number
}

/** Code-unit order (not localeCompare), so the result does not depend on the runtime's locale. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Precondition: doc passed validateDocument (no cycles, known ids). Not re-validated here. */
export function schedule(doc: ReleaseDocument): Forecast {
  const day0 = firstWorkingDay(doc.release.startDate)
  const finishes = new Map<string, number>()
  const placed = new Map<string, { start?: number; finish: number; capacityBinder?: string }>()
  const streamFree = new Map<string, number>()
  const streamLastSetter = new Map<string, string>()

  // §5.1: done tasks finish on day -1, occupy nothing and are scheduled first.
  for (const task of doc.tasks) {
    if (task.status === 'done') {
      finishes.set(task.id, -1)
      placed.set(task.id, { finish: -1 })
    }
  }

  // §5.2-3: repeatedly place the eligible task with the smallest earliest day, ties by smallest id.
  const pending = doc.tasks.filter((task) => task.status !== 'done')
  while (pending.length > 0) {
    let best: { task: Task; earliest: number; index: number } | undefined
    for (const [index, task] of pending.entries()) {
      if (!task.predecessors.every((id) => finishes.has(id))) continue
      const ready = 1 + Math.max(-1, ...task.predecessors.map((id) => finishes.get(id)!))
      // 0-day gates ignore streamFree; recomputed on every iteration because streamFree changes.
      const earliest = task.estimateDays === 0 ? ready : Math.max(ready, streamFree.get(task.stream) ?? 0)
      if (!best || earliest < best.earliest || (earliest === best.earliest && compareIds(task.id, best.task.id) < 0)) {
        best = { task, earliest, index }
      }
    }
    if (!best) throw new Error('schedule: no eligible task; the document has a cycle or an unknown predecessor')

    const { task, earliest, index } = best
    pending.splice(index, 1)
    const start = earliest
    const finish = start + task.estimateDays - 1
    if (task.estimateDays === 0) {
      placed.set(task.id, { start, finish })
    } else {
      const capacityBinder = streamLastSetter.get(task.stream)
      placed.set(task.id, { start, finish, ...(capacityBinder === undefined ? {} : { capacityBinder }) })
      streamFree.set(task.stream, finish + 1)
      streamLastSetter.set(task.stream, task.id)
    }
    finishes.set(task.id, finish)
  }

  const tasks: ScheduledTask[] = [...doc.tasks]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((task) => {
      const { start, finish, capacityBinder } = placed.get(task.id)!
      const finishDate = workingDayDate(day0, finish)
      return {
        id: task.id,
        ...(start === undefined ? {} : { start }),
        finish,
        finishDate,
        ...(capacityBinder === undefined ? {} : { capacityBinder }),
        ...(task.targetDate === undefined ? {} : { slipDays: slipDays(task.targetDate, finishDate) }),
      }
    })

  // §6: the release finishes with its latest task; no tasks gives day -1.
  const finish = Math.max(-1, ...tasks.map((t) => t.finish))
  const finishDate = workingDayDate(day0, finish)
  return {
    day0,
    tasks,
    finish,
    finishDate,
    ...(doc.release.targetDate === undefined ? {} : { slipDays: slipDays(doc.release.targetDate, finishDate) }),
  }
}

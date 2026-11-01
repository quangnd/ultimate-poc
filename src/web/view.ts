/** Pure view helpers: turn a validated document into what the dashboard shows. No React, no I/O, no clock. */
import { assessReadiness, type Readiness } from '../domain/readiness'
import { schedule, type Forecast, type ScheduledTask } from '../domain/schedule'
import { STATUSES, type IsoDate, type ReleaseDocument, type Status, type Task } from '../domain/types'

export interface TaskRow {
  task: Task
  slot: ScheduledTask
  /** Direct predecessors that are not done (ADR-002 §7 task level); empty when not blocked. */
  waitingOn: string[]
  blocking: boolean
  critical: boolean
}

export interface StreamGroup {
  stream: string
  counts: Record<Status, number>
  rows: TaskRow[]
}

export interface Dashboard {
  doc: ReleaseDocument
  forecast: Forecast
  readiness: Readiness
  tasks: Map<string, TaskRow>
  streams: StreamGroup[]
  /** The driving chain in working order (earliest first), i.e. `readiness.drivingChain` reversed. */
  chainForward: string[]
  /** Open tasks not on the chain whose forecast finish equals the chain's last task, e.g. a 0-day gate that ties it. */
  chainTies: string[]
}

/** Status order within a stream: work in flight first, finished work last. */
const STATUS_ORDER: Record<Status, number> = { in_progress: 0, todo: 1, done: 2 }

export const STATUS_LABEL: Record<Status, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }

export function buildDashboard(doc: ReleaseDocument): Dashboard {
  const forecast = schedule(doc)
  const readiness = assessReadiness(doc, forecast)
  const slots = new Map(forecast.tasks.map((s) => [s.id, s]))
  const blocking = new Set(readiness.blockingTasks)
  const critical = new Set(readiness.criticalBlockers)

  const tasks = new Map<string, TaskRow>()
  for (const task of doc.tasks) {
    tasks.set(task.id, {
      task,
      slot: slots.get(task.id)!,
      waitingOn: readiness.blockedBy[task.id] ?? [],
      blocking: blocking.has(task.id),
      critical: critical.has(task.id),
    })
  }

  const streams = doc.workstreams.map((stream): StreamGroup => {
    const rows = [...tasks.values()]
      .filter((r) => r.task.stream === stream)
      .sort(
        (a, b) =>
          STATUS_ORDER[a.task.status] - STATUS_ORDER[b.task.status] ||
          a.slot.finish - b.slot.finish ||
          (a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0),
      )
    const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.task.status === s).length])) as Record<Status, number>
    return { stream, counts, rows }
  })

  const chainForward = [...readiness.drivingChain].reverse()
  const end = readiness.drivingChain[0]
  const endFinish = end === undefined ? undefined : slots.get(end)!.finish
  const chainTies =
    endFinish === undefined
      ? []
      : doc.tasks
          .filter((t) => t.status !== 'done' && !readiness.drivingChain.includes(t.id) && slots.get(t.id)!.finish === endFinish)
          .map((t) => t.id)
          .sort()

  return { doc, forecast, readiness, tasks, streams, chainForward, chainTies }
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "Wed 10 Feb 2027" from "2027-02-10"; dates are UTC calendar days, as in the domain. */
export function formatDate(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const utc = new Date(Date.UTC(2000, m - 1, d))
  utc.setUTCFullYear(y)
  return DATE_FORMAT.format(utc).replace(',', '')
}

const days = (n: number) => `${n} working day${n === 1 ? '' : 's'}`

/** Slip in words (ADR-002 §6, clarification 1a: positive = late). */
export function slipText(slip: number): string {
  if (slip > 0) return `${days(slip)} late`
  if (slip < 0) return `${days(-slip)} early`
  return 'on target'
}

export type SlipTone = 'late' | 'early' | 'on-target'

export function slipTone(slip: number): SlipTone {
  return slip > 0 ? 'late' : slip < 0 ? 'early' : 'on-target'
}

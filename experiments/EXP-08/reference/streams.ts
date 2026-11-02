import { schedule } from './schedule'
import type { IsoDate, ReleaseDocument, Status } from './types'

export interface StreamSummary {
  stream: string; counts: Record<Status, number>; total: number; remainingDays: number
  blocked: string[]; forecastFinishDate: IsoDate | null
}

export function streamSummary(doc: ReleaseDocument): StreamSummary[] {
  const slots = new Map(schedule(doc).tasks.map((t) => [t.id, t]))
  const status = new Map(doc.tasks.map((t) => [t.id, t.status]))
  return doc.workstreams.map((stream) => {
    const tasks = doc.tasks.filter((t) => t.stream === stream)
    const counts = { todo: 0, in_progress: 0, done: 0 }
    for (const t of tasks) counts[t.status]++
    const blocked = tasks.filter((t) => t.predecessors.some((p) => status.get(p) !== 'done')).map((t) => t.id)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const dates = tasks.map((t) => slots.get(t.id)!.finishDate).sort()
    return {
      stream, counts, total: tasks.length,
      remainingDays: tasks.filter((t) => t.status !== 'done').reduce((n, t) => n + t.estimateDays, 0),
      blocked, forecastFinishDate: dates.at(-1) ?? null,
    }
  })
}

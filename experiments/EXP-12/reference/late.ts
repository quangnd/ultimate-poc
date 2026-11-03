import { assessReadiness } from './readiness'
import { schedule } from './schedule'
import type { IsoDate, ReleaseDocument } from './types'

export interface LateTask {
  id: string
  stream: string
  targetDate: IsoDate
  finishDate: IsoDate
  slipDays: number
  onDrivingChain: boolean
}

export function lateTasks(doc: ReleaseDocument): LateTask[] {
  const forecast = schedule(doc)
  const chain = new Set(assessReadiness(doc, forecast).drivingChain)
  const slots = new Map(forecast.tasks.map((t) => [t.id, t]))
  return doc.tasks
    .filter((t) => t.status !== 'done' && t.targetDate !== undefined && (slots.get(t.id)!.slipDays ?? 0) > 0)
    .map((t) => {
      const slot = slots.get(t.id)!
      return {
        id: t.id,
        stream: t.stream,
        targetDate: t.targetDate!,
        finishDate: slot.finishDate,
        slipDays: slot.slipDays!,
        onDrivingChain: chain.has(t.id),
      }
    })
    .sort((a, b) => b.slipDays - a.slipDays || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

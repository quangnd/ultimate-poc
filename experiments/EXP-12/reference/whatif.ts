import { slipDays } from './calendar'
import { assessReadiness } from './readiness'
import { schedule } from './schedule'
import type { IsoDate, ReleaseDocument } from './types'

export interface DelayImpact {
  taskId: string
  extraDays: number
  beforeFinishDate: IsoDate
  afterFinishDate: IsoDate
  deltaWorkingDays: number
  beforeSlipDays: number | null
  afterSlipDays: number | null
  onDrivingChain: boolean
}
export type DelayErrorCode = 'unknown-task' | 'done-task' | 'invalid-days'
export type DelayResult =
  | { ok: true; impact: DelayImpact }
  | { ok: false; error: { code: DelayErrorCode; message: string } }

export function delayImpact(doc: ReleaseDocument, taskId: string, extraDays: number): DelayResult {
  const task = doc.tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, error: { code: 'unknown-task', message: `unknown task ${taskId}` } }
  if (task.status === 'done') return { ok: false, error: { code: 'done-task', message: `task ${taskId} is done` } }
  if (!Number.isInteger(extraDays) || extraDays <= 0)
    return { ok: false, error: { code: 'invalid-days', message: `extraDays ${extraDays} is not a positive integer` } }
  const before = schedule(doc)
  const delayed: ReleaseDocument = {
    ...doc,
    tasks: doc.tasks.map((t) => (t.id === taskId ? { ...t, estimateDays: t.estimateDays + extraDays } : t)),
  }
  const after = schedule(delayed)
  return {
    ok: true,
    impact: {
      taskId,
      extraDays,
      beforeFinishDate: before.finishDate,
      afterFinishDate: after.finishDate,
      deltaWorkingDays: slipDays(before.finishDate, after.finishDate),
      beforeSlipDays: before.slipDays ?? null,
      afterSlipDays: after.slipDays ?? null,
      onDrivingChain: assessReadiness(doc, before).drivingChain.includes(taskId),
    },
  }
}

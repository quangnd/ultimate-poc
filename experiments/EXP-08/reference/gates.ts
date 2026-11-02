import { schedule } from './schedule'
import { GATES, type Gate, type IsoDate, type ReleaseDocument, type Status } from './types'

export interface GateStatus {
  gate: Gate; defined: boolean; taskId?: string; status?: Status; done: boolean
  forecastFinishDate?: IsoDate; targetDate?: IsoDate; slipDays?: number
}

export function gateStatus(doc: ReleaseDocument): GateStatus[] {
  const slots = new Map(schedule(doc).tasks.map((t) => [t.id, t]))
  return GATES.map((gate) => {
    const task = doc.tasks.find((t) => t.gate === gate)
    if (!task) return { gate, defined: false, done: false }
    const s = slots.get(task.id)!
    return {
      gate, defined: true, taskId: task.id, status: task.status, done: task.status === 'done',
      forecastFinishDate: s.finishDate,
      ...(task.targetDate === undefined ? {} : { targetDate: task.targetDate }),
      ...(s.slipDays === undefined ? {} : { slipDays: s.slipDays }),
    }
  })
}

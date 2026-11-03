/** EXP-10 coordinator reference: import preview diff. Pure. */
import { slipDays } from './calendar'
import { assessReadiness } from './readiness'
import { schedule } from './schedule'
import { GATES, type Gate, type IsoDate, type ReleaseDocument, type Task } from './types'

export const TASK_FIELDS = ['title', 'stream', 'ownerRole', 'status', 'estimateDays', 'targetDate', 'gate'] as const
export type TaskField = (typeof TASK_FIELDS)[number]
export interface FieldChange { field: TaskField; before: string | number | null; after: string | number | null }
export interface TaskChange { id: string; changes: FieldChange[] }
export interface Link { from: string; to: string }
export type GateState = 'missing' | 'open' | 'done'
export interface GateChange { gate: Gate; before: GateState; after: GateState }
export interface ReleaseFieldChange { field: 'startDate' | 'targetDate'; before: IsoDate | null; after: IsoDate | null }
export interface ReleaseDiff {
  unchanged: boolean
  release: ReleaseFieldChange[]
  workstreams: { added: string[]; removed: string[] }
  tasks: { added: string[]; removed: string[]; changed: TaskChange[] }
  links: { added: Link[]; removed: Link[] }
  readiness: { before: boolean; after: boolean; gates: GateChange[] }
  forecast: {
    beforeFinishDate: IsoDate
    afterFinishDate: IsoDate
    deltaWorkingDays: number
    beforeSlipDays: number | null
    afterSlipDays: number | null
  }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const val = (t: Task, f: TaskField): string | number | null => (t[f] === undefined ? null : (t[f] as string | number))

function gateState(doc: ReleaseDocument, gate: Gate): GateState {
  const t = doc.tasks.find((x) => x.gate === gate)
  return t === undefined ? 'missing' : t.status === 'done' ? 'done' : 'open'
}

function links(doc: ReleaseDocument): Map<string, Link> {
  const m = new Map<string, Link>()
  for (const t of doc.tasks) for (const p of t.predecessors) m.set(`${t.id}\u0000${p}`, { from: p, to: t.id })
  return m
}

export function diffReleases(before: ReleaseDocument, after: ReleaseDocument): ReleaseDiff {
  const release: ReleaseFieldChange[] = []
  if (before.release.startDate !== after.release.startDate) {
    release.push({ field: 'startDate', before: before.release.startDate, after: after.release.startDate })
  }
  const bt = before.release.targetDate ?? null
  const at = after.release.targetDate ?? null
  if (bt !== at) release.push({ field: 'targetDate', before: bt, after: at })

  const bs = new Set(before.workstreams)
  const as = new Set(after.workstreams)
  const workstreams = {
    added: [...as].filter((s) => !bs.has(s)).sort(cmp),
    removed: [...bs].filter((s) => !as.has(s)).sort(cmp),
  }

  const bm = new Map(before.tasks.map((t) => [t.id, t]))
  const am = new Map(after.tasks.map((t) => [t.id, t]))
  const added = [...am.keys()].filter((id) => !bm.has(id)).sort(cmp)
  const removed = [...bm.keys()].filter((id) => !am.has(id)).sort(cmp)
  const changed: TaskChange[] = []
  for (const id of [...am.keys()].filter((id) => bm.has(id)).sort(cmp)) {
    const b = bm.get(id)!
    const a = am.get(id)!
    const changes = TASK_FIELDS.filter((f) => val(b, f) !== val(a, f)).map((f) => ({ field: f, before: val(b, f), after: val(a, f) }))
    if (changes.length > 0) changed.push({ id, changes })
  }

  const bl = links(before)
  const al = links(after)
  const byLink = (x: Link, y: Link) => cmp(x.to, y.to) || cmp(x.from, y.from)
  const linkDiff = {
    added: [...al].filter(([k]) => !bl.has(k)).map(([, l]) => l).sort(byLink),
    removed: [...bl].filter(([k]) => !al.has(k)).map(([, l]) => l).sort(byLink),
  }

  const fb = schedule(before)
  const fa = schedule(after)
  const gates = GATES.map((gate) => ({ gate, before: gateState(before, gate), after: gateState(after, gate) })).filter(
    (g) => g.before !== g.after,
  )

  const unchanged =
    release.length === 0 &&
    workstreams.added.length === 0 &&
    workstreams.removed.length === 0 &&
    added.length === 0 &&
    removed.length === 0 &&
    changed.length === 0 &&
    linkDiff.added.length === 0 &&
    linkDiff.removed.length === 0

  return {
    unchanged,
    release,
    workstreams,
    tasks: { added, removed, changed },
    links: linkDiff,
    readiness: { before: assessReadiness(before, fb).ready, after: assessReadiness(after, fa).ready, gates },
    forecast: {
      beforeFinishDate: fb.finishDate,
      afterFinishDate: fa.finishDate,
      deltaWorkingDays: slipDays(fb.finishDate, fa.finishDate),
      beforeSlipDays: fb.slipDays ?? null,
      afterSlipDays: fa.slipDays ?? null,
    },
  }
}

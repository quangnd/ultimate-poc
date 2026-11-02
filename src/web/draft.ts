/** Pure editor model: a draft of the task list, as typed, and where each validation error belongs. No React, no I/O. */
import { assessReadiness, type Readiness } from '../domain/readiness'
import { schedule, type Forecast } from '../domain/schedule'
import { GATES, type ReleaseDocument } from '../domain/types'
import { validateDocument, type ValidationCode, type ValidationError } from '../domain/validate'

export type Field = 'id' | 'title' | 'stream' | 'ownerRole' | 'status' | 'estimate' | 'targetDate' | 'predecessors' | 'gate'

/** One task as the operator typed it. Strings throughout, so a refused value is never rounded, cleared or lost. */
export interface DraftTask {
  /** Stable identity while the id itself is being edited; for stored tasks, their index in the saved document. */
  key: number
  id: string
  title: string
  stream: string
  ownerRole: string
  status: string
  estimate: string
  /** '' = no target date. */
  targetDate: string
  predecessors: string[]
  /** '' = not a gate. */
  gate: string
}

export interface Draft {
  tasks: DraftTask[]
  nextKey: number
}

export function draftFrom(doc: ReleaseDocument): Draft {
  return {
    tasks: doc.tasks.map((t, key) => ({
      key,
      id: t.id,
      title: t.title,
      stream: t.stream,
      ownerRole: t.ownerRole,
      status: t.status,
      estimate: String(t.estimateDays),
      targetDate: t.targetDate ?? '',
      predecessors: [...t.predecessors],
      gate: t.gate ?? '',
    })),
    nextKey: doc.tasks.length,
  }
}

/**
 * A whole number when the text is one ("3", "3.0", "-2"), so the validator judges its value. Anything else stays text
 * and is refused, including every nonzero fraction: `Number("1.0000000000000001")` is 1, which would silently drop the
 * fraction the operator typed (reviewer #5081).
 */
export function parseEstimate(text: string): number | string {
  const trimmed = text.trim()
  return /^[+-]?\d+(\.0*)?$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)) ? Number(trimmed) : text
}

/** The whole document the draft would store, field order as in the fixture; it is validated, never repaired. */
export function toDocument(base: ReleaseDocument, draft: Draft): unknown {
  return {
    ...base,
    tasks: draft.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      stream: t.stream,
      ownerRole: t.ownerRole,
      status: t.status,
      estimateDays: parseEstimate(t.estimate),
      ...(t.targetDate !== '' ? { targetDate: t.targetDate } : {}),
      predecessors: [...t.predecessors],
      ...(t.gate !== '' ? { gate: t.gate } : {}),
    })),
  }
}

export type Checked =
  | { ok: true; doc: ReleaseDocument; forecast: Forecast; readiness: Readiness }
  | { ok: false; errors: ValidationError[] }

/** Validates the draft as the server will, and only then schedules it (ADR-002 §9). */
export function check(base: ReleaseDocument, draft: Draft): Checked {
  const result = validateDocument(toDocument(base, draft))
  if (!result.ok) return result
  const forecast = schedule(result.document)
  return { ok: true, doc: result.document, forecast, readiness: assessReadiness(result.document, forecast) }
}

export interface Changes {
  /** Keys of stored tasks whose draft differs from the stored task. */
  edited: Set<number>
  added: Set<number>
  deleted: { key: number; id: string }[]
  any: boolean
}

/** What the draft changes against the stored document; a stored task's key is its index there. */
export function changesOf(base: ReleaseDocument, draft: Draft): Changes {
  const tasks = (toDocument(base, draft) as ReleaseDocument).tasks
  const edited = new Set<number>()
  const added = new Set<number>()
  draft.tasks.forEach((t, i) => {
    const original = base.tasks[t.key]
    if (t.key >= base.tasks.length || !original) added.add(t.key)
    else if (JSON.stringify(tasks[i]) !== JSON.stringify(original)) edited.add(t.key)
  })
  const kept = new Set(draft.tasks.map((t) => t.key))
  const deleted = base.tasks.flatMap((t, key) => (kept.has(key) ? [] : [{ key, id: t.id }]))
  // Same tasks, same content, but reordered still counts: the stored document would change.
  const any = edited.size + added.size + deleted.length > 0 || draft.tasks.some((t, i) => t.key !== i)
  return { edited, added, deleted, any }
}

/** Next free id in the stream's own pattern: FW-06 → FW-07; "SEC-" for a stream without numbered ids. */
export function suggestId(draft: Draft, stream: string): string {
  const taken = new Set(draft.tasks.map((t) => t.id))
  let prefix = `${stream.slice(0, 3).toUpperCase()}-`
  let width = 2
  let next = 1
  for (const t of draft.tasks) {
    const match = t.stream === stream ? /^(.*?)(\d+)$/.exec(t.id) : null
    if (!match) continue
    const n = Number(match[2])
    // Only suffixes well inside the safe-integer range are counted from (reviewers #5081, #5222).
    if (!Number.isSafeInteger(n + draft.tasks.length + 1)) continue
    if (next === 1 || n >= next) {
      prefix = match[1]!
      width = match[2]!.length
      next = Math.max(next, n + 1)
    }
  }
  // At most tasks.length ids can be taken, so one of the next tasks.length + 1 candidates is free: bounded, always safe.
  for (let i = 0; i <= draft.tasks.length; i++) {
    const id = `${prefix}${String(next + i).padStart(width, '0')}`
    if (!taken.has(id)) return id
  }
  throw new Error('unreachable: more candidates than tasks')
}

export function addTask(draft: Draft, stream: string): { draft: Draft; key: number } {
  const key = draft.nextKey
  const task: DraftTask = {
    key,
    id: suggestId(draft, stream),
    title: '',
    stream,
    ownerRole: '',
    status: 'todo',
    estimate: '1',
    targetDate: '',
    predecessors: [],
    gate: '',
  }
  return { draft: { tasks: [...draft.tasks, task], nextKey: key + 1 }, key }
}

/** Removes only the task. Links to it stay, so the validator reports them as unknown predecessors (issue #20). */
export function deleteTask(draft: Draft, key: number): Draft {
  return { ...draft, tasks: draft.tasks.filter((t) => t.key !== key) }
}

/** Puts a deleted stored task back, as it was stored, before the next stored task that follows it. */
export function restoreTask(base: ReleaseDocument, draft: Draft, key: number): Draft {
  const [task] = draftFrom({ ...base, tasks: [base.tasks[key]!] }).tasks
  const at = draft.tasks.findIndex((t) => t.key > key && t.key < base.tasks.length)
  const tasks = [...draft.tasks]
  tasks.splice(at === -1 ? tasks.length : at, 0, { ...task!, key })
  return { ...draft, tasks }
}

/** Ids of the tasks that list `id` as a predecessor. */
export function dependentsOf(draft: Draft, id: string): string[] {
  return draft.tasks.filter((t) => t.predecessors.includes(id)).map((t) => t.id)
}

const FIELD: Partial<Record<ValidationCode, Field>> = {
  'missing-id': 'id',
  'duplicate-id': 'id',
  'invalid-title': 'title',
  'unknown-stream': 'stream',
  'invalid-owner-role': 'ownerRole',
  'unknown-status': 'status',
  'invalid-estimate': 'estimate',
  'invalid-target-date': 'targetDate',
  'invalid-predecessors': 'predecessors',
  'unknown-predecessor': 'predecessors',
  'self-predecessor': 'predecessors',
  'repeated-predecessor': 'predecessors',
  cycle: 'predecessors',
  'unknown-gate': 'gate',
  'duplicate-gate': 'gate',
}

/** An error and the draft tasks (by key) and field it concerns; no keys means it concerns the release as a whole. */
export interface PlacedError {
  error: ValidationError
  keys: number[]
  field?: Field
}

export function placeErrors(errors: readonly ValidationError[], draft: Draft): PlacedError[] {
  const keysWhere = (pick: (t: DraftTask) => boolean) => draft.tasks.filter(pick).map((t) => t.key)
  return errors.map((error) => {
    const field = FIELD[error.code]
    if (field === undefined) return { error, keys: [] }
    if (error.cycle) {
      const ids = new Set(error.cycle)
      return { error, field, keys: keysWhere((t) => ids.has(t.id)) }
    }
    if (error.code === 'duplicate-gate') {
      const gate = GATES.find((g) => error.message.startsWith(`duplicate gate ${g} `))
      return { error, field, keys: keysWhere((t) => t.gate === gate) }
    }
    if (error.taskId !== undefined) {
      // With a duplicated id, only the task that holds the named link is meant.
      const link = linkOf(error)
      return { error, field, keys: keysWhere((t) => t.id === error.taskId && (link === undefined || t.predecessors.includes(link))) }
    }
    // The validator names no task when the task has no id; `release.targetDate` is the release's own field.
    if (error.message.startsWith('release.')) return { error, keys: [] }
    return { error, field, keys: keysWhere((t) => t.id === '') }
  })
}

/** The predecessor an unknown- or repeated-predecessor error names: "unknown predecessor X on task Y". */
function linkOf(error: ValidationError): string | undefined {
  const prefix = { 'unknown-predecessor': 'unknown predecessor ', 'repeated-predecessor': 'repeated predecessor ' }[error.code as string]
  const suffix = ` on task ${error.taskId}`
  if (prefix === undefined || !error.message.startsWith(prefix) || !error.message.endsWith(suffix)) return undefined
  return error.message.slice(prefix.length, -suffix.length)
}

/** Links that close a reported cycle, as "task>predecessor": each cycle member waits for the next one. */
export function cycleLinks(errors: readonly ValidationError[]): Set<string> {
  const links = new Set<string>()
  for (const { cycle } of errors) {
    if (!cycle) continue
    cycle.forEach((id, i) => links.add(`${id}>${cycle[(i + 1) % cycle.length]}`))
  }
  return links
}

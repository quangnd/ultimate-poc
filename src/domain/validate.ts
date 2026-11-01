/** Release document validator (ADR-002 §2, §8, §9). Pure: no I/O, no clock, no randomness. */
import { GATES, STATUSES, type Gate, type IsoDate, type ReleaseDocument, type Status } from './types'

export type ValidationCode =
  | 'invalid-document'
  | 'invalid-schema-version'
  | 'invalid-start-date'
  | 'invalid-target-date'
  | 'invalid-workstreams'
  | 'invalid-task'
  | 'missing-id'
  | 'duplicate-id'
  | 'invalid-title'
  | 'invalid-owner-role'
  | 'unknown-stream'
  | 'unknown-status'
  | 'invalid-estimate'
  | 'invalid-predecessors'
  | 'unknown-predecessor'
  | 'self-predecessor'
  | 'repeated-predecessor'
  | 'unknown-gate'
  | 'duplicate-gate'
  | 'cycle'

export interface ValidationError {
  code: ValidationCode
  message: string
  taskId?: string
  /** For `cycle`: the ids in visiting order, without repeating the first id at the end. */
  cycle?: string[]
}

export type ValidationResult = { ok: true; document: ReleaseDocument } | { ok: false; errors: ValidationError[] }

const MAX_ESTIMATE_DAYS = 250
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

type Obj = Record<string, unknown>

const isObject = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value)

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0

/** A `YYYY-MM-DD` string that is a real calendar date (proleptic Gregorian, UTC). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (month < 1 || month > 12) return false
  const daysInMonth = month === 2 ? (isLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
  return day >= 1 && day <= daysInMonth
}

const isGate = (value: unknown): value is Gate => (GATES as readonly unknown[]).includes(value)
const isStatus = (value: unknown): value is Status => (STATUSES as readonly unknown[]).includes(value)
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string')

/** Entries of `values` seen more than once, each once, in order of first repetition. */
const repeated = (values: readonly string[]): string[] => {
  const seen = new Set<string>()
  const again = new Set<string>()
  for (const v of values) (seen.has(v) ? again : seen).add(v)
  return [...again]
}

/** Depth-first search over task -> predecessors; the first back-edge closes the reported cycle. */
function findCycle(tasks: Obj[]): string[] | undefined {
  const edges = new Map<string, string[]>()
  for (const t of tasks) edges.set(t.id as string, [])
  for (const t of tasks) {
    const id = t.id as string
    const preds = isStringArray(t.predecessors) ? t.predecessors : []
    edges.set(id, [...new Set(preds)].filter((p) => p !== id && edges.has(p)).sort())
  }

  const done = new Set<string>()
  const path: string[] = []
  const onPath = new Map<string, number>()
  const frames: { id: string; next: number }[] = []
  for (const root of [...edges.keys()].sort()) {
    if (done.has(root)) continue
    path.push(root)
    onPath.set(root, 0)
    frames.push({ id: root, next: 0 })
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!
      const preds = edges.get(frame.id)!
      if (frame.next === preds.length) {
        done.add(frame.id)
        onPath.delete(frame.id)
        path.pop()
        frames.pop()
        continue
      }
      const pred = preds[frame.next++]!
      const index = onPath.get(pred)
      if (index !== undefined) return path.slice(index)
      if (done.has(pred)) continue
      onPath.set(pred, path.length)
      path.push(pred)
      frames.push({ id: pred, next: 0 })
    }
  }
  return undefined
}

/** Validates the whole document and reports every error; the input is returned as-is when valid. */
export function validateDocument(input: unknown): ValidationResult {
  if (!isObject(input)) return { ok: false, errors: [{ code: 'invalid-document', message: 'document must be an object' }] }

  const errors: ValidationError[] = []
  const fail = (code: ValidationCode, message: string, taskId?: string) => {
    errors.push(taskId === undefined ? { code, message } : { code, message, taskId })
  }

  if (input.schemaVersion !== 1) fail('invalid-schema-version', 'schemaVersion must be 1')
  if (!isObject(input.release)) {
    fail('invalid-document', 'release must be an object')
  } else {
    if (!isIsoDate(input.release.startDate)) fail('invalid-start-date', 'release.startDate must be a valid YYYY-MM-DD date')
    if (input.release.targetDate !== undefined && !isIsoDate(input.release.targetDate)) {
      fail('invalid-target-date', 'release.targetDate must be a valid YYYY-MM-DD date')
    }
  }
  if (!isStringArray(input.workstreams)) fail('invalid-workstreams', 'workstreams must be an array of strings')
  if (!Array.isArray(input.tasks)) {
    fail('invalid-document', 'tasks must be an array')
    return { ok: false, errors }
  }

  // Without a workstreams array, "stream is not in workstreams" has no meaning, so it is not reported.
  const workstreams = Array.isArray(input.workstreams) ? (input.workstreams as unknown[]) : undefined
  const tasks: unknown[] = input.tasks
  const objects = tasks.filter(isObject)
  const idOf = (t: Obj) => (typeof t.id === 'string' && t.id !== '' ? t.id : undefined)
  const known = new Set(objects.flatMap((t) => idOf(t) ?? []))

  for (const t of tasks) {
    if (!isObject(t)) {
      fail('invalid-task', 'task must be an object')
      continue
    }
    const id = idOf(t)
    if (id === undefined) fail('missing-id', 'task id must be a non-empty string')
    if (typeof t.title !== 'string') fail('invalid-title', 'title must be a string', id)
    if (workstreams && !workstreams.includes(t.stream)) fail('unknown-stream', `unknown stream ${String(t.stream)}`, id)
    if (typeof t.ownerRole !== 'string') fail('invalid-owner-role', 'ownerRole must be a string', id)
    if (!isStatus(t.status)) fail('unknown-status', `unknown status ${String(t.status)}`, id)
    const min = isGate(t.gate) ? 0 : 1
    if (!Number.isInteger(t.estimateDays) || (t.estimateDays as number) < min || (t.estimateDays as number) > MAX_ESTIMATE_DAYS) {
      fail('invalid-estimate', `estimateDays must be an integer from ${min} to ${MAX_ESTIMATE_DAYS}`, id)
    }
    if (t.targetDate !== undefined && !isIsoDate(t.targetDate)) fail('invalid-target-date', 'targetDate must be a valid YYYY-MM-DD date', id)
    if (!isStringArray(t.predecessors)) {
      fail('invalid-predecessors', 'predecessors must be an array of strings', id)
    } else {
      for (const p of new Set(t.predecessors)) {
        if (!known.has(p)) fail('unknown-predecessor', `unknown predecessor ${p} on task ${id ?? '?'}`, id)
      }
      if (id !== undefined && t.predecessors.includes(id)) fail('self-predecessor', `task ${id} lists itself as a predecessor`, id)
      for (const p of repeated(t.predecessors)) fail('repeated-predecessor', `repeated predecessor ${p} on task ${id ?? '?'}`, id)
    }
    if (t.gate !== undefined && !isGate(t.gate)) fail('unknown-gate', `unknown gate ${String(t.gate)}`, id)
  }

  const ids = objects.flatMap((t) => idOf(t) ?? [])
  for (const id of repeated(ids)) fail('duplicate-id', `duplicate task id ${id}`, id)
  for (const gate of GATES) {
    const owners = objects.filter((t) => t.gate === gate).map((t) => String(t.id))
    if (owners.length > 1) fail('duplicate-gate', `duplicate gate ${gate} on tasks ${owners.join(', ')}`)
  }

  // The dependency graph is undefined while ids are missing or duplicated or a task is not an object.
  if (!errors.some((e) => e.code === 'missing-id' || e.code === 'duplicate-id' || e.code === 'invalid-task')) {
    const cycle = findCycle(objects)
    if (cycle) errors.push({ code: 'cycle', message: `dependency cycle: ${[...cycle, cycle[0]].join(' -> ')}`, taskId: cycle[0]!, cycle })
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, document: input as unknown as ReleaseDocument }
}

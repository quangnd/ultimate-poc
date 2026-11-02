/** Import and export (US-07): read a chosen file, validate it in the browser, summarise it, then send it to the API. */
import { STATUSES, type IsoDate, type ReleaseDocument, type Status } from '../domain/types'
import { validateDocument, type ValidationError } from '../domain/validate'

/** The API's body limit (ADR-001 review trigger); a larger file is refused here, before it is uploaded. */
export const MAX_IMPORT_BYTES = 1024 * 1024

export interface ReleaseSummary {
  tasks: number
  byStatus: Record<Status, number>
  streams: string[]
  startDate: IsoDate
  targetDate?: IsoDate
}

/** What a chosen file turned out to be. `text` is what is sent, so the server checks the very bytes shown here. */
export type ImportCheck =
  | { kind: 'ready'; text: string; document: ReleaseDocument; summary: ReleaseSummary }
  | { kind: 'too-large'; bytes: number }
  | { kind: 'not-json'; detail: string }
  | { kind: 'invalid'; errors: ValidationError[] }

export function summarize(doc: ReleaseDocument): ReleaseSummary {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, doc.tasks.filter((t) => t.status === s).length])) as Record<Status, number>
  const summary: ReleaseSummary = { tasks: doc.tasks.length, byStatus, streams: [...doc.workstreams], startDate: doc.release.startDate }
  if (doc.release.targetDate !== undefined) summary.targetDate = doc.release.targetDate
  return summary
}

/** Pure: parses and validates a file's text. `bytes` is the file's size, checked first so a huge file is never parsed. */
export function checkImport(text: string, bytes = new TextEncoder().encode(text).length): ImportCheck {
  if (bytes > MAX_IMPORT_BYTES) return { kind: 'too-large', bytes }
  // Some editors save a byte-order mark, which JSON.parse (and so the server) refuses.
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch (error) {
    return { kind: 'not-json', detail: (error as Error).message }
  }
  const result = validateDocument(parsed)
  if (!result.ok) return { kind: 'invalid', errors: result.errors }
  return { kind: 'ready', text: body, document: result.document, summary: summarize(result.document) }
}

export type ImportOutcome =
  | { kind: 'imported' }
  | { kind: 'refused'; errors: ValidationError[] }
  | { kind: 'too-large' }
  | { kind: 'failed'; detail: string }

/** Replaces the stored release (`POST /api/import`); the server validates again and stores nothing it refuses. */
export async function importRelease(text: string): Promise<ImportOutcome> {
  let res: Response
  try {
    res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: text,
    })
  } catch (error) {
    return { kind: 'failed', detail: (error as Error).message }
  }
  if (res.status === 413) return { kind: 'too-large' }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { kind: 'failed', detail: `HTTP ${res.status}: the response was not JSON` }
  }
  if (res.ok) return { kind: 'imported' }
  const errors = (body as { errors?: ValidationError[] }).errors
  if (res.status === 400 && Array.isArray(errors)) return { kind: 'refused', errors }
  const error = (body as { error?: string }).error
  return { kind: 'failed', detail: `HTTP ${res.status}${error ? `: ${error}` : ''}` }
}

/** "1.05 MB", "840 KB", "312 bytes": two decimals for MB, so a file just over the 1 MB limit never reads as "1.0 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

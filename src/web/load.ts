/** Loads the release from the loopback API and validates it again on the client (ADR-002 §9: validate before scheduling). */
import { validateDocument } from '../domain/validate'
import { buildDashboard, type Dashboard } from './view'

export interface ProblemItem {
  code: string
  message: string
  taskId?: string
}

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'invalid'; source: 'server' | 'client'; errors: ProblemItem[] }
  | { kind: 'unreachable'; detail: string }
  | { kind: 'ready'; dashboard: Dashboard }

export type SaveOutcome =
  | { kind: 'saved' }
  | { kind: 'refused'; errors: ProblemItem[] }
  | { kind: 'failed'; detail: string }

/** Replaces the stored release (`PUT /api/release`); the server validates again and refuses with `{errors}` (400). */
export async function saveRelease(doc: unknown): Promise<SaveOutcome> {
  let res: Response
  try {
    res = await fetch('/api/release', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(doc, null, 2),
    })
  } catch (error) {
    return { kind: 'failed', detail: (error as Error).message }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { kind: 'failed', detail: `HTTP ${res.status}: the response was not JSON` }
  }
  if (res.ok) return { kind: 'saved' }
  const errors = (body as { errors?: ProblemItem[] }).errors
  if (res.status === 400 && Array.isArray(errors)) return { kind: 'refused', errors }
  const error = (body as { error?: string }).error
  return { kind: 'failed', detail: `HTTP ${res.status}${error ? `: ${error}` : ''}` }
}

export async function loadRelease(): Promise<LoadState> {
  let res: Response
  try {
    res = await fetch('/api/release', { headers: { accept: 'application/json' } })
  } catch (error) {
    return { kind: 'unreachable', detail: (error as Error).message }
  }
  if (res.status === 404) return { kind: 'empty' }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { kind: 'unreachable', detail: `HTTP ${res.status}: the response was not JSON` }
  }
  if (!res.ok) {
    const errors = (body as { errors?: ProblemItem[] }).errors
    if (Array.isArray(errors)) return { kind: 'invalid', source: 'server', errors }
    const error = (body as { error?: string }).error
    return { kind: 'unreachable', detail: `HTTP ${res.status}${error ? `: ${error}` : ''}` }
  }

  const result = validateDocument(body)
  if (!result.ok) return { kind: 'invalid', source: 'client', errors: result.errors }
  return { kind: 'ready', dashboard: buildDashboard(result.document) }
}

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

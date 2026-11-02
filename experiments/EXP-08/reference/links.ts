import type { ReleaseDocument } from './types'
import { validateDocument } from './validate'

export interface LinkError { code: string; message: string; taskId?: string; cycle?: string[] }
export type LinkResult = { ok: true; document: ReleaseDocument } | { ok: false; errors: LinkError[] }

const withPreds = (doc: ReleaseDocument, taskId: string, preds: string[]): ReleaseDocument => {
  const copy = structuredClone(doc)
  copy.tasks.find((t) => t.id === taskId)!.predecessors = preds
  return copy
}

export function addLink(doc: ReleaseDocument, taskId: string, predecessorId: string): LinkResult {
  const task = doc.tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, errors: [{ code: 'unknown-task', message: `unknown task ${taskId}`, taskId }] }
  const next = withPreds(doc, taskId, [...task.predecessors, predecessorId])
  const v = validateDocument(next)
  return v.ok ? { ok: true, document: next } : { ok: false, errors: v.errors }
}

export function removeLink(doc: ReleaseDocument, taskId: string, predecessorId: string): LinkResult {
  const task = doc.tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, errors: [{ code: 'unknown-task', message: `unknown task ${taskId}`, taskId }] }
  if (!task.predecessors.includes(predecessorId)) {
    return { ok: false, errors: [{ code: 'unknown-link', message: `no link ${predecessorId} -> ${taskId}`, taskId }] }
  }
  return { ok: true, document: withPreds(doc, taskId, task.predecessors.filter((p) => p !== predecessorId)) }
}

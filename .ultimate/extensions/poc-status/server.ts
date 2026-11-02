/** POC status: one read-only action that summarises committed evaluation files for the panel. */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JsonValue } from '@earendil-works/chord'
import { defineExtension } from '@earendil-works/pi-durable'
import type { ActionContext } from '../../../server/actions.ts'

export default defineExtension({ name: 'poc-status' })

const STATUS = 'state/PROJECT_STATUS.md'
const SUMMARY = 'experiments/EXP-05/status.json'

/** The file's text, or undefined when it is missing. */
async function text(root: string, path: string) {
  try {
    return await readFile(join(root, path), 'utf8')
  } catch {
    return undefined
  }
}

/** `| D12 | … | severity | …` rows of each `experiments/*\/LOG.md`, counted by severity (the fourth cell). */
async function defects(root: string) {
  const dirs = await readdir(join(root, 'experiments')).catch(() => [] as string[])
  const logs = []
  for (const dir of dirs.sort()) {
    const log = await text(root, `experiments/${dir}/LOG.md`)
    if (!log) continue
    const severities: Record<string, number> = {}
    let total = 0
    for (const line of log.split('\n')) {
      if (!/^\|\s*D\d+\s*\|/.test(line)) continue
      const severity = (line.split('|')[4] ?? '').trim().replace(/\s*\(.*\)$/, '') || 'unknown'
      severities[severity] = (severities[severity] ?? 0) + 1
      total++
    }
    logs.push({ log: `experiments/${dir}/LOG.md`, total, severities })
  }
  return logs
}

type Row = Record<string, string | number>

/** The `key` array of `value` when every row has the given field types; otherwise an error naming the key. */
function rows(value: Record<string, unknown>, key: string, fields: Record<string, 'string' | 'number'>) {
  const list = value[key]
  if (list === undefined) return undefined
  const valid =
    Array.isArray(list) &&
    list.every(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        Object.entries(fields).every(([field, type]) => typeof (row as Row)[field] === type),
    )
  if (!valid) throw new Error(`"${key}" must be a list of { ${Object.keys(fields).join(', ')} }`)
  return (list as Row[]).map((row) => Object.fromEntries(Object.keys(fields).map((field) => [field, row[field]])))
}

/** The summary file's issues, tests and tokens, checked so the panel never renders a malformed shape. */
function checked(value: unknown) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected an object')
  const summary = value as Record<string, unknown>
  return {
    updated: typeof summary.updated === 'string' ? summary.updated : null,
    issues: rows(summary, 'issues', { phase: 'string', open: 'number', closed: 'number', source: 'string' }) ?? null,
    tests: rows(summary, 'tests', { label: 'string', value: 'string', source: 'string' }) ?? null,
    tokens: rows(summary, 'tokens', { phase: 'string', tokens: 'string', cost: 'string', source: 'string' }) ?? null,
  }
}

export const actions = {
  /** No arguments → `{ phase, updated, defects, summary }`; reads files only, never writes or calls the network. */
  async status(_args: JsonValue, ctx: ActionContext) {
    const root = ctx.host.projectRoot
    const status = (await text(root, STATUS)) ?? ''
    const line = /^Current phase:\s*(.+)$/m.exec(status)?.[1]
    // The bold part (`**P3 IN PROGRESS**`) when there is one, else the whole line.
    const phase = (/\*\*(.+?)\*\*/.exec(line ?? '')?.[1] ?? line)?.trim()
    const updated = /^Updated:\s*(.+)$/m.exec(status)?.[1]?.trim()
    const raw = await text(root, SUMMARY)
    let summary: JsonValue = null
    let summaryError: string | undefined
    if (raw === undefined) summaryError = `${SUMMARY} is missing`
    else {
      try {
        summary = checked(JSON.parse(raw)) as JsonValue
      } catch (error) {
        summaryError = `${SUMMARY}: ${(error as Error).message}`
      }
    }
    return {
      phase: phase ?? null,
      updated: updated ?? null,
      defects: await defects(root),
      summary,
      summaryError: summaryError ?? null,
    }
  },
}

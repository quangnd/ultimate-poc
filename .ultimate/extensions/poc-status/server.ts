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
        summary = JSON.parse(raw) as JsonValue
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

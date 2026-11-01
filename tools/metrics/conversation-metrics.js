/**
 * Per-conversation metrics from Ultimate's own APIs, for Release Readiness Lab experiment records.
 *
 * Runs inside Ultimate's `codemode` sandbox (QuickJS): it needs the `ultimate` global and nothing else. It is a plain
 * function declaration, loaded with `new Function` (see README.md). No dependencies, no Node APIs, read-only: it only
 * calls `ultimate.conversations/entries/trace/doc` and never prints entry content (prompts, messages, tool arguments).
 *
 * Sources (see README.md for the full field table):
 *   startedAt / endedAt  stored entries of the conversation itself: oldest / newest timestamp
 *   models[].tokens/cost `pi.usage` document (authoritative for tokens and cost; includes summary and assessment model calls)
 *   models[].calls       entries = stored assistant responses (durable); trace = recorded model calls (retention-limited)
 *   toolCalls            `toolCall` items in stored assistant entries (durable); trace tool rows as a cross-check
 */

const COST_LABEL = 'list-price proxy (subscriptions)'
const TRACE_MAX = 1000 // ultimate.trace() returns at most the newest 1000 rows
const TOKEN_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite']

async function conversationMetrics(ultimate, id, options = {}) {
  const pageSize = options.pageSize ?? 200
  const all = await ultimate.conversations()
  const byId = new Map(all.map((c) => [c.id, c]))
  if (!byId.has(id)) throw new Error(`Unknown conversation ${id}`)

  const result = { schema: 'rrl-conversation-metrics/1', generatedAt: new Date().toISOString(), costLabel: COST_LABEL }
  result.conversation = await one(ultimate, byId.get(id), pageSize)
  if (options.children) {
    // Descendants: subagents (owner link) and branches (parent link), breadth first, flagged by `relation`.
    const seen = new Set([id])
    const queue = [id]
    const children = []
    while (queue.length) {
      const parent = queue.shift()
      for (const c of all) {
        const relation = c.owner?.conversationId === parent ? 'subagent' : c.parent?.conversationId === parent ? 'branch' : undefined
        if (!relation || seen.has(c.id)) continue
        seen.add(c.id)
        queue.push(c.id)
        children.push({ relation, parentId: parent, ...(await one(ultimate, c, pageSize)) })
      }
    }
    result.children = children
    result.combined = combine([result.conversation, ...children])
  }
  return result
}

/** Metrics of one conversation. */
async function one(ultimate, summary, pageSize) {
  const id = summary.id
  const [usage, scan, trace] = await Promise.all([
    ultimate.doc('pi.usage', id),
    scanEntries(ultimate, id, pageSize),
    ultimate.trace({ conversation: id, limit: TRACE_MAX }),
  ])
  const warnings = []
  if (summary.busy) warnings.push('conversation is busy: usage, entries and trace were read at slightly different instants, and endedAt is "so far"')
  if (trace.length >= TRACE_MAX) warnings.push(`trace returned ${TRACE_MAX} rows (its cap, all kinds): older model and tool calls are missing from the trace-based fields`)
  else if (trace[0] && scan.first !== undefined && Date.parse(trace[0].at) - scan.first > 60_000) warnings.push('trace begins over a minute after the first entry: earlier calls may be pruned (retention) or unrecorded')
  if (scan.untimed) warnings.push(`${scan.untimed} own entries have no timestamp and are ignored for startedAt/endedAt`)

  // Trace: model rows per model (`agent` caller = a turn of the conversation, `extension` = summary, assessment and branch calls),
  // tool rows per tool (`agent` caller = issued directly, any other = nested, e.g. tools.read inside codemode).
  const fromTrace = {}
  const nested = { total: 0, byName: {} }
  let directTools = 0
  for (const row of trace) {
    if (row.kind === 'model') {
      const m = (fromTrace[row.name] ??= { agent: 0, extension: 0, failed: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
      if (!row.ok) m.failed++
      else {
        m[row.caller === 'agent' ? 'agent' : 'extension']++
        const r = row.result ? JSON.parse(row.result) : {}
        for (const f of TOKEN_FIELDS) m[f] += r[f] ?? 0
      }
    } else if (row.kind === 'tool') {
      if (row.caller === 'agent') directTools++
      else {
        nested.total++
        nested.byName[row.name] = (nested.byName[row.name] ?? 0) + 1
      }
    }
  }

  const models = {}
  for (const name of new Set([...Object.keys(usage.models), ...Object.keys(scan.models), ...Object.keys(fromTrace)])) {
    const u = usage.models[name]
    const e = scan.models[name]
    const t = fromTrace[name]
    models[name] = {
      calls: { entries: e?.calls ?? 0, traceAgent: t?.agent ?? 0, traceExtension: t?.extension ?? 0, traceFailed: t?.failed ?? 0 },
      tokens: u ? { ...pick(u, TOKEN_FIELDS), total: u.totalTokens } : null,
      costUsd: u ? round(u.cost.total) : null,
      // The same tokens from the other two sources, to reconcile against pi.usage.
      fromEntries: e && { ...pick(e, TOKEN_FIELDS), total: sum(TOKEN_FIELDS.map((f) => e[f])), costUsd: round(e.cost) },
      fromTrace: t && { ...pick(t, TOKEN_FIELDS), total: sum(TOKEN_FIELDS.map((f) => t[f])) },
      entriesMatchUsage: !!(u && e && TOKEN_FIELDS.every((f) => u[f] === e[f])),
      traceMatchesUsage: !!(u && t && TOKEN_FIELDS.every((f) => u[f] === t[f])),
    }
    // On a quiet conversation with a complete trace, a gap means model calls that pi.usage does not account for.
    const traceTotal = t ? sum(TOKEN_FIELDS.map((f) => t[f])) : 0
    if (!summary.busy && trace.length < TRACE_MAX && (u || t) && traceTotal !== (u?.totalTokens ?? 0))
      warnings.push(`${name}: trace tokens (${traceTotal}) differ from pi.usage (${u?.totalTokens ?? 0}); pi.usage is the figure Ultimate accounts`)
    if (u && e && sum(TOKEN_FIELDS.map((f) => e[f])) > u.totalTokens) warnings.push(`${name}: stored assistant entries exceed pi.usage`)
  }
  // Tool buckets of pi.usage (tools that spend model tokens themselves); empty for most conversations.
  const toolBuckets = {}
  for (const [name, b] of Object.entries(usage.tools ?? {})) toolBuckets[name] = { ...pick(b, TOKEN_FIELDS), total: b.totalTokens, costUsd: round(b.cost.total) }

  const buckets = [...Object.values(usage.models), ...Object.values(usage.tools ?? {})]
  const calls = (field) => sum(Object.values(models).map((m) => m.calls[field]))
  const totals = {
    modelCalls: { entries: calls('entries'), traceAgent: calls('traceAgent'), traceExtension: calls('traceExtension') },
    tokens: { ...Object.fromEntries(TOKEN_FIELDS.map((f) => [f, sum(buckets.map((b) => b[f]))])), total: sum(buckets.map((b) => b.totalTokens)) },
    costUsd: round(sum(buckets.map((b) => b.cost.total))),
  }

  return {
    id,
    title: summary.title?.slice(0, 80),
    label: summary.label,
    busy: !!summary.busy,
    startedAt: scan.first && new Date(scan.first).toISOString(),
    endedAt: scan.last && new Date(scan.last).toISOString(),
    elapsedMinutes: scan.first === undefined ? null : round((scan.last - scan.first) / 60000, 2),
    entries: { own: scan.own, forkedHistorySkipped: scan.foreign },
    models,
    toolBuckets,
    totals,
    toolCalls: {
      total: scan.toolCalls.total,
      byName: sortKeys(scan.toolCalls.byName),
      nestedFromTrace: { total: nested.total, byName: sortKeys(nested.byName) },
      checks: { toolResultEntries: scan.toolResults, traceDirect: directTools },
    },
    trace: { rows: trace.length, oldest: trace[0]?.at, truncated: trace.length >= TRACE_MAX },
    warnings,
  }
}

/** Page through every stored entry (newest first), keeping only counts: no entry content is retained. */
async function scanEntries(ultimate, id, pageSize) {
  const scan = { own: 0, foreign: 0, untimed: 0, first: undefined, last: undefined, models: {}, toolCalls: { total: 0, byName: {} }, toolResults: 0 }
  let before
  for (;;) {
    const page = await ultimate.entries(id, { limit: pageSize, ...(before === undefined ? {} : { before }) })
    for (const entry of page) {
      // A branch's history includes its ancestors' entries; they belong to the ancestor.
      if (entry.conversationId !== id) {
        scan.foreign++
        continue
      }
      scan.own++
      const messages = Array.isArray(entry.model) ? entry.model : []
      const times = [...messages.map((m) => m?.timestamp), entry.data?.at].map(stamp).filter((t) => t !== undefined)
      if (!times.length) scan.untimed++
      for (const t of times) {
        if (scan.first === undefined || t < scan.first) scan.first = t
        if (scan.last === undefined || t > scan.last) scan.last = t
      }
      if (entry.kind === 'pi.tool-result') scan.toolResults++
      if (entry.kind !== 'pi.assistant') continue
      for (const m of messages) {
        if (m?.role !== 'assistant') continue
        const b = (scan.models[`${m.provider}/${m.model}`] ??= { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })
        b.calls++
        for (const f of TOKEN_FIELDS) b[f] += m.usage?.[f] ?? 0
        b.cost += m.usage?.cost?.total ?? 0
        for (const c of Array.isArray(m.content) ? m.content : []) {
          if (c?.type !== 'toolCall') continue
          scan.toolCalls.total++
          scan.toolCalls.byName[c.name] = (scan.toolCalls.byName[c.name] ?? 0) + 1
        }
      }
    }
    if (page.length < pageSize) return scan
    before = page[page.length - 1].id
  }
}

/** Sum of the conversation and its descendants. Each has its own usage doc, so nothing is counted twice. */
function combine(list) {
  const models = {}
  const byName = {}
  let first, last, total = 0
  for (const c of list) {
    for (const [name, m] of Object.entries(c.models)) {
      const s = (models[name] ??= { calls: { entries: 0, traceAgent: 0, traceExtension: 0 }, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, costUsd: 0 })
      s.calls.entries += m.calls.entries
      s.calls.traceAgent += m.calls.traceAgent
      s.calls.traceExtension += m.calls.traceExtension
      for (const f of [...TOKEN_FIELDS, 'total']) s.tokens[f] += m.tokens?.[f] ?? 0
      s.costUsd = round(s.costUsd + (m.costUsd ?? 0))
    }
    total += c.toolCalls.total
    for (const [n, k] of Object.entries(c.toolCalls.byName)) byName[n] = (byName[n] ?? 0) + k
    const a = c.startedAt && Date.parse(c.startedAt)
    const b = c.endedAt && Date.parse(c.endedAt)
    if (a && (first === undefined || a < first)) first = a
    if (b && (last === undefined || b > last)) last = b
  }
  return {
    conversations: list.length,
    startedAt: first && new Date(first).toISOString(),
    endedAt: last && new Date(last).toISOString(),
    elapsedMinutes: first === undefined ? null : round((last - first) / 60000, 2),
    models,
    costUsd: round(sum(list.map((c) => c.totals.costUsd))),
    toolCalls: { total, byName: sortKeys(byName) },
  }
}

/** A compact markdown table of one result (the conversation, then each child, then the combined row). */
function metricsMarkdown(result) {
  const rows = [['conversation', 'relation', 'elapsed min', 'model', 'calls (entries / trace agent+extension)', 'input', 'output', 'cacheRead', 'cacheWrite', 'total', 'cost USD', 'tool calls']]
  const add = (label, relation, c) => {
    const names = Object.keys(c.models)
    for (const [i, name] of names.entries()) {
      const m = c.models[name]
      const t = m.tokens ?? { input: '', output: '', cacheRead: '', cacheWrite: '', total: '' }
      rows.push([i ? '' : label, i ? '' : relation, i ? '' : (c.elapsedMinutes ?? ''), name, `${m.calls.entries} / ${m.calls.traceAgent}+${m.calls.traceExtension}`, t.input, t.output, t.cacheRead, t.cacheWrite, t.total, m.costUsd ?? '', i ? '' : c.toolCalls.total])
    }
  }
  add(`#${result.conversation.id}`, 'self', result.conversation)
  for (const c of result.children ?? []) add(`#${c.id}`, c.relation, c)
  if (result.combined) {
    const c = result.combined
    rows.push([`combined (${c.conversations})`, '', c.elapsedMinutes ?? '', '', '', '', '', '', '', '', c.costUsd, c.toolCalls.total])
  }
  const line = (r) => `| ${r.join(' | ')} |`
  return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n') + `\n\nCost: ${result.costLabel}.`
}

/** Epoch ms of a timestamp field: epoch ms (not a small entry id, which `data.at` of lineage entries holds) or an ISO string. */
function stamp(value) {
  if (typeof value === 'number') return value > 1e12 ? value : undefined
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return Date.parse(value)
  return undefined
}
function pick(object, keys) {
  return Object.fromEntries(keys.map((k) => [k, object[k] ?? 0]))
}
function sum(values) {
  return values.reduce((a, b) => a + b, 0)
}
function round(value, digits = 6) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}
function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

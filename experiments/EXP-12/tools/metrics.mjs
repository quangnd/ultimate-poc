// EXP-12 metrics from one arm's preview storage, read-only. Usage: node metrics.mjs <home>
// Prints JSON: per conversation (role, model) calls, tokens, cost, context per call, timing,
// tool-call counts, rereads, sleeps, codemode, messages, errors.
import { DatabaseSync } from 'node:sqlite'
const home = process.argv[2]
const db = new DatabaseSync(`${home}/state.sqlite`, { readOnly: true })
const rows = db.prepare('select id, conversation_id as c, record from entries order by id').all()
const roles = { 41: 'ultimate' }
const conv = {}
const get = (c) => (conv[c] ??= {
  role: roles[c], model: null, calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0,
  costParts: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, context: [], first: null, last: null,
  tools: {}, reads: {}, bash: [], sleeps: 0, codemodeLoops: 0, messages: [], errors: [], stopReasons: {},
})
for (const row of rows) {
  const r = JSON.parse(row.record)
  if (r.kind === 'event.subagents.started') roles[r.data.data.id] = r.data.data.agent
  if (r.kind !== 'pi.assistant') continue
  const m = r.model[0]
  const x = get(row.c)
  x.role = roles[row.c] ?? x.role
  x.model = `${m.provider}/${m.model}`
  x.calls++
  const u = m.usage ?? {}
  x.input += u.input ?? 0; x.cacheRead += u.cacheRead ?? 0; x.cacheWrite += u.cacheWrite ?? 0; x.output += u.output ?? 0
  x.cost += u.cost?.total ?? 0
  for (const k of ['input', 'cacheRead', 'cacheWrite', 'output']) x.costParts[k] += u.cost?.[k] ?? 0
  x.context.push((u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0))
  x.first ??= m.timestamp; x.last = m.timestamp
  x.stopReasons[m.stopReason] = (x.stopReasons[m.stopReason] ?? 0) + 1
  if (m.stopReason === 'error' || m.errorMessage) x.errors.push({ at: new Date(m.timestamp).toISOString(), error: String(m.errorMessage).slice(0, 200) })
  for (const part of m.content ?? []) {
    if (part.type !== 'toolCall') continue
    x.tools[part.name] = (x.tools[part.name] ?? 0) + 1
    const a = part.arguments ?? {}
    if (part.name === 'read') x.reads[a.path] = (x.reads[a.path] ?? 0) + 1
    if (part.name === 'bash') {
      x.bash.push(String(a.command).slice(0, 160))
      if (/\bsleep\b/.test(a.command)) x.sleeps++
    }
    if (part.name === 'codemode' && /\b(while|for)\b[\s\S]*(sleep|setTimeout|wait)/.test(a.code ?? '')) x.codemodeLoops++
    if (part.name === 'message') x.messages.push(String(a.text).slice(0, 160))
  }
}
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0 }
const out = {}
for (const [c, x] of Object.entries(conv)) {
  out[c] = {
    ...x, cost: +x.cost.toFixed(4),
    costParts: Object.fromEntries(Object.entries(x.costParts).map(([k, v]) => [k, +v.toFixed(4)])),
    total: x.input + x.cacheRead + x.cacheWrite + x.output,
    contextMedian: median(x.context), contextMax: Math.max(0, ...x.context), context: undefined,
    elapsedS: x.first ? Math.round((x.last - x.first) / 1000) : 0,
    first: x.first && new Date(x.first).toISOString(), last: x.last && new Date(x.last).toISOString(),
    rereads: Object.fromEntries(Object.entries(x.reads).filter(([, n]) => n > 1)),
  }
}
const users = rows.map((r) => JSON.parse(r.record)).filter((r) => r.kind === 'pi.user' && r.conversationId === 41)
console.log(JSON.stringify({ home, userInputsToUltimate: users.length, conversations: out }, null, 1))

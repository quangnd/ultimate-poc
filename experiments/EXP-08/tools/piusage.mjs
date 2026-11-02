// Sum Pi --mode json usage from message_end events of assistant messages. Usage: node piusage.mjs file.jsonl...
import { readFileSync } from 'node:fs'
for (const f of process.argv.slice(2)) {
  const s = { turns: 0, toolCalls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, usd: 0, models: new Set(), errors: 0 }
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let e; try { e = JSON.parse(line) } catch { continue }
    if (e.type !== 'message_end' || e.message?.role !== 'assistant') continue
    const m = e.message, u = m.usage ?? {}
    s.turns++
    s.models.add(`${m.provider}/${m.model}`)
    if (m.stopReason === 'error') s.errors++
    s.toolCalls += (m.content ?? []).filter((c) => c.type === 'toolCall').length
    s.input += u.input ?? 0; s.output += u.output ?? 0; s.cacheRead += u.cacheRead ?? 0; s.cacheWrite += u.cacheWrite ?? 0
    s.total += u.totalTokens ?? 0; s.usd += u.cost?.total ?? 0
  }
  console.log(f.split('/').pop(), JSON.stringify({ ...s, models: [...s.models], usd: +s.usd.toFixed(4) }))
}

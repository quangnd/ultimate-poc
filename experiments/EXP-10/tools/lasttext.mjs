// Print the text of the last assistant message in a pi --mode json stream. Usage: node lasttext.mjs file.jsonl
import { readFileSync } from 'node:fs'
let last = ''
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!line.trim()) continue
  let e
  try { e = JSON.parse(line) } catch { continue }
  if (e.type !== 'message_end' || e.message?.role !== 'assistant') continue
  const t = (e.message.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
  if (t) last = t
}
process.stdout.write(last + '\n')

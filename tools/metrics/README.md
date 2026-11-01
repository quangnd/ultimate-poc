# Conversation metrics (Ultimate instrumentation)

Extracts per-conversation metrics from Ultimate's own APIs so experiment records contain measured numbers instead of
estimates: elapsed time, model calls, tokens, a cost proxy and tool-call counts. It is read-only, has no dependencies,
and never prints entry content (prompts, messages, tool arguments).

Files:

- `conversation-metrics.js` defines `conversationMetrics(ultimate, id, options)` and `metricsMarkdown(result)`.
- This README.

## Run

It runs inside Ultimate's `codemode` tool (QuickJS sandbox, which allows `new Function`). From a conversation whose
working directory is this repository's root:

```js
const src = await tools.read({ path: 'tools/metrics/conversation-metrics.js' })
const { conversationMetrics, metricsMarkdown } = new Function(src + '\nreturn { conversationMetrics, metricsMarkdown }')()
const result = await conversationMetrics(ultimate, 215, { children: true })
console.log(metricsMarkdown(result)) // compact table; or `return result` for the full JSON
```

Any other working directory: pass a path to this file that `tools.read` can resolve, or paste the file's contents into a
codemode script, followed by the last three lines above (without `src`/`new Function`).

Options: `children: true` adds descendants, each flagged separately (`relation: 'subagent'` for conversations whose
`owner` is the conversation, `'branch'` for those whose `parent` is it; walked transitively) and a `combined` sum.
`pageSize` (default 200) is the `entries` page size. Store the result with the experiment record (for example
`JSON.stringify(result)` into `experiments/<ID>/`); do not hand-edit numbers.

## Output and where each field comes from

Per conversation (`result.conversation`, and each item of `result.children`):

| Field | Source | Notes |
|---|---|---|
| `startedAt`, `endedAt`, `elapsedMinutes` | `ultimate.entries(id)` | Oldest and newest timestamp among the conversation's own stored entries. A message entry carries `model[].timestamp` (epoch ms), a conversation event `data.at` (epoch ms) and a board event `data.at` (ISO string); entries with none are ignored and counted in a warning. `endedAt` is the newest entry, not the end of that entry's work (the last assistant message's timestamp is when it started streaming), so elapsed time can be short by one model response. A busy conversation's `endedAt` is "so far". |
| `models[name].tokens` (`input`, `output`, `cacheRead`, `cacheWrite`, `total`), `costUsd` | `ultimate.doc('pi.usage', id)` | Authoritative for tokens and cost, per `provider/model`. Includes summary and assessment model calls that are not stored as entries (not all of them, see Known disagreements). |
| `models[name].calls.entries` | stored `pi.assistant` entries | Model responses of the conversation's own turns. Durable, no retention limit. Authoritative for "turns". |
| `models[name].calls.traceAgent` | `ultimate.trace({ conversation })`, rows `kind: 'model'`, `caller: 'agent'` | Same calls as `entries`; a cross-check. |
| `models[name].calls.traceExtension` | trace rows `kind: 'model'`, `caller: 'extension'` | Model calls made by Ultimate itself for the conversation (summaries, assessments, the `branch` tool). Not stored as entries; only the trace sees them. |
| `models[name].calls.traceFailed` | trace model rows with `ok: false` | Not counted in the other call fields. |
| `models[name].fromEntries`, `fromTrace`, `entriesMatchUsage`, `traceMatchesUsage` | sums of stored assistant `usage` / trace row `result` | Reconciliation against `pi.usage`. `fromEntries.costUsd` is the stored per-message cost. |
| `toolBuckets`, `totals` | `pi.usage` `tools` and `models` buckets | `totals` adds models and tool buckets, like the status line. `tools` was empty in every conversation checked and is not used for tool-call counts. |
| `toolCalls.total`, `toolCalls.byName` | `toolCall` content items of stored assistant entries | Calls the agent issued directly. A `codemode` call counts once; the `tools.*` calls inside it do not. |
| `toolCalls.nestedFromTrace` | trace rows `kind: 'tool'` whose `caller` is not `agent` | Tools called from inside `codemode` (e.g. `read`, `memory`, `note`). Trace only. |
| `toolCalls.checks` | `pi.tool-result` entry count; trace tool rows with `caller: 'agent'` | Both should equal `toolCalls.total` on a quiet conversation. |
| `entries` | `ultimate.entries` | `own` entries counted; `forkedHistorySkipped` entries of ancestors in a branch's history, which belong to the ancestor and are ignored. |
| `trace` | `ultimate.trace` | `rows` returned, `oldest` row time, `truncated` when the 1000-row cap was reached. |
| `warnings` | derived | Busy conversation, truncated or late-starting trace, and any model whose trace tokens differ from `pi.usage` on a quiet conversation. |

Result top level: `costLabel` is `list-price proxy (subscriptions)`. `costUsd` is Pi's token-count times list price for
the model. Subscription providers (for example `claude-code`, `github-copilot`, `openai-codex`) are not billed per token,
so it is a comparable proxy, never an invoice. `generatedAt` is when the metrics were read.

`combined` (with `children: true`) sums calls, tokens, cost, tool calls and the time span of the conversation and its
descendants. Each conversation has its own `pi.usage`, so nothing is counted twice (verified for a conversation and its
subagents). `combined.toolCalls` counts direct calls only.

## Which source wins

- Tokens and cost: `pi.usage`. It is what Ultimate accounts, and it needs no retention.
- Turn counts and direct tool calls: entries. They are stored for the conversation's lifetime.
- Calls Ultimate makes itself (summaries, assessments, the `branch` tool): trace only, so `calls.traceExtension` is a lower bound when the
  trace is truncated or pruned.
- `pi.usage` and the trace can disagree on those extra calls, in both directions (see below). A `warnings` item says so;
  do not average or "fix" it, record both.

## Limits

- Trace cap: `ultimate.trace` returns at most the newest 1000 rows, of all kinds (services and actions too, not just
  model and tool calls), and has no way to page further back. A long conversation can exceed 1000 rows and lose its oldest
  model and tool rows; `trace.truncated` and a warning then say so. Entries and `pi.usage` are unaffected, which is why they
  are authoritative. Take the measurement when the experiment ends, not days later.
- Trace retention: Ultimate keeps at most 200,000 call rows and 7 days by default (`callTrace` in Ultimate's
  `server/trace.ts`), per chapter. Older conversations have no trace data; a conversation whose trace begins more than a
  minute after its first entry gets a warning.
- Entry pagination: `ultimate.entries` is newest-first, paged with `before` (an exclusive entry id). The script pages
  until a short page and keeps only counts, so memory stays small. A branch's entries include its ancestors' entries; those
  are skipped.
- Busy conversations: usage, entries and trace are read together but not atomically; a turn finishing in between can make
  them differ by that turn. Measure after the conversation is idle.
- Nested tool calls are visible only in the trace (see above).
- Costs are a list-price proxy (see above), tokens are exact as reported by providers.
- No fabricated numbers: a missing source gives `null`/absent fields or a warning, never an estimate.
- Output has ids, titles (cut at 80 characters), model names and counts only. No paths, no secrets, no entry content.

## Known disagreements (observed)

- `branch` tool: its two summary model calls appear in the trace of the calling conversation (`caller: 'extension'`) but
  are not in that conversation's `pi.usage` (a conversation that ran it had 505 trace output tokens against 159 in
  `pi.usage`; the gap equalled those two calls exactly).
- `conversations.assessed`: a conversation's `pi.usage` can include a summary-model call with no model row in the trace
  filtered to that conversation (seen on several idle subagents: `pi.usage` had 1.6k to 2.2k tokens of a summary model,
  the trace had none).
- Neither touches the agent's own turns: `calls.entries`, `calls.traceAgent` and the entry token sums matched `pi.usage`
  exactly for the model that answers the turns whenever the summary calls use a different model. When both use the same
  model, `pi.usage` is entries plus the summary calls, so `entriesMatchUsage` is `false` there.

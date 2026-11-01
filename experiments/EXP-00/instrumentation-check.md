# EXP-00 instrumentation check (P0 T8)

- Date/time: 2026-11-01, metrics read at 2026-11-01T12:59:00Z (machine time zone UTC+07:00)
- Environment: docs/ENVIRONMENT.md (Ultimate `d0a2e17`, Pi / Pi Durable 1.4.0)
- Tool: `tools/metrics/conversation-metrics.js` (codemode snippet, no dependencies), commit `a7463a8` on branch
  `ultimate/4e9fbc-215`, written by worker #436
- Subject: the P0 docs branch itself, coordinator conversation #215, with its subagents (scout #413, worker #436)
- Hypothesis: Ultimate's existing APIs (`ultimate.entries`, `ultimate.trace`, `ultimate.doc('pi.usage')`) give
  start/end time, model calls per model, tokens, cost proxy and tool-call counts per conversation without new code in
  Ultimate.
- Outcome: **PASS** for extraction (all five fields produced from Ultimate APIs); caveats below. Independent check:
  reviewer of this branch (see the PR).

## Command (run in codemode, cwd = repo root)

```js
const src = await tools.read({ path: 'tools/metrics/conversation-metrics.js' })
const { conversationMetrics, metricsMarkdown } = new Function(src + '\nreturn { conversationMetrics, metricsMarkdown }')()
const result = await conversationMetrics(ultimate, 215, { children: true })
console.log(metricsMarkdown(result))
```

## Real output (unedited; #215 was still busy, so its numbers are "so far")

| conversation | relation | elapsed min | model | calls (entries / trace agent+extension) | input | output | cacheRead | cacheWrite | total | cost USD | tool calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #215 | self | 10.46 | github-copilot/claude-sonnet-5.5 | 0 / 0+10 | 36 | 692 | 0 | 13767 | 14495 | 0.041409 | 35 |
|  |  |  | claude-code/claude-opus-5-5 | 27 / 27+0 | 54 | 25925 | 2335496 | 232709 | 2594184 | 2.847487 |  |
| #413 | subagent | 0.61 | openai-codex/gpt-6-luna | 7 / 7+0 | 32688 | 1796 | 63232 | 0 | 97716 | 0.004799 | 8 |
|  |  |  | github-copilot/claude-sonnet-5.5 | 0 / 0+0 | 4 | 65 | 0 | 2173 | 2242 | 0.006091 |  |
| #436 | subagent | 8.82 | github-copilot/claude-sonnet-5.5 | 58 / 58+19 | 709 | 56676 | 4112653 | 129858 | 4299896 | 1.304088 | 59 |
| combined (3) |  | 10.46 |  |  |  |  |  |  |  | 4.203875 | 102 |

Cost: list-price proxy (subscriptions).

Selected JSON fields of the same result:

- #215 `startedAt` 2026-11-01T12:48:28.236Z, `endedAt` 2026-11-01T12:58:55.645Z
- #215 `toolCalls.byName`: bash 13, codemode 7, write 5, subagent 4, read 3, edit 2, plan 1 (total 35);
  `nestedFromTrace`: memory 5, read 1; `checks`: 34 tool-result entries, 34 direct trace tool rows (the 35th call was
  the running codemode call itself)
- warnings: #413 `github-copilot/claude-sonnet-5.5: trace tokens (0) differ from pi.usage (2242)`; #436
  `github-copilot/claude-sonnet-5.5: trace tokens (4296683) differ from pi.usage (4299896)`

## Expected vs actual

| Field | Expected | Actual |
|---|---|---|
| start/end time | from stored entries | yes (`ultimate.entries`) |
| model calls per model | per provider/model | yes: entries and trace agent rows agree (27/27, 7/7, 58/58) |
| tokens + cost proxy | from `pi.usage` | yes, per model; USD labelled proxy |
| tool-call count | total and per tool | yes, from entries; nested codemode calls separately from trace |
| actual models | match ENVIRONMENT.md roles | #215 Opus 5.5 (coordinator), #413 GPT-6 Luna (scout), #436 Sonnet 5.5 (worker), Sonnet 5.5 also for summaries |

## Confounders / limitations

- Summary-model calls are counted inconsistently between `pi.usage` and the trace (the warnings above; details in
  tools/metrics/README.md "Known disagreements"). The agent's own turns reconcile exactly. Rule: `pi.usage` for
  tokens/cost, entries for counts, record both when they differ.
- `ultimate.trace` returns at most the newest 1000 rows and keeps at most 7 days: measure when an experiment ends.
- Elapsed time is wall time between first and last stored entry; it excludes human think time before the first entry
  and can be short by the last model response.
- Self-measurement: Ultimate's agents measure Ultimate. The raw numbers come from Ultimate's stores, not from model
  prose, and plain Pi runs need a separate measure (session files or wall clock) for the A/B comparison.

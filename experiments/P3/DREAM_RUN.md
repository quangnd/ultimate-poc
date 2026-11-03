# Dream run measurement (P3, issue #33)

Source: Dream branch #8544 (2026-11-02), its final report to @ultimate #52. Read-only: it changed no files, memory or settings.

| Measure | Value |
|---|---|
| Elapsed | ~2.5 min wall (07:20:13 → ~07:22:24 UTC for the six passes; answer at ~07:25) |
| Passes | 6 `dream-pass` subagents on gpt-6.1-sol, run in parallel: memory #8657, failures #8680, tools #8703, corrections #8726, codify #8749, project #8772 |
| Tokens / cost proxy | At the dream report: ≈3.40M tokens, ≈$2.51 list price (#8544 opus 657k $0.99; its sonnet side calls 73k $0.21; passes 2.63M $1.18; pass summaries 46k $0.13). Whole conversation including the later proposal card and relaying, re-read from `pi.usage` on 2026-11-03: 4.05M tokens, $3.81 (#8544 1.37M $2.50; passes 2.67M $1.31) |
| Proposals | 28 raw → 15 merged |
| New vs known (against the P3-A docs) | 7 new, 4 partly new, 2 known only from the handoff/EXP-03, 2 already in the P3-A docs |
| Accepted by the PO | 13 of 15 (#4 quota autoplay and #15 dream.stats deferred) |
| Validated afterwards | 6 VALIDATED, 1 PARTIAL, the rest UNVERIFIED (GATE_SUMMARY.md, DREAM_VALIDATION.md, DREAM-03-01-05-09.md) |
| Effect on the next chapter | **NOT MEASURED**: no fresh chapter was prepared or entered (no `prepare`/Fall asleep), so the effect was measured on later branches instead (#41 lean coordinator, EXP-11 memory) |

Caveats: the passes sampled the evidence; #8544 spot-checked 5 claims itself; the trace window is ~7 days and 1000 rows. The first figure is #8544's own report; the second was re-read by #52.

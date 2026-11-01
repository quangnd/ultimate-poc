# Ultimate Evaluation Protocol v1

## Research question
Does Ultimate provide measurable benefits over plain Pi on the same Mac for coding delivery, context recovery and multi-agent coordination, net of setup/overhead?

## Controls and fairness
Record exact Ultimate/Pi versions, provider/model, configuration, context availability and hardware. Use **the same model** where possible; if not possible, mark the result confounded. Use isolated branches or fresh clones with identical starting fixtures, task prompts, tests and scope. Alternate execution order across matched tasks. Do not benchmark the generated application alone.

## Primary measures
- End-to-end elapsed minutes: first prompt -> independently verified AC (include agent waiting and human review).
- Human interventions: counts of manual corrections, approvals (reported separately) and copy/pastes.
- First-pass acceptance: pass only when QA suite succeeds before human repair.
- Verified defects: bugs uncovered by independent tests/review, severity tagged.
- Recovery: time/minutes to resume and complete a suspended task; lost steps or duplicate effects.
- Cost proxies: provider reported tokens/USD if available; otherwise API call count and wall time, explicitly marked proxies.
- Agent overhead: setup/configuration minutes, PR churn, context re-explanation prompts.
- Observability: could operator identify current owner, task, blockers and evidence without asking agent? yes/no and time-to-answer.

## Experiments
| ID | Test | Procedure | Pass condition |
|---|---|---|---|
| EXP-01 | Conversation/context | Work on issue; switch session and resume using repo/state | No critical decision lost; >=90% of 10 fact questions correct |
| EXP-02 | Durability | Checkpoint before safe process restart; recover; inspect effects | Continue with no lost committed edit and no duplicate write |
| EXP-03 | Delegation | Coordinator delegates implementation to builder and independent QA | Both evidence trails visible, no simultaneous conflicting writes, AC pass |
| EXP-04 | Project management | Create plan/task/docs, progress update and resume in later session | Scope and latest state match GitHub issue + checkpoint |
| EXP-05 | Custom surface | Build a read-only metric/status panel using supported Ultimate capabilities | Correct display after reload, screenshot + validation, no undocumented API assumptions |
| EXP-06 | Self-improvement | Intentionally introduce a controlled, harmless test failure; record a correction rule; repeat similar case | Rule has evidence and scope, repeat success verified; no unapproved self-modification |
| EXP-07 | Multi-agent ROI | Execute same bounded task using single agent and orchestrated agents | Compare quality, elapsed time, interventions and call count; no presumed speedup |
| EXP-08 | A/B delivery | 3 matched tasks plain Pi vs Ultimate in randomized/alternating order | Complete measurements + equivalent test suite, report caveats |

Never deliberately kill a tool while writing a production file; use synthetic fixture and safe restart only. Avoid claiming durable recovery from chat history replay alone.

## Scoring
Rate each on 0-5 with evidence: developer UX (15%), persistence/recovery (20%), orchestration (15%), context retrieval (15%), self-improvement (10%), extensibility (10%), reliability/quality (15%). Weighted score /5. Missing/unavailable remains N/A, with coverage separately reported; do not silently score zero. Decision gate: >=4.0 and >=75% coverage with no severe safety/data-loss defect = candidate to adopt; 3.0-3.99 = selectively reuse; below 3.0 = defer. These are *provisional thresholds* to validate after trials.

## Evidence standard
A PASS requires timestamp, scenario, reproducible steps, expected and actual outcome, test/log/screenshot path and reviewer. Feature claims without direct observation = UNVERIFIED. Store redacted logs only, never credentials. Use experiments/TEMPLATE.md per run.

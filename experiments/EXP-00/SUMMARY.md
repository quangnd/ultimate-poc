# EXP-00 matched baseline: summary (P0 T7)

Same verbatim prompt (`TASK.md`) and the same hidden acceptance suite (`acceptance.test.mjs`, 10 cases, written before either run, never shown to either run). Order: B first, then A.

| Measure | Run A: plain Pi (RUN-20261101-01) | Run B: Ultimate worker (RUN-20261101-02) |
|---|---|---|
| Model / thinking | anthropic/claude-opus-5-5 / medium | github-copilot/claude-sonnet-5.5 / xhigh (**CONFOUNDED**) |
| Start state | empty temp dir | fresh repo worktree (AGENTS.md visible) |
| Elapsed wall time | 45 s (0.75 min) | 110 s (1.83 min) |
| Interventions (corrections / approvals) | 0 / 0 | 0 / 0 |
| Hidden acceptance, first pass | 10/10 PASS (UTC, LA, Kiritimati) | 10/10 PASS (UTC, LA, Kiritimati) |
| Own tests | 20/20 pass | 19/19 pass |
| Tokens (total; output) | 54,524; 4,738 | 392,108; 13,821 |
| USD (list-price proxy) | 0.167 | 0.262 |
| Model / tool calls | 3 turns / 2 tool calls | 14 model / 13 tool calls |
| Files | package.json, src (46 lines), test (93 lines) | package.json, src (48 lines), test (150 lines), plus commit and report |
| Weekend start, days > 0 (unspecified) | Sat+1 = Tue (roll to Monday first) | Sat+1 = Mon (Excel WORKDAY), flagged as a decision |

## Reading

Both runs passed on the first try with zero interventions. On this tiny task, plain Pi was faster (about 2.4×) and used about 7× fewer tokens. The Ultimate worker did more process work: it verified in its own worktree, committed, wrote an acceptance-evidence report, and surfaced the ambiguous case as a decision. That is overhead on a trivial task. Whether it pays off needs larger tasks (EXP-07, EXP-08).

## Caveats

- n = 1 per arm, on a tiny and well-specified task. **Not representative**; no conclusions about speed or quality.
- **Confounded model:** the `subagent` tool has no model override (NOT AVAILABLE), so B ran on a different model and thinking level. Model choice alone could explain the time and token differences.
- Different start context: an empty dir for A, a repo worktree with AGENTS.md and Ultimate's worker prompt for B.
- **Coordinator overhead is excluded** from both: writing the task and acceptance suite, launching the runs, and grading. B's time includes worktree setup, plus the worker's commit and report; it excludes the coordinator's own turns.
- USD figures are list-price proxies (a Copilot subscription for B, Pi's Anthropic pricing for A), not invoiced cost.
- The hidden suite tests only cases the prompt defines. The two runs diverge on the one undefined case, which shows a prompt ambiguity, not a defect.
- The person grading the results (Ultimate coordinator #197) is also part of the system under test; a reviewer is pending in the root PR review.

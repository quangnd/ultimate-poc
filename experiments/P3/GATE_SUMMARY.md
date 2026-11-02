# P3 gate summary (2026-11-02, coordinator @ultimate #52)

Scope: the P3 issues #30–#33 and #41, plus the 13 Dream proposals the Product Owner approved. Verified on a fresh clone of `09bc0b9`: `npm ci`, typecheck, 775 unit/integration tests, 7/7 E2E on WEB_PORT=5573/API_PORT=5574.

## Experiments
| ID | Outcome | Record |
|---|---|---|
| EXP-01 context recovery | **PENDING** (P0 early probe 10/10, self-authored; the PO's 10 questions are pending) | experiments/EXP-01 |
| EXP-02 durability | PASS (n=1) | experiments/EXP-02 |
| EXP-03 delegation | PASS | experiments/EXP-03 |
| EXP-04 plan tracking | PASS, with a GitHub ownership gap | experiments/EXP-04 |
| EXP-05 custom surface | PASS as built and tested; **adoption awaits the PO** (PR #34) | experiments/EXP-05 (on the PR branch) |
| EXP-06 self-improvement | PARTIAL: pass condition met, no transfer shown (workers get no memory index) | experiments/EXP-06 |

## Dream proposals (13 approved; #4 and #15 deferred)
| # | Item | Outcome | Evidence |
|---|---|---|---|
| 2 | e2e-port-isolation | VALIDATED | DREAM_VALIDATION.md: 6/6 concurrent runs pass; the old fixed ports reproduce F8 |
| 3 | failure-ledger-fix | VALIDATED | FAILURES.md re-count, 15 ids by two methods |
| 6 | blind-qa skill + memory | VALIDATED (n=1) | DREAM_VALIDATION.md #41 |
| 7 | lean coordinator overlay | VALIDATED (n=1, confounded by a smaller task) | #41: tokens 2.64M→1.30M, median context 72.6k→64.8k, calls 30→22 |
| 14 | wait/context rules | VALIDATED (n=1) | #41: no polling, max context 71.8k |
| 1 | portable-shell (AGENTS.md) | **PARTIAL** | see below |
| 5 | integration-recovery | UNVERIFIED | no repeat incident since the merge |
| 9 | issue-closeout skill | VALIDATED (n=1) | #41 closed with it; PROJECT_STATUS consistent afterwards |
| 8, 10, 11, 12, 13 | memory corrections | UNVERIFIED as behaviour change (applied, consistent with the source) | memory index |

### #1 portable-shell re-count (measured by #52, `ultimate.search`, tool results only, excluding #52's own quotes)
- Before the AGENTS.md change: 44 `rg: command not found` and 13 `timeout: command not found` tool results. Baseline per #9972: 27/22 conversations and 6/5, counted with a different filter.
- After the merge at 09:30:42Z: **1** `rg` occurrence (#10979/11046, a reviewer reading a file) and **2** `timeout` occurrences (#10224/11261, #11470/11565, both workers). All three were in conversations started from or running with the rule present.
- Reading: the rule reduced but did not eliminate the failures. Two of the three were workers, which do get AGENTS.md. n is small and the time window is short (~1 h). Outcome PARTIAL.

## Infrastructure failures after the FAILURES.md re-count (append to the ledger in P4)
| ID | Conversation | Entry | Type | Recovery |
|---|---|---|---|---|
| F14 | #9990 | 10512 | Claude Code upstream, status unknown | automatic |
| F15 | #11372 | 11407 | Claude Code upstream, first call | manual resume by #52 |
| F16 | #52 (root) | n/a | claude-code 429 rate limit on claude-opus-5-5, paused **1 h 35 min** | Play by the human |

Total recorded model errors are now 17 (search `"stopReason":"error"`). In P3 the claude-code 429 pauses cost about 4 h 06 min of wall time (F7/F12, one shared 2 h 31 min window, plus F16 1 h 35 min). Each needed a human Play. P2's F4 (8 h 07 min) is not included.

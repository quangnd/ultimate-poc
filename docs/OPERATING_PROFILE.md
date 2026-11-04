# Operating Profile v1

How to run work in this repository with Ultimate, after the POC. Approved scope: PO (Quang), 2026-11-04 (M1).
Evidence base: `docs/FINAL_REPORT.md` and the records it cites. Nothing here goes beyond that report.

**Status tags**
- **VALIDATED**: a pass condition was set in advance and met. The n is stated.
- **OBSERVED**: seen in the records, but not tested under control.
- **PARTIAL**: tested; some conditions met, some failed or untested.
- **PO DECISION**: chosen by the Product Owner; evidence informs it but does not prove it.

**Limits that apply to every rule:** one machine, one network, one operator; n=1–3 for most experiments; tasks of 1–9 min of build work; USD figures are list-price proxies on subscriptions; Ultimate agents designed, ran and recorded most experiments (FINAL_REPORT "Unproven").

## 1. Default workflow: three paths

| Path | Use when | Shape | Status | Evidence |
|---|---|---|---|---|
| **(a) Direct single-agent coding: the DEFAULT** | Small, well-defined task with clear acceptance criteria | One coding agent builds and tests; one independent **cross-family** reviewer reviews read-only; lander checks and CI decide the merge | PO DECISION, backed by OBSERVED results | P4 gate (PO, 2026-11-03). EXP-07 (same model, n=1, one small task): orchestration cost 3.6× the cost proxy and 2.9× the time of a single worker, same 12/12. EXP-10 (same models, n=1): worker + reviewer matched plain Pi, 22/22 both, 10.5 vs 11.3 min, +7% cost |
| **(b) Coordinator-based** | Only when complexity justifies it: multi-part issues, unclear scope, several workers | A coordinator owns one issue, plans, delegates to workers, judges results | OBSERVED | EXP-03 (n=1) delivered a stateful issue with no defect on main. The benefit on larger or vaguer tasks is **unproven**: no A/B task exceeded 9 min of build work. A coordinator adds cost: about 2/3 of each arm's cost in EXP-12 (n=2) |
| **(c) Blind QA** | Only for stateful, concurrency or data-integrity work | Added to (a) or (b): QA writes checks from the acceptance criteria alone, from the base SHA, and mutation-checks them (`blind-qa` skill) | OBSERVED | EXP-03 (n=1): found 2 spec gaps the reviewer missed. EXP-08 (3 small tasks): 67–74% of the Ultimate arm's tokens, found nothing |

Do not run full coordinator → builder → QA → reviewer orchestration on small, well-specified tasks (EXP-07, n=1).

## 2. Roles

### Coordinator (path b only)
| Rule | Status | Evidence |
|---|---|---|
| One GitHub issue per coordinator branch; a fresh branch for the next issue | OBSERVED | P2: one coordinator for 5 issues used 64.06M tokens (79% of the phase, 97.9% cache reads), context 26k → 597k (TOKEN_ANALYSIS.md §3). One issue per branch: 2.64M (EXP-03), 1.30M (#41). Not A/B-tested; different issue sizes |
| Review and QA findings go back verbatim to the builder of that issue; the coordinator makes no product edits | OBSERVED | Practice in EXP-03, EXP-10, EXP-12 |
| Wait by ending the turn or with `notify`; never poll in a codemode loop | OBSERVED | EXP-03: ~15 extra calls from polling and codemode retries (30 against a ~15 target). EXP-12: the built-in coordinator followed this unprompted |
| A fresh coordinator after a gap of more than about 1 h, instead of resuming | OBSERVED | Resuming rewrites the cached context (P2, TOKEN_ANALYSIS.md) |
| Compact only when a fresh branch is not possible | OBSERVED | P2: no compaction while context grew to 597k |
| Ask workers to put each check's exit code in their report | OBSERVED (fix proposed by EXP-12, not itself tested) | EXP-12: the extra coordinator calls were traced to the rule "judge recorded exit codes only" (the coordinator searched the worker's history) |
| No claim that the project coordinator overlay saves tokens or cost | PARTIAL | EXP-12 (n=2×1): lean overlay +14% / +30% tokens, +6.6% / +11.6% cost, quality equal (H1 FAIL, H2 PASS). Dream #7's "halved tokens" (n=1, confounded by task size) was not reproduced |

### Worker
| Rule | Status | Evidence |
|---|---|---|
| Put every rule a worker needs in its brief, a skill or AGENTS.md, never in memory alone | OBSERVED | EXP-06 (n=1): workers get no memory index and never called `memory`; a memory rule did not transfer, validated skill changes did |
| One bounded task, one focused commit, check exit codes in the report | OBSERVED | EXP-10, EXP-12: 4/4 EXP-12 runs passed without help |

### Reviewer
| Rule | Status | Evidence |
|---|---|---|
| Always an independent reviewer from a different model family than the builder, read-only | OBSERVED (consistent across P1–P4) | It caught every real code defect in P1, P2 and EXP-08/10 that builders and QA missed (P1 D1, D2; EXP-08 task 3; EXP-10 completion-date defect). Cost $0.03–0.16 per round in P2 |
| Findings go to the builder; a second round if anything changed | OBSERVED | EXP-03, EXP-10: fixed in one round |

### QA
| Rule | Status | Evidence |
|---|---|---|
| Blind QA starts from the base SHA before the builder's commit, briefed from the acceptance criteria only, and mutation-checks its guards | OBSERVED (n=1 positive, n=3 null) | EXP-03; DREAM_VALIDATION.md (#41 QA passed all AC and both mutations) |
| Only for stateful, concurrency or data-integrity work (path c) | PO DECISION | P4 gate; EXP-08 cost share 67–74%, nothing found |

## 3. Model configuration

| Rule | Status | Evidence |
|---|---|---|
| Keep the current families: coordinator and @ultimate on `claude-code/claude-opus-5-5` (medium); worker on `github-copilot/claude-sonnet-5.5` (xhigh); reviewer on `openai-codex/gpt-6.1-sol` (medium); scout and watcher on `openai-codex/gpt-6-luna` (low) | PO DECISION | P0 (keep model families), M1/M2 approval 2026-11-04 (no family changes) |
| Families change only by editing the agent definition or its family in the Agents panel. That is shared Ultimate configuration and needs PO approval (AGENTS.md gates) | PO DECISION | `docs/ENVIRONMENT.md`; AGENTS.md "Approval gates" |
| There is no per-run model override for a subagent | NOT AVAILABLE | CAPABILITY_MATRIX.md; EXP-00 |
| Nothing changes in v1 | PO DECISION | 2026-11-04 |

## 4. Git, worktree, review, lander and CI

| Rule | Status | Evidence |
|---|---|---|
| One PR per issue; merge only after reviewer approval and green CI | PO DECISION | P0 decisions; LANDER_STRATEGY.md |
| Builders work in their own worktree; no parallel writes to the same files or shared state | OBSERVED | EXP-03: separate trails, no conflicting writes. AGENTS.md "Delegation" |
| E2E ports per worktree via `WEB_PORT`/`API_PORT` (env only) | VALIDATED (6/6 concurrent runs) | DREAM_VALIDATION.md (Dream #2); fixed ports collided before (F8) |
| The lander runs the real checks (`npm ci`, typecheck, test, e2e) on the merged result and refuses failing work | VALIDATED (P1 proof, n=1) | The lander refused a deliberately failing commit (P1) and the restart-orphaned run (P4) |
| The lander has no `push`; GitHub `main` changes only through `gh pr merge` | PO DECISION | LANDER_STRATEGY.md "No push" |
| A lander-landed checkpoint commit must also reach GitHub (via a PR) | OBSERVED | Twice a checkpoint stayed local and needed a sync PR (#64, #70) |
| `git push`, `gh pr create` and `gh pr merge` are separate, bounded steps; check state before any retry | PO DECISION (rule); UNVERIFIED as behaviour (no recurrence) | AGENTS.md "Shell and integration" (Dream #5) |
| CI (GitHub Actions) runs typecheck, unit/integration tests and E2E on every PR and on `main` | OBSERVED | `.github/workflows/ci.yml`; agrees with the lander in about 50 s (#45) |

## 5. Memory and Dream

| Rule | Status | Evidence |
|---|---|---|
| Docs are the source of truth; memory is the index | OBSERVED | EXP-09: memory alone 5/10 (FAIL against a 90% bar), memory + docs 10/10, the docs supplying 9 |
| Write gate memories at each phase gate by a coverage rule: one per accepted ADR change or clarification, one per gate criterion and outcome, one per key experiment finding with its n and confound, provenance in the body | **PARTIAL** | EXP-11 (n=1 per arm): known gaps 10/10 (H1); unseen questions 8/10 + 2 partial (H2 FAIL against 9/10); the question writer and the memory writer read the same docs |
| The `memory` tool reads by slug only; there is no memory search | NOT AVAILABLE | FINAL_REPORT "Capabilities not available" |
| Dream proposals are candidates: the PO approves each, and each is validated before it is called an improvement | PO DECISION | 13 approved, 6 validated, 5 still stand (#7 not reproduced in EXP-12); DREAM_RUN.md, DREAM_VALIDATION.md |
| No self-modification of tools, skills, extensions or shared config without a proposed diff, isolated test, rollback and approval | PO DECISION | AGENTS.md "Safety and scope"; EXP-06 observed none unapproved |

## 6. Cost, recovery and safety

| Rule | Status | Evidence |
|---|---|---|
| Report tokens and cost separately, never one as a proxy for the other | OBSERVED | EXP-12: cache reads ~80% of tokens but under 10% of cost; cache writes 82–84% of cost. P2 (long-lived): cache reads 51% of cost |
| Measure a short single-issue coordinator's cost by its wake-ups (cache writes) | OBSERVED (n=2) | EXP-12: each extra wake about $0.12–0.15 |
| Start the host with `node --network-family-autoselection-attempt-timeout=2000 /Users/mun/Projects/ultimate/bin/ultimate.ts`; a plain `ultimate` start or the `restart` tool does not apply it | VALIDATED (one machine, 24 h) | NETWORK_FIX.md §7: 0 relay errors in 448 calls vs 25 in 1036 (2.4%) before; burstiness and day-to-day network differences make it weaker than the binomial figure suggests |
| 429 (rate-limit) recovery stays attended; auto-Play stays off | PO DECISION | P4 gate (D not approved); 15.2 h of waits over 4 windows |
| Trust project settings only after the setup card is pressed: check `ultimate.agents().projectSetup === 'trusted'`; a chat statement does not count | OBSERVED (P1, n=1) | `experiments/P1/LOG.md` "Lander" |
| After a restart, stop a process holding an E2E port only after the ownership check: command, port, cwd and orphan (npm parent ppid 1) all match; if ambiguous, stop nothing and ask | PO DECISION; UNVERIFIED as behaviour | FOLLOWUP_C.md; `rrl-e2e` skill; upstream HazAT/ultimate#68 |
| Durable execution resumes after a safe restart without lost or duplicated effects; a hard crash is untested | VALIDATED for safe restarts (3 restarts, 29 incidents); crash UNPROVEN | EXP-02, FAULT_INJECTION.md; 14 of 29 incidents needed a deliberate resume |
| AGENTS.md approval gates apply: phase transitions, scope or architecture changes, spending or credentials, destructive operations, shared Ultimate configuration, releases | PO DECISION | AGENTS.md "Autonomous execution policy" |
| Public repo: synthetic data only; no secrets, tokens, company tickets, logs or customer data | PO DECISION | AGENTS.md "Safety and scope" |

## Not in v1

- User-level (`~/.ultimate/`) skills and settings: M3, deferred to a separate approval.
- Any Ultimate clone upgrade: see the checklist in `docs/KNOWLEDGE_PACK.md`.
- Changes to `.ultimate/`: owned by M2, a separate PR.

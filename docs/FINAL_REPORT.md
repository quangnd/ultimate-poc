# Ultimate POC: final evaluation report

Date: 2026-11-04. Author: @ultimate (coordinator, conversation #52). Product Owner: Quang.
Subject: Ultimate (clone `d0a2e17`, Pi / Pi Durable 1.4.0) as the development and orchestration environment, compared with plain Pi, on a Mac M1. The Release Readiness Lab app was the test fixture.

## Verdict

**Selectively reuse: reconciled 3.35/5** at 100% coverage, scored blind by two model families (Opus 3.375, GPT-6.1 3.325; `experiments/P4/SCORECARD.md`). The PO accepted it at the P4 gate. The follow-ups after the gate (B, E, A, C, EXP-12) refine *what* to reuse; none moves the band.

The product met its goal: US-01..08 verified (P2 gate), 775 unit/integration tests, 7 E2E tests, CI and lander green on `main`. No known defect reached main in P1–P4.

## Retain

| What | Evidence |
|---|---|
| **One issue per coordinator branch** | P2: one coordinator for 5 issues used 64M tokens (79% of the phase, 97.9% cache reads; TOKEN_ANALYSIS.md). One issue per branch: 2.64M (EXP-03), 1.30M (#41) |
| **Lightweight flow: one worker + an independent cross-family reviewer + lander/CI** | EXP-10, same models: matched plain Pi (22/22, 10.5 vs 11.3 min, +7% cost). EXP-12: 4/4 runs passed without help. The reviewer caught every real code defect in P1, P2 and EXP-08/10 that builders and QA missed |
| **Blind QA from acceptance criteria, for stateful or concurrency work only** | EXP-03: found 2 spec holes the reviewer missed. EXP-08: 2/3 of the cost on small tasks, found nothing |
| **Lander pre-merge checks + GitHub CI** | The lander refused a failing commit (P1) and resumed after a restart (P4). CI agrees with the lander in about 50 s |
| **Durable execution and worktree isolation** | 3 host restarts and 29 provider incidents: nothing lost, nothing duplicated (EXP-02, FAULT_INJECTION.md) |
| **Project skills and overlays** (`blind-qa`, `issue-closeout`, `rrl-e2e`) | Used daily; port isolation validated 6/6 (DREAM_VALIDATION.md) |
| **Gate memories written by a coverage rule** | EXP-11: known gaps 5/10 → 10/10; memory reads fell 26 → 12/9 |
| **Audit from `ultimate.search` / `trace` / `pi.usage`** | Reproduced every metric, the failure re-count and the root cause of the relay error |
| **Dream, with PO approval and validation** | One run, about 2.5 min and $2.5–3.8: 15 proposals, 13 accepted, 6 validated (DREAM_RUN.md) |
| **Network fix B: `--network-family-autoselection-attempt-timeout=2000` on the host** | PASS: 0 relay errors in 448 calls over 24 h, against 25 in 1036 (2.4%) before; chance-only is about 2×10⁻⁵ (NETWORK_FIX.md §7). This was the largest source of failures (28 of 36) |

## Change

| What | Why |
|---|---|
| **Drop full orchestration on small, well-specified tasks** | EXP-07: 3.6× the cost and 2.9× the time of a single worker, no quality gain |
| **Trim the lean coordinator overlay**: drop "judge recorded exit codes *only*", or have the worker put exit codes in its report | EXP-12: it made the coordinator search the worker's history, +14%/+30% tokens, +6.6%/+11.6% cost. The built-in coordinator already followed the no-polling and test-limit rules unprompted |
| **Measure coordinator cost by wake-ups (cache writes), not token totals** | EXP-12: cache writes were 82–84% of coordinator cost; cache reads were about 80% of tokens but under 10% of cost |
| **Never rely on memory alone** for facts; keep the docs as the source and memory as the index | EXP-09 5/10 memory-only vs 10/10 with docs. Workers get no memory index (EXP-06), so rules go into briefs, skills or AGENTS.md |
| **Start Ultimate with the network flag** | The fix lasts only while the host is launched with it; a plain `ultimate` start removes it |
| **Keep 429 recovery attended** (PO decision) | 15.2 h of waiting over 4 windows; auto-Play deliberately not enabled |
| **Lander checkpoint commits must reach GitHub** | Twice, a lander-landed checkpoint stayed local ("Not pushed") and needed a sync PR (#64, #70) |

## Unproven

- **Benefit on larger or vaguer tasks.** Every A/B task took 1–9 min of build work, below the 20 min target. Where orchestration or Ultimate might pay off is untested.
- **The lean rules on multi-issue coordinators.** EXP-12 held one issue per branch constant, so the P2 case the rules targeted was not re-run.
- **Memory generalisation.** Unseen questions scored 8/10 + 2 partial (below the 9/10 bar); the question writer and the memory writer read the same docs.
- **Self-improvement transfer.** EXP-06: a memory rule did not reach workers; validated skill and overlay changes did (n=1 each).
- **Orphaned-check fix.** Reported upstream (HazAT/ultimate#68); the local `rrl-e2e` recovery note is untested by a real recurrence.
- **Integration-recovery rule** (Dream #5) and several memory corrections: no recurring incident to test them.
- **Generality.** One machine, one network, one operator; n=1–3 for most experiments; Ultimate agents designed, ran and recorded most experiments, with cross-family scoring and PO review as the checks; USD figures are list-price proxies on subscriptions.

## Capabilities not available in this version

The subagent per-run model override; a documented API for an extension to read GitHub issues; a type-check for project extensions; a per-worktree `instance.model` (read from the host project's settings); memory search (the `memory` tool reads by slug only).

## Where the evidence is

`docs/CAPABILITY_MATRIX.md` (P0, P3 and P4 tables), `experiments/EXP-00..12`, `experiments/P1..P4/`, `state/PROJECT_STATUS.md`, GitHub issues #2–#68 (none open) and PRs #3–#70.

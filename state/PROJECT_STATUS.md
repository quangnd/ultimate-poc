# Project Checkpoint

Updated: 2026-11-02
Current phase: **P4 complete, awaiting the PO's gate decision.**
Current focus: the P4 gate package (`experiments/P4/SCORECARD.md`).
Last verified commit: the #49 records PR (docs/experiments only); main before it at `b87f8df`, plus the two throwaway fault-injection marker commits `0ba0b14` and `64ac4b8` that the lander landed locally (`experiments/P4/fault-restart-marker.md`, kept because FAULT_INJECTION.md cites them).
Active issues: P3 #33 (EXP-06/EXP-01/Dream), still open. P4 issues #45–#49 closed.
Result of P4 #49:
- **Scorecard:**
  - Reconciled **3.35/5** at 100% coverage, which means **selectively reuse**. Scorer A (Opus coordinator) gave 3.375 and blind scorer B (GPT reviewer) 3.325. They agreed within 0.5 on all 7 dimensions.
  - No severe safety or data-loss defect.
  - Reuse: the cross-family reviewer, blind QA for stateful work, the lander, durable execution and worktrees, project skills and audit.
  - Do not reuse: full orchestration on small tasks (3.6× the cost, EXP-07), long-lived coordinators, and memory as the only context.
- **Fault injection** (`experiments/P4/FAULT_INJECTION.md`):
  - A host restart during a landing's E2E check: the lander resumed with its memoized checks, and nothing was lost or duplicated.
  - But the orphaned Vite server blocked that landing until a manual kill and resubmit (medium, Ultimate). Recovery took 101 s.
  - Provider failures: 36 calls in 29 incidents, all recovered, with no duplicate effects. 14 needed a deliberate resume (9 by @ultimate, 5 by the human for 429s), and the 429 waits totalled 15.2 h.
P4 earlier: #47/#48 (EXP-07/08, PR #55): every arm passed 34/34. Plain Pi was ~2.2× faster and 1.7× cheaper (model-confounded), and the same-model single worker cost 3.6× less than orchestration. #46 (EXP-09, PR #52): memory-only recall 5/10, memory plus docs 10/10. #45 CI enabled (PR #50).
Blockers: none.
Next action: the PO decides at the P4 gate.
Decisions taken: P0 (PR per issue, coordinator merges; model families kept; A/B on anthropic opus-5-5). P0 gate: ADR-001/002 accepted, GitHub merge only, lander checks only and no push. P1 gate: ADR-002 clarifications 1–5 and the driving-chain limit accepted. Project `.ultimate/` setup trusted (2026-11-01). P3 gate: "Start P4 as proposed, with CI on".
Decisions pending (P4 gate, `experiments/P4/SCORECARD.md` "Open decisions"):
- (a) EXP-09 memory-gap fix and re-run;
- (b) relay remediation `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000`;
- (c1) report the orphaned-check-process defect upstream;
- (c2) 429 auto-Play;
- (c3) single worker plus reviewer as the default for small issues;
- (c4) one larger, model-matched task.

## Evidence
- P0: docs/ENVIRONMENT.md, docs/CAPABILITY_MATRIX.md, experiments/EXP-00, experiments/EXP-01/RUN-20261101-01.md
- P1: experiments/P1/LOG.md (5 defects, lander refusal proof)
- P2: experiments/P2/LOG.md (15 defects, all caught before merge; gate table; metrics), docs/screenshots/p2-*.png
- P3: experiments/P3/{GATE_SUMMARY,TOKEN_ANALYSIS,FAILURES,DREAM_VALIDATION,UI_CONCURRENCY_LIMITS}.md, experiments/EXP-02..06, docs/CI_PROPOSAL.md, docs/CAPABILITY_MATRIX.md (P3 results)
- P4: experiments/P4/{SCORECARD,FAULT_INJECTION,FAILURES}.md, docs/CI_PROPOSAL.md (Enabled), .github/workflows/ci.yml, experiments/EXP-09/RUN-20261102-01.md, experiments/EXP-07/RUN-20261102-01.md, experiments/EXP-08/{SUMMARY,RUN-20261102-01..03}.md
- Infrastructure: failures F1–F28 are recorded (P3 FAILURES.md, GATE_SUMMARY.md F14–F16, P4 FAILURES.md F17–F28), incl. four claude-code 429 windows; all were recovered with no repeated effects.

Important: This file is a resume summary only. GitHub Issues and PRs are the task source of truth.

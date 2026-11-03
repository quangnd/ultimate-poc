# Project Checkpoint

Updated: 2026-11-03
Current phase: **P4 accepted (selectively reuse); targeted follow-ups B, E, A, C in progress, not a new phase.**
Current focus: the P4 follow-ups. B (network fix) is PARTIAL until its 24 h re-count (≥ 2026-11-03 23:43Z). E is done (#60). A is done (#62). C is done (HazAT/ultimate#68; rrl-e2e note PR #65, PO-approved; experiments/P4/FOLLOWUP_C.md).
Last verified commit: `ee888c7` (PR #65, rrl-e2e orphan note, CI green).
Active issues: P3 #33 (EXP-06/EXP-01/Dream), still open. P4 issues #45–#49 closed. Follow-ups E #60 and A #62 closed.
Result of follow-up A #62 (EXP-11, `experiments/EXP-11/RUN-20261103-01.md`):
- **Design:** 24 gate memories written by a coverage rule (ADRs and clarifications, gates P0–P4, experiment findings), index 34 → 55; then two memory-only arms. A2's 10 unseen questions were written by an independent GPT evaluator and frozen (sha256) before the memories were drafted.
- **Result:** A1 (EXP-09's 10) **10/10**, against 5/10. A2 (unseen) **8/10 correct + 2 partial**, 0 wrong (FAIL against the 9/10 bar). Misses: 1 content gap, 1 retrieval miss. Reads fell from 26 to 12 and 9 calls. Blind second scorer agreed 40/40. n = 1 per arm; questions and memories came from the same docs.
Result of follow-up E #60 (EXP-10, `experiments/EXP-10/RUN-20261103-01.md`):
- **Design:** model-matched A/B on one feature task (import preview diff, domain + UI + E2E). Same builder (Sonnet 5.5 xhigh) and reviewer (GPT-6.1 medium) in both arms, one review round each.
- **Result:** both arms 22/22 hidden on the first pass, the same single UI defect caught by each reviewer and fixed in one round, all checks 0.
- **Measures:** Pi 11.3 min, $1.73; Ultimate worker+reviewer 10.5 min, $1.85 (excluding setup). n = 1, Pi ran first, build time ~9 min (below the 20 min target). The coordinator's share ($4.80) is excluded.
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
Next action: B's 24 h re-count after 2026-11-03 23:43Z (automation A3), then the closing evaluation report (retain / change / unproven).
Decisions taken: P0 (PR per issue, coordinator merges; model families kept; A/B on anthropic opus-5-5). P0 gate: ADR-001/002 accepted, GitHub merge only, lander checks only and no push. P1 gate: ADR-002 clarifications 1–5 and the driving-chain limit accepted. Project `.ultimate/` setup trusted (2026-11-01). P3 gate: "Start P4 as proposed, with CI on".
P4 gate (PO, 2026-11-03): verdict accepted, selectively reuse. Follow-ups in order B, E, A, C, as targeted tasks: B = the network fix, applied as a host CLI flag (PR #59); E = EXP-10 (#60, done); A = the memory-gap fix and re-run; C = report the orphaned-Vite defect upstream. Not approved: 429 auto-Play. Default delivery flow: one worker, an independent cross-family reviewer, and lander/CI checks.

## Evidence
- P0: docs/ENVIRONMENT.md, docs/CAPABILITY_MATRIX.md, experiments/EXP-00, experiments/EXP-01/RUN-20261101-01.md
- P1: experiments/P1/LOG.md (5 defects, lander refusal proof)
- P2: experiments/P2/LOG.md (15 defects, all caught before merge; gate table; metrics), docs/screenshots/p2-*.png
- P3: experiments/P3/{GATE_SUMMARY,TOKEN_ANALYSIS,FAILURES,DREAM_VALIDATION,UI_CONCURRENCY_LIMITS}.md, experiments/EXP-02..06, docs/CI_PROPOSAL.md, docs/CAPABILITY_MATRIX.md (P3 results)
- Follow-ups: experiments/P4/NETWORK_FIX.md (B), experiments/EXP-10/ (E), experiments/EXP-11/ (A)
- P4: experiments/P4/{SCORECARD,FAULT_INJECTION,FAILURES}.md, docs/CI_PROPOSAL.md (Enabled), .github/workflows/ci.yml, experiments/EXP-09/RUN-20261102-01.md, experiments/EXP-07/RUN-20261102-01.md, experiments/EXP-08/{SUMMARY,RUN-20261102-01..03}.md
- Infrastructure: failures F1–F29 are recorded (P3 FAILURES.md, GATE_SUMMARY.md F14–F16, P4 FAILURES.md F17–F29), incl. four claude-code 429 windows; all were recovered with no repeated effects.

Important: This file is a resume summary only. GitHub Issues and PRs are the task source of truth.

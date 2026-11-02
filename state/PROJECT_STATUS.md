# Project Checkpoint

Updated: 2026-11-02
Current phase: **P3 COMPLETE except EXP-01 and the EXP-05 adoption; awaiting the PO's P3 gate decision.** P4 not started.
Current focus: P3 gate review (experiments/P3/GATE_SUMMARY.md).
Last verified commit: `09bc0b9` on main. Fresh clone: typecheck, 775 unit/integration tests, 7/7 E2E (ports 5573/5574).
Active issues: P3 #31 (EXP-05 panel, draft PR #34 awaits PO approval) and #33 (EXP-06, EXP-01, Dream). #30, #32 and #41 closed (#41: Dream #7/#6/#14 validation run, `experiments/P3/DREAM_VALIDATION.md`). P1: #5–#9 closed (PRs #12–#17). P2: #18–#22 closed (PRs #23–#27).
Blockers: none.
Next action: the PO decides the P3 gate, EXP-05 adoption (PR #34) and EXP-01 questions. P4 does not start without PO approval.
Decisions taken: P0 (PR per issue, coordinator merges; model families kept; A/B on anthropic opus-5-5). P0 gate: ADR-001/002 accepted, GitHub merge only, lander checks only and no push. P1 gate: ADR-002 clarifications 1–5 and the driving-chain limit accepted. Project `.ultimate/` setup trusted (2026-11-01).
Decisions pending: EXP-01 questions from the PO ("later").

## Evidence
- P0: docs/ENVIRONMENT.md, docs/CAPABILITY_MATRIX.md, experiments/EXP-00, experiments/EXP-01/RUN-20261101-01.md
- P1: experiments/P1/LOG.md (5 defects, lander refusal proof)
- P2: experiments/P2/LOG.md (15 defects, all caught before merge; gate table; metrics), docs/screenshots/p2-*.png
- P3: experiments/P3/{GATE_SUMMARY,TOKEN_ANALYSIS,FAILURES,DREAM_VALIDATION,UI_CONCURRENCY_LIMITS}.md, experiments/EXP-02..06, docs/CI_PROPOSAL.md, docs/CAPABILITY_MATRIX.md (P3 results)
- Infrastructure: 17 failed model calls recorded to date (FAILURES.md + GATE_SUMMARY.md F14–F16), incl. three claude-code 429 pauses; recovered with no repeated effects.

Important: This file is a resume summary only. GitHub Issues and PRs are the task source of truth.

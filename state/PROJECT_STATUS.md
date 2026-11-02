# Project Checkpoint

Updated: 2026-11-02
Current phase: **P4 running** (approved at the P3 gate, 2026-11-02, "Start P4 as proposed, with CI on").
Current focus: P4 issues #46 EXP-09 blind memory eval, #47 EXP-07, #48 EXP-08, #49 scorecard.
Last verified commit: `1bdd8b3` on main. GitHub Actions CI is green (run 41449585598, 51 s). Local: typecheck, 775 unit/integration tests, 7/7 E2E.
Active issues: P4 #46–#49, and P3 #33 (EXP-06/EXP-01/Dream), still open. #45 (CI) closed: PR #50, `docs/CI_PROPOSAL.md` "Enabled". P3: #30, #31 (PR #34 merged), #32, #41 closed. P1: #5–#9 closed (PRs #12–#17). P2: #18–#22 closed (PRs #23–#27).
Blockers: none.
Next action: continue P4 issues #46–#49, then present the P4 gate package.
Decisions taken: P0 (PR per issue, coordinator merges; model families kept; A/B on anthropic opus-5-5). P0 gate: ADR-001/002 accepted, GitHub merge only, lander checks only and no push. P1 gate: ADR-002 clarifications 1–5 and the driving-chain limit accepted. Project `.ultimate/` setup trusted (2026-11-01).
Decisions pending: EXP-01 questions from the PO ("later").

## Evidence
- P0: docs/ENVIRONMENT.md, docs/CAPABILITY_MATRIX.md, experiments/EXP-00, experiments/EXP-01/RUN-20261101-01.md
- P1: experiments/P1/LOG.md (5 defects, lander refusal proof)
- P2: experiments/P2/LOG.md (15 defects, all caught before merge; gate table; metrics), docs/screenshots/p2-*.png
- P3: experiments/P3/{GATE_SUMMARY,TOKEN_ANALYSIS,FAILURES,DREAM_VALIDATION,UI_CONCURRENCY_LIMITS}.md, experiments/EXP-02..06, docs/CI_PROPOSAL.md, docs/CAPABILITY_MATRIX.md (P3 results)
- P4: experiments/P4/FAILURES.md, docs/CI_PROPOSAL.md (Enabled), .github/workflows/ci.yml
- Infrastructure: failures F1–F17 are recorded (P3 FAILURES.md, GATE_SUMMARY.md F14–F16, P4 FAILURES.md F17), incl. three claude-code 429 pauses; all were recovered with no repeated effects.

Important: This file is a resume summary only. GitHub Issues and PRs are the task source of truth.

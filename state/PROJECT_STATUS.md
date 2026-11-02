# Project Checkpoint

Updated: 2026-11-02
Current phase: **P4 running** (approved at the P3 gate, 2026-11-02, "Start P4 as proposed, with CI on").
Current focus: P4 issues #47 EXP-07, #48 EXP-08, #49 scorecard.
Last verified commit: `5015df4` on main (PR #52). GitHub Actions CI is green on PR #52 (run 41450436509, 1 m 11 s). Local at `1bdd8b3`: typecheck, 775 unit/integration tests, 7/7 E2E.
Active issues: P4 #47–#49, and P3 #33 (EXP-06/EXP-01/Dream), still open. #45 (CI) closed: PR #50, `docs/CI_PROPOSAL.md` "Enabled". #46 (EXP-09) closed: PR #52. Memory-only recall was 5/10 (FAIL against 90%) and memory plus docs 10/10. All 5 misses were memory gaps; there were no wrong retrievals. P3: #30, #31 (PR #34 merged), #32, #41 closed. P1: #5–#9 closed (PRs #12–#17). P2: #18–#22 closed (PRs #23–#27).
Blockers: none.
Next action: continue P4 issues #47–#49, then present the P4 gate package.
Decisions taken: P0 (PR per issue, coordinator merges; model families kept; A/B on anthropic opus-5-5). P0 gate: ADR-001/002 accepted, GitHub merge only, lander checks only and no push. P1 gate: ADR-002 clarifications 1–5 and the driving-chain limit accepted. Project `.ultimate/` setup trusted (2026-11-01).
Decisions pending: whether to change what memory stores at a phase gate (EXP-09 follow-up proposal; needs PO approval).

## Evidence
- P0: docs/ENVIRONMENT.md, docs/CAPABILITY_MATRIX.md, experiments/EXP-00, experiments/EXP-01/RUN-20261101-01.md
- P1: experiments/P1/LOG.md (5 defects, lander refusal proof)
- P2: experiments/P2/LOG.md (15 defects, all caught before merge; gate table; metrics), docs/screenshots/p2-*.png
- P3: experiments/P3/{GATE_SUMMARY,TOKEN_ANALYSIS,FAILURES,DREAM_VALIDATION,UI_CONCURRENCY_LIMITS}.md, experiments/EXP-02..06, docs/CI_PROPOSAL.md, docs/CAPABILITY_MATRIX.md (P3 results)
- P4: experiments/P4/FAILURES.md, docs/CI_PROPOSAL.md (Enabled), .github/workflows/ci.yml, experiments/EXP-09/RUN-20261102-01.md
- Infrastructure: failures F1–F19 are recorded (P3 FAILURES.md, GATE_SUMMARY.md F14–F16, P4 FAILURES.md F17–F19), incl. three claude-code 429 pauses; all were recovered with no repeated effects.

Important: This file is a resume summary only. GitHub Issues and PRs are the task source of truth.

# Project Checkpoint

Updated: 2026-11-02
Current phase: **P3 IN PROGRESS** (P2 gate approved 2026-11-02; ADR-001 amendment 1 recorded).
Current focus: P3 native-feature trials EXP-01..06, plus PO priorities (coordinator token analysis, Dream/memory/recovery value, infra vs agent failures, overhead reduction, CI proposal, UI concurrency limits).
Last verified commit: `c7d1d9f` on main (PR #27). Fresh clone: `npm ci`, typecheck, 775 unit/integration tests, build and `npm run test:e2e` (2/2) all pass. The lander ran the E2E check on that landing.
Active issues: P3 #31 (EXP-05 panel, draft PR #34 awaits PO approval) and #33 (EXP-06, EXP-01, Dream). #30 and #32 closed. P1: #5–#9 closed (PRs #12–#17). P2: #18–#22 closed (PRs #23–#27).
Blockers: none.
Next action: finish the approved Dream improvement branches (#33), then present the P3 gate report. P4 does not start without PO approval.
Decisions taken: P0 (PR per issue, coordinator merges; model families kept; A/B on anthropic opus-5-5). P0 gate: ADR-001/002 accepted, GitHub merge only, lander checks only and no push. P1 gate: ADR-002 clarifications 1–5 and the driving-chain limit accepted. Project `.ultimate/` setup trusted (2026-11-01).
Decisions pending: EXP-01 questions from the PO ("later").

## Evidence
- P0: docs/ENVIRONMENT.md, docs/CAPABILITY_MATRIX.md, experiments/EXP-00, experiments/EXP-01/RUN-20261101-01.md
- P1: experiments/P1/LOG.md (5 defects, lander refusal proof)
- P2: experiments/P2/LOG.md (15 defects, all caught before merge; gate table; metrics), docs/screenshots/p2-*.png
- Infrastructure: 5 Claude Code provider stops during P2 (one caused an ~8.5 h idle gap); recovered with no repeated effects.

Important: This file is a resume summary only. GitHub Issues and PRs are the task source of truth.

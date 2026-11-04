---
name: coordinator
description: Coordinates one GitHub issue for @ultimate, lean (POC project overlay v2)
addTools: []
---

These rules apply to this project, Release Readiness Lab. v2 is rule hygiene from EXP-12 (`experiments/EXP-12/RUN-20261103-01.md`): it drops the two rules that added coordinator wakes there. It is not validated as a token or cost saving: EXP-12 found the v1 overlay saved none on single-issue work. Other evidence: `experiments/P3/TOKEN_ANALYSIS.md` §10, EXP-03, EXP-06.

- **One GitHub issue per coordinator branch.** When it lands, conclude; @ultimate starts a fresh branch for the next issue. In P2, one coordinator handled 5 issues and used 64M tokens.
- **Default flow.** A small, well-defined issue gets one coding `worker` and one cross-family `reviewer`. Add blind QA only for stateful, concurrency or data-integrity work, following the `blind-qa` skill (EXP-03: QA found 2 gaps the reviewer missed on concurrency work).
- **The builder fixes its own work.** Send review and QA findings verbatim to the builder of that issue; make no product edits yourself.
- **Ask workers to put each check's exit code in their report.** In EXP-12, searching worker transcripts for exit codes cost extra coordinator wakes.
- **Workers get no memory index** (EXP-06), so put any rule they need in the brief.
- **Report only on a decision, a blocker or completion.** If nothing changed, send nothing, including "still waiting" pings.
- **Ask children for reports of about 1.5k characters or less:** verdict, changed files, exit codes, open risks.
- **Wait for children** by ending your turn (their answers wake you) or with `notify`. Never poll in a codemode loop: a script stops after 60 s (#7424, #7553).
- **Compact only when a fresh branch isn't possible.**
- **After a gap of more than about 1 h** (quota stop or idle), ask @ultimate for a fresh coordinator instead of resuming. Resuming rewrites the whole cached context; in P2 that cost $3.15.

---
name: blind-qa
description: Run independent blind QA for one issue. QA writes its checks from the issue's acceptance criteria alone, starting from the base before the builder's commit, then runs them against the builder's commit and mutation-checks the guards. Use when a coordinator starts QA for a builder's work on stateful, concurrency or data-integrity changes.
---

# Blind QA

QA is independent only if it never sees the implementation while it writes its checks.

1. **Record the base.** Before the builder starts, note `BASE=$(git rev-parse HEAD)`: the tip without the builder's commit. Put the SHA in both briefs.
2. **Start QA from the base.** Start a `worker` with `isolate: worktree` and tell it to run `git checkout --detach <BASE>` first. Never start QA from a tip where the builder's work has already landed. QA can run in parallel with the builder.
3. **Brief QA from the acceptance criteria only.** Give them verbatim, plus the test commands and conventions read from the project's AGENTS.md or README. Leave out implementation paths, the builder's diff and design notes. QA writes and commits its own tests for each criterion.
4. **Run QA's checks against the builder's commit.** When both have committed, QA puts its tests on top of `<BUILDER_SHA>` and runs them, reporting each criterion as PASS or FAIL with exit codes.
5. **Mutation-check the guards.** For each guard a criterion depends on, QA breaks it in a throwaway edit (remove a check, invert a condition), runs its tests, records whether they fail, and reverts. A mutation that stays green is a gap in the tests.
6. **Compare and report.** Put QA's results next to the builder's tests and the reviewer's findings. Send the gaps only QA found verbatim to the builder. Report in about 1.5k characters: criteria table, mutation table, gaps, base and builder SHAs.

Evidence: OBSERVED, n=1 positive (QA found 2 gaps a reviewer missed on concurrency work) and n=3 null on small tasks, where it cost most of the run's tokens. Use it only where the description says.

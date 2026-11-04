---
name: blind-qa
description: Run independent blind QA for one issue. QA writes its checks from the issue's acceptance criteria alone, starting from the base before the builder's commit, then runs them against the builder's commit and mutation-checks the guards. Use when a coordinator starts QA for a builder's work.
---

# Blind QA

QA is independent only if it never sees the implementation while it writes its checks.

1. **Record the base.** Before the builder starts, note `BASE=$(git rev-parse HEAD)`. This is the tip without the builder's commit. Put the SHA in both briefs.
2. **Start QA from the base.** Start a `worker` with `isolate: worktree` and tell it to run `git checkout --detach <BASE>` first. Do not start QA from your tip after the builder has landed there. QA can start in parallel with the builder.
3. **Brief QA from the AC only.** Give the issue's acceptance criteria verbatim, plus the test commands and conventions (test locations, any special way to run them), read from the project's AGENTS.md or README. Leave out implementation paths, the builder's diff and design notes. Ask QA to write its own tests or spec for each AC, and to commit them.
4. **Run QA's checks against the builder's commit.** When both have committed, QA cherry-picks or checks out its tests on top of `<BUILDER_SHA>` and runs them. Ask it to report each AC as PASS or FAIL, with exit codes.
5. **Mutation-check the guards.** For each guard an AC depends on, QA breaks it in a throwaway edit (remove a check, invert a condition), runs its tests, records whether they fail, and reverts. A mutation that stays green is a gap in the tests.
6. **Compare and report.** Put QA's results next to the builder's tests and the reviewer's findings. List the gaps that only QA found, and send them verbatim to the builder. The report should be 1.5k characters or less: AC table, mutation table, gaps, and the base and builder SHAs.

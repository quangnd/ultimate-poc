# P1 log: Domain AC tests green

- Phase: P1 (domain core only), approved by the PO at the P0 gate, 2026-11-01 13:46 UTC.
- Coordinator: Ultimate conversation #1510 (claude-code/claude-opus-5-5, medium), started by @ultimate #52.
- Window: 2026-11-01 13:47 → 14:47 UTC (coordinator first entry → last metrics read).
- Families: worker and QA github-copilot/claude-sonnet-5.5 (xhigh), reviewer openai-codex/gpt-6.1-sol (medium), as in
  decision p0-decisions 2b.
- Merge path: one PR per issue on GitHub; the coordinator merges with `gh pr merge --merge` only after reviewer APPROVED
  and checks are green (PO decision 5a).

## Issue → PR → merge commit

| Issue | PR | Merge commit | Started (UTC) | Merged (UTC) |
|---|---|---|---|---|
| #5 scaffold, types, lander checks | #12 | 25a1a06 | 13:50 | 13:55 |
| #6 validation | #13 | ea72d9d | 13:54 | 14:08 |
| #9 fixture (part 1: data, cycle variant, validator) | #14 | d9d0824 | 13:56 | 14:11 |
| #7 scheduler + #9 part 2 (FW-delay test) | #15 | bac3ada | 14:00 | 14:33 |
| #8 blocking, driving chain, readiness | #16 | see PR | 14:21 | see PR |

The #7 and #9 PRs each merged under 2 min after the final review (14:08, 14:11, 14:33). #8 is the last PR, carrying
this log.

## Runs per issue

| Issue | Worker (impl) | QA (blind) | Reviewer rounds | First-pass QA | Review findings |
|---|---|---|---|---|---|
| #5 | #1666 | none (scaffold); coordinator fresh-clone run | #1799 APPROVE | n/a | 1 nit |
| #6 | #1849 | #2069 (206 tests) | #2418 REQUEST CHANGES → #2579 APPROVE | 205/206 | 1 major |
| #9 | #1964 | structural tests by worker; validator + FW tests by coordinator | #2710 APPROVE | n/a | none |
| #7 | #2194 | #2462 (135 tests) | #2857 REQUEST CHANGES → #2993 APPROVE | 135/135 | 1 P2 |
| #8 | #2901 | #3125 (69 tests) | #3288 APPROVE | 69/69 | none |

QA ran blind: the implementation was not in its worktree, and it checked its own expectations against a throwaway
reference implementation it then deleted. First-pass is QA's committed suite run against the real implementation in
the coordinator's worktree, before any repair.

## Defects

| # | Found by | Issue | Severity | Defect | Fix | Caught by impl tests / QA? |
|---|---|---|---|---|---|---|
| D1 | reviewer #2418 | #6 | major (P2) | Error messages used `String(value)`, so a JSON object with a bad `toString` (`{"toString":0}`) as stream/status/gate/id threw instead of returning errors. | 2489dd8: `show()` formatter and a regression test (fails before, passes after) | no / no |
| D2 | reviewer #2857 | #7 | P2 | Calendar used `Date.UTC`, which maps years 0000–0099 to 1900–1999, though the validator accepts them. | 5a3a302: integer civil-date math and a regression test (fails before, passes after) | no / no |
| D3 | QA #2069 (first pass) | #6 | contract (not code) | QA expected a cycle error alongside duplicate/missing ids; the coordinator's contract skips the cycle search then. Not an implementation defect: an unstated contract point. | ADR clarification 5; QA assertion adjusted (reviewer #2418 judged it justified) | n/a |
| D4 | QA #3125 | #9/#8 | doc (minor) | fixtures/README called QA-04 part of the "chain"; the literal §7 driving chain starts at QA-03 (ties QA-04 at finish 27, smaller id). | 84263d9 README note | n/a |
| D5 | reviewer #1799 | #5 | nit | Gate type comment implied a missing gate is invalid (§8 says it is not). | 2314a65 | n/a |

Both real code defects (D1, D2) were robustness bugs at input boundaries: found by the GPT reviewer, missed by both
Sonnet implementer and Sonnet QA suites. No defect touched ADR-002 scheduling logic itself.

## Tests

| Point | Files | Tests |
|---|---|---|
| after #5 | 1 | 1 |
| after #6 | 3 | 305 |
| after #9 part 1 | 4 | 326 |
| after #7 + #9 part 2 | 7 | 491 |
| after #8 (final) | 9 | 587 |

`npm run typecheck` exit 0 at every merge. Mutation checks were run (throwaway, not committed) by workers and QA:
every non-equivalent mutant was killed. Totals: validator 15+, scheduler 28, readiness 12 + 29.

## Lander

- `.ultimate/settings.json` (lander checks: `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm test`; no push)
  is on main since 25a1a06.
- **Blocker found:** the lander reads checks via `host.projectSettings()`, which returns `{}` unless the project's
  `.ultimate/` setup is trusted (ultimate `server/project-setup.ts`). The project was "undecided", so the sync landing
  of 25a1a06 ran **no checks** (lander #28: landed, "Not pushed", no check steps). Reported to @ultimate; the PO
  trust decision is pending, and the failing-test refusal proof waits for it.
- `npm ci` vs worktree setup: `npm ci` takes 0.7–1.0 s with a warm cache (17 s cold first install), so a setup step
  buys nothing; checks keep `npm ci`.
- Until the proof, checks were run manually by the coordinator in its worktree before every PR (exit codes in each PR).

## Interventions

- Human (PO): 0 so far in P1. The project-trust decision is pending.
- @ultimate decisions in the PO's place: 1 message (clarifications 1a, 2a, 3a, 4), 13:48 UTC.
- Worker questions: #1666 asked once (vitest picked up experiments/ tests; coordinator approved `vitest.config.ts`).
- Coordinator repairs: D1, D2, D3 assertion, D4 README, D5 comment (all in coordinator commits, each reviewed).
- Infra: one coordinator `bash` call hung 600 s at `gh pr merge`/`gh issue comment` (gh waiting on stdin), stopped by the
  tripwire; the PR had merged and comments were re-posted with `</dev/null`. Infrastructure, not agent logic.

## ADR-002 findings

- Clarifications 1–5 added (Status still Accepted; PO reviews at the gate). None adds behaviour; each fixes a point the
  text left open (slip counting, inconsistencies vs readiness, unnamed fields, cycle report, no cycle search on an
  undefined graph).
- §7 "critical blocker … whose delay moves the projected finish" overstates: the algorithm follows one chain, so a
  task tied on another zero-slack path (e.g. 0-day gate QA-04 on the fixture, tied with QA-03) is not reported. Not
  wrong as implemented, but the wording is not an exhaustive sensitivity guarantee (reviewer #3288).
- Consequence of §8 + clarification 2: once all four gates are done, a remaining blocking task always comes with an
  inconsistency reason (worker #2901, QA #3125).
- Nothing in ADR-002 was found wrong in the sense of contradicting the PRD or producing an incorrect schedule.

## Metrics (tools/metrics/conversation-metrics.js, read 2026-11-01 ~14:47 UTC)

Cost is a list-price proxy (subscriptions: claude-code, github-copilot, openai-codex), never an invoice. Elapsed
minutes are first to last own entry. The coordinator total includes its full run up to the read.

| Conversation | Role | Minutes | Model tokens / cost proxy | Tool calls |
|---|---|---|---|---|
| #1510 | coordinator | 59.6 | opus-5-5 15,943k $8.31; sonnet-5.5 207k $0.60 (summaries) | 104 |
| #1666 | worker #5 | 1.7 | sonnet 506k $0.23 | 15 |
| #1799 | reviewer #5 | 0.4 | gpt-6.1-sol 52k $0.05 | 3 |
| #1849 | worker #6 | 3.2 | sonnet 653k $0.41 | 15 |
| #2069 | QA #6 | 6.2 | sonnet 818k $0.67 | 13 |
| #2418 | reviewer #6 r1 | 1.6 | gpt 165k $0.10 | 6 |
| #2579 | reviewer #6 r2 | 0.3 | gpt 43k $0.04 | 3 |
| #1964 | worker #9 | 4.1 | sonnet 925k $0.53 | 20 |
| #2710 | reviewer #9 | 0.8 | gpt 53k $0.09 | 3 |
| #2194 | worker #7 | 4.3 | sonnet 901k $0.50 | 20 |
| #2462 | QA #7 | 14.2 | sonnet 1,692k $1.40 | 21 |
| #2857 | reviewer #7 r1 | 0.9 | gpt 124k $0.08 | 5 |
| #2993 | reviewer #7 r2 | 0.6 | gpt 67k $0.05 | 4 |
| #2901 | worker #8 | 7.5 | sonnet 511k $0.48 | 11 |
| #3125 | QA #8 | 10.6 | sonnet 2,124k $1.22 | 23 |
| #3288 | reviewer #8 | 1.0 | gpt 163k $0.11 | 6 |

Totals by model: claude-opus-5-5 15.94M tokens $8.31 (105 calls); claude-sonnet-5.5 8.35M $6.10 (139 calls);
gpt-6.1-sol 0.67M $0.52 (37 calls). **All P1: 24.96M tokens, ~$14.93 list-price proxy.** The coordinator was 64% of
tokens (mostly cached context re-reads across ~105 turns).

Each conversation reported one metrics warning (trace begins late or is truncated); tokens come from `pi.usage`, which
is authoritative and unaffected.

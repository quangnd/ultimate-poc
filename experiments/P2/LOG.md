# P2 log: US-01..08 verified

- Phase: P2 (local web UI, edit workflow, persistence, E2E), approved by the PO at the P1 gate (choice 3a), 2026-11-01.
- Coordinator: Ultimate conversation #1510 (claude-code/claude-opus-5-5, medium).
- Window: 2026-11-01 15:00 UTC → 2026-11-02 ~00:50 UTC wall clock. This includes an idle gap of ~8.5 h (16:00 → 00:10) after a provider/session failure; active work was roughly 2 h.
- Families: worker/QA github-copilot/claude-sonnet-5.5 (xhigh), designer claude-code/claude-opus-5-5, reviewer openai-codex/gpt-6.1-sol (medium).
- Merge path: unchanged from P1. One PR per issue; the coordinator merges with `gh pr merge --merge` after reviewer APPROVED and green checks. After each merge local main is synced with `workspace submit`, so the lander runs `lander.checks` on the merged result and never pushes.

## Issue → PR → merge commit

| Issue | PR | Merge commit | Built by | Review rounds |
|---|---|---|---|---|
| #18 store + loopback API | #23 | 7e70b6a | worker #3786, QA #3972 | 2 (#4342, #4619) |
| #19 dashboard | #24 | ec6480b | designer #4025 | 2 (#4342, #4619, combined with #18) |
| #20 editor | #25 | 8eebd04 | designer #4804 | 3 (#5081, #5222, #5336) |
| #21 import / export | #26 | 961e9e6 | designer #5453 | 2 (#5740, #5907) |
| #22 E2E, lander, README | #27 | see PR | worker #6014 | 2 (#6253, #6329) |

## Defects found by independent QA or reviewers

All defects were fixed by the coordinator. Each fix has a regression test that fails before the fix, except where noted.

| # | Issue | Found by | Severity | Defect |
|---|---|---|---|---|
| D1 | #18 | worker #3786 (risk note) | security | Cross-site "simple" requests and DNS rebinding could write the store. Fixed: Host allow-list (403) and JSON content type required (415). |
| D2 | #18 | reviewer #4342 | P1 | A failed directory fsync was swallowed, so a save reported success. |
| D3 | #18 | QA #3972 | minor | Export re-serialized the document instead of serving the stored bytes. |
| D4 | #18 | QA #3972 | minor | Oversize uploads got ECONNRESET 11–70% of the time instead of 413. After the fix: 0 resets in 300 uploads. |
| D5 | #19 | reviewer #4342 | P1 | A task id `constructor` crashed the dashboard (prototype lookup in `blockedBy`). Fixed in the domain with a null-prototype record. |
| D6 | #19 | reviewer #4342 | P2 | Inconsistencies were hidden when the release was READY (ADR-002 clarification 2). |
| D7 | #20 | reviewer #5081 | P1 | Edits made during a save were lost. No unit test; browser-verified. |
| D8 | #20 | reviewer #5081 | P1 | `suggestId` looped forever on an unsafe numeric suffix. |
| D9 | #20 | reviewer #5081 | P2 | `Number()` silently rounded "1.0000000000000001" to 1. |
| D10 | #20 | reviewer #5222 | P1 | A view switch remounted the editor and reset its save lock. No unit test; browser-verified. |
| D11 | #20 | reviewer #5222 | P1 | `suggestId` could still loop at the safe-integer boundary. |
| D12 | #21 | reviewer #5740 | P1 | An import left editor writes enabled, so a concurrent save could overwrite the imported release. No unit test; browser-verified with a stalled fetch. |
| D13 | #21 | reviewer #5740 | P2 | A lost answer was reported as "nothing imported", although the server may have stored the file. |
| D14 | #21 | reviewer #5740 | P2 | The required API-level round-trip test was missing (added). |
| D15 | #22 | reviewer #6253 | P2 | The E2E exported through the API, not the Export link. A broken link would have passed. Mutation run: pointing the link elsewhere fails both runs. |

- **Totals:** 15 defects: 7 P1, 6 P2, 1 security hardening (D1), 2 minor. None reached main.
- **First-pass acceptance:** QA #3972 met all #18 AC on its first run (118 passed, 1 expected-fail deviation, D3). Designer and worker AC were met per their own checks. Every UI issue still needed 1–2 extra review rounds.
- **Pattern:** the GPT reviewer found every P1. Most were state or concurrency races in the React UI (D7, D10, D12) and numeric edge cases (D8, D9, D11). None of them were caught by the builder's own tests.

## Tests and checks at the end of P2

| Check | Result |
|---|---|
| `npm run typecheck` (now covers `e2e/` and `playwright.config.ts`) | exit 0 |
| `npm test` (Vitest) | 16 files, **775 passed** |
| `npm run test:e2e` (Playwright, Chromium) | **2 passed**, the same workflow run twice on fresh stores |
| `npm run build` | exit 0 (pre-existing chunk-size warning) |
| Fresh clone (worker #6014): `npm ci && typecheck && test && test:e2e` | all exit 0, no code edits, `npm ci` 0.97 s with a warm cache |
| E2E mutation: save stubbed to skip the PUT | both runs fail: "Expected 8, Received 5" |

## P2 gate (docs/ROADMAP.md): "Browser workflow completed twice, no data loss after app restart; synthetic import/export pass; UI communicates assumptions"

| Gate item | Evidence | Status |
|---|---|---|
| Browser workflow completed twice | E2E runs twice per `npm run test:e2e`: load sample → edit FW-03 5→8 → save → reload → API process killed and restarted on the same data dir → reload → Export link download | PASS |
| No data loss after app restart | Same E2E: a real API process restart (new pid). The value 8 and the finish date Mon 15 Feb 2027 survive. Store crash test in QA #3972: SIGKILL between tmp write and rename leaves the old file intact. | PASS |
| Synthetic import / export | `tests/web/transfer.api.test.ts`: real-server export → import gives byte-identical stored file and re-export; the cycle variant is refused and the store is unchanged. Designer browser checks with CSV, oversize, 400 and 413 (stored checksum unchanged). | PASS |
| UI communicates assumptions | The dashboard shows "Estimate, not a commitment", the assumption list (Mon–Fri, no holidays, one task per stream, whole days, remaining work, greedy and not optimal), the driving-chain label with its limit, and inconsistencies (`docs/screenshots/p2-dashboard-*.png`). | PASS |

US-01..08 mapping:
- US-01 setup: README plus the fresh clone.
- US-02/03 editor: #20.
- US-04 forecast and assumptions: #19.
- US-05/06 readiness and dashboard: #19.
- US-07 persistence and import/export: #18, #21, E2E.
- US-08 tests: unit, integration and one E2E.

## Lander

- `lander.checks` now covers `npm ci`, typecheck, `npm test` and `npm run test:e2e` (timeout 300 s), with no push.
- Each merged PR was followed by a sync landing whose checks were green: ec6480b, 8eebd04 and 2e40db7.
- The landing for #22 is the first with the E2E check.
- Chromium comes from the per-user Playwright cache. A new machine or user needs `npx playwright install chromium` once; the first download took about 8 minutes here.

## Interventions and process notes

- **Human (PO):** 0 during P2 implementation. P2 was approved at the P1 gate.
- **Infrastructure errors** (not agent errors): 4 coordinator runs stopped on a Claude Code provider "Incomplete upstream response", plus one session-quota/provider stop that caused the ~8.5 h gap. The reported last steps were a screenshot, a bash call and a browser step. Each time the coordinator resumed from the checkpoint and checked GitHub and git state first; no commit, PR or merge was repeated.
- **Independence confound:** QA #3972's worktree was branched from the coordinator tip and contained the #18 implementation. This was a coordinator setup error; QA reports it did not read the code. Later QA was not repeated for UI issues; review plus designer screenshots, and finally the E2E, served instead.
- **GitHub API lag:** `gh pr merge 25` right after create failed with "Could not resolve to a PullRequest". A retry by branch name worked.
- **ADR-001 divergence (#22):** ADR-001 says "one npm script starts both" servers for the E2E. Here Playwright starts Vite, and the test fixture starts the API as a real process, because it must kill and restart it. `npm run test:e2e` is still the single command. The reviewer judged this a reasonable implementation of the intent. The ADR was not edited; the PO decides at the gate.

## Metrics (tools/metrics/conversation-metrics.js, read 2026-11-02 ~00:50 UTC)

The cost column is a list-price proxy, not an invoice: these are subscription providers.

| Conversation | Role | Minutes | Tokens / cost proxy |
|---|---|---|---|
| #3786 | worker #18 | 4.6 | sonnet 1,448k $0.63 |
| #3972 | QA #18 | 13.9 | sonnet 2,770k $1.26 |
| #4025 | designer #19 | 11.0 | opus 2,264k $2.31 |
| #4342 | reviewer #18+#19 r1 | 1.7 | gpt 298k $0.16 |
| #4619 | reviewer #18+#19 r2 | 1.5 | gpt 102k $0.07 |
| #4804 | designer #20 | 26.0 | opus 3,543k $4.19 |
| #5081 | reviewer #20 r1 | 0.8 | gpt 150k $0.10 |
| #5222 | reviewer #20 r2 | 0.9 | gpt 107k $0.07 |
| #5336 | reviewer #20 r3 | 0.7 | gpt 71k $0.06 |
| #5453 | designer #21 | 13.7 | opus 3,419k $2.99 |
| #5740 | reviewer #21 r1 | 0.6 | gpt 82k $0.07 |
| #5907 | reviewer #21 r2 | 0.7 | gpt 81k $0.07 |
| #6014 | worker #22 | 11.5 | sonnet 2,599k $0.79 |
| #6253 | reviewer #22 r1 | 0.6 | gpt 76k $0.06 |
| #6329 | reviewer #22 r2 | 0.3 | gpt 39k $0.03 |

- **Children total:** opus 9.23M $9.49; sonnet 6.85M $2.76 (incl. small summary calls); gpt 1.01M $0.69. That is about 17.1M tokens, ~$12.94.
- **Coordinator #1510, P2 share (derived):** the whole-conversation total is opus 83.97M $32.73 and sonnet 0.48M $1.41. Subtracting the P1 log's opus 15.94M $8.31 and sonnet 0.21M $0.60 gives about **68.0M tokens, ~$24.42 opus** and 0.27M $0.81 sonnet for P2. This is derived by subtraction, not measured per phase.
- **P2 total (approx.):** ~85.4M tokens, ~$38.2 list-price proxy. The coordinator was ~80% of tokens, mostly cached context re-reads over a long conversation.

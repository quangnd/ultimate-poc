# P3-A: Infrastructure-failure ledger (issue #30)

This ledger lists infrastructure failures only: provider, quota and relay errors. Agent implementation defects are in the defect tables of `experiments/P1/LOG.md` and `experiments/P2/LOG.md` and are not repeated here.

**Sources (M):**

- `pi.assistant` entries with `stopReason: error` in each conversation;
- `watchdog.failure` and `pause.limit` entries in root #52;
- `ultimate.search('Incomplete Claude Code')`.

All times are UTC. "Idle gap" runs from the last successful call before the failure to the first successful call after it.

| # | Conv. | Failed call(s) (entry, time) | Error | Last step before | Auto-retry | Recovery | Idle gap | Duplicate effects |
|---|---|---|---|---|---|---|---|---|
| F1 | #6558 (this analysis) | 6629, 04:03:04 | upstream, status unknown, relay failure | none (first model call of the branch) | no | manual resume message from #52 (board.message 6679, 04:03:28) | ~0.5 min | none: no work had started |
| F2 | #1510 | 4577, 15:28:10; then 4583, 15:29:14 | upstream, status unknown ×2 | screenshot | yes: watchdog `retried: true` (#52 4587); the retry also failed | resume message from #52 (4604, 15:29:30), then the run continued | 1.5 min | none |
| F3 | #1510 | 4734, 15:34:28; 4739, 15:35:30; 4760, 15:35:51 | upstream, status unknown ×3 | bash (test run) | yes: watchdog `retried: true` (#52 4741); the retry and a #52 resume (4756) both failed | third resume input (pi.user 4764, 15:36:53) succeeded | 2.9 min | none |
| F4 | #1510 | 5056, 16:03:38 | **429 rate limit** (claude-code account) | read | no: run paused (`pause.limit`, #52 5057) | resume input 5061 at 00:10:32: "Continue from the last verified checkpoint… do not repeat completed commits, PR…" | **8 h 07 min** | none; the first resumed call was a cache-cold rewrite of 392,952 tokens ($3.15, see TOKEN_ANALYSIS §7) |
| F5 | #5453 (designer #21) | 5705, 00:33:07 | upstream, status unknown | not recorded | resume input (pi.user 5707, 00:34:09) | the run continued | ~1 min | none |
| F6 | #1510 | 5891, 00:39:04 | upstream, status unknown | browser | resume input (pi.user 5893, 00:40:06) | the run continued | 1.3 min | none |
| F7 | #6558 (this analysis) | 7000, 04:10:24 | **429 rate limit** (claude-code account) | write (TOKEN_ANALYSIS.md draft) | no: run paused (`pause.limit`, #52 7001) | **Play** by the human (pause.note 7014, 06:41:20) | **2 h 31 min** | none: the file was intact and the edit continued |

| F8 | #7486, #7509 (EXP-03, #32) | e2e runs ~06:5x–07:0x | Playwright `webServer` port 5273/5274 already in use / `EADDRINUSE` (concurrent `npm run test:e2e` from two worktrees, fixed ports) | bash (e2e) | no | each worker re-ran serially after checking `lsof`; all later runs green | minutes | none: no test executed, no write |

F8 is a local test-infrastructure collision, not a provider error. It is listed here because it is infrastructure, not an agent defect.

F7 is the same account-wide claude-code 429 window that paused the EXP-05 coordinator #6576 (about 04:10–06:35 UTC, recorded in `experiments/EXP-05/RUN-20261102-01.md`, PR #34). It counts as one infrastructure event that hit two conversations.

## Correction 2026-11-02 (Dream proposal 3, issue #33)

The rows above F1–F8 and the original totals are kept as written. A re-count found **15** failed model calls, not 10. Five were missing:

| # | Conv. | Failed call (entry, time) | Error | Last step before | Recovery | Idle gap | Duplicate effects |
|---|---|---|---|---|---|---|---|
| F9 | #1106 (P0 docs reviewer, openai-codex gpt-6.1-sol) | 1267, 2026-11-01 13:00:56 | `WebSocket error` | read | automatic: next call 1268 at 13:02:58, no input in between | 2.0 min | none |
| F10 | #2462 (QA #7, github-copilot claude-sonnet-5.5) | 2798, 2026-11-01 14:15:27 | `Connection error.` | bash (vitest) | automatic: next call 2799 at 14:16:02 | 0.6 min | none |
| F11 | #2901 (builder #8, github-copilot claude-sonnet-5.5) | 3066, 2026-11-01 14:23:52 | `408 user_request_timeout` (request body read timed out) | write | automatic: next call 3067 at 14:25:24 | 1.5 min | none |
| F12 | #6576 (EXP-05 coordinator) | 7003, 2026-11-02 04:10:25 | **429 rate limit** (claude-code account) | edit | Play by the human; next call 7006 at 06:41:20 | 2 h 31 min | none; the same 429 window as F7 |
| F13 | **#52** (root) | 7233, 2026-11-02 06:44:23 | upstream, status unknown, relay failure | messages from #6576 (7230) | next call 7301 at 06:44:55, after #6576's messages 7243 and 7278 | 0.5 min | none |

**Root cause of the miss:** the first count used one search string (`Incomplete Claude Code`) plus #52's notification cards, not the `stopReason` of every assistant entry.

- That string only matches claude-code relay errors, so F9–F11 (openai-codex and github-copilot) never matched.
- F12 was described in prose under F7 but never given a row or counted.
- F13 happened at 06:44, after the #30 count was taken (its commit `f7cf79b` is 06:42 UTC). The ledger gave no measurement cutoff, so "#52: 0" read as a complete figure.

**Re-count (codemode, 2026-11-02, cutoff entry ~10214):**

```js
// every pi.assistant entry of every conversation, paged with `before`
const hits = []
for (const { id } of await ultimate.conversations()) {
  let before
  for (;;) {
    const es = await ultimate.entries(id, { kinds: ['pi.assistant'], limit: 500, before })
    for (const e of es) if (e.model[0].stopReason === 'error') hits.push(`${id}/${e.id}`)
    if (es.length < 500) break
    before = es[es.length - 1].id
  }
}
// cross-check
await ultimate.search('"stopReason":"error"', { limit: 200 })
```

Output: 68 conversations, 1,528 assistant entries, **15 errors**. The search returned the same 15 entries: 52/7233, 1106/1267, 1510/4577, 1510/4583, 1510/4734, 1510/4739, 1510/4760, 1510/5056, 1510/5891, 2462/2798, 2901/3066, 5453/5705, 6558/6629, 6558/7000, 6576/7003.

## Root #52

- Original line, kept: "0 failed model calls of its own (M: 101 assistant entries checked)."
- **Corrected:** 1 failed model call of its own, F13 (7233), after the original count was taken.
- Its error entries are the notification cards for its children: `watchdog.failure` 4587 (F2) and 4741 (F3), and `pause.limit` 5057 (F4) and 7001 (F7).
- #52 also sent the resume message for F1.

## Totals (M)

| Error type | Failed calls | Incidents | Conversations |
|---|---|---|---|
| Upstream, status unknown | 8 | 5 | F1, F2, F3, F5, F6 |
| 429 rate limit | 2 | 2 | F4, F7 |

- Every failed call recorded 0 tokens and $0.
- **Duplicate effects:** none observed.
  - `gh pr list --state all` shows no duplicate PR for any branch.
  - The P1/P2 issue → PR → merge tables have one merge per PR.
- **Cost of the gaps:**
  - The short outages (F1–F3, F5, F6) cost ≤ 3 min each and resumed on a warm cache: the first successful call's cacheWrite was 2.3k–3.3k ($0.09–0.14) in #1510 (F2, F3, F6), 1.2k ($0.03) in #5453 (F5), and 16.4k in #6558 (F1, a branch's first call, so a cache write was expected).
  - The two rate-limit stops cost wall-clock time: 8 h 07 min and 2 h 31 min.
  - F4 also cost one full cache rewrite.
### Corrected totals (re-count above)

The original table counted 10 calls in 7 incidents (F1–F7). Corrected:

| Measure | Count | Members |
|---|---|---|
| Failed model calls | **15** | 9 upstream status unknown (F1, F2×2, F3×3, F5, F6, F13), 3 × 429 (F4, F7, F12), 1 WebSocket (F9), 1 connection error (F10), 1 × 408 (F11) |
| Incidents (one per conversation and failure window) | **12** | F1–F7, F9–F13 |
| Shared outages (one event, several conversations) | **1** | F7 + F12: the 04:10–06:41 claude-code 429 window |
| Distinct infrastructure events | **11** | 12 incidents, minus 1 for the shared outage |
| Deliberate negative tests | **0** | none of the 15 was provoked; the P1 lander refusal proof (`experiments/P1/LOG.md`) is a failing check, not a model error |
| Non-model infrastructure (F8) | 1 | port collision; not in the 15 |

The three non-claude-code errors recovered without any input.

- **Agent-error vs infrastructure:** all incidents above are infrastructure. None was caused by agent behaviour. The P1 hang of `gh` waiting on stdin (P1 log) is an agent/tool-usage error and is not listed here.

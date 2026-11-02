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

## Root #52

- 0 failed model calls of its own (M: 101 assistant entries checked).
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
  - The short outages (F1–F3, F5, F6) cost ≤ 3 min each and resumed on a warm cache: the first call's cacheWrite was 2.3k–3.3k, $0.09–0.14.
  - The two rate-limit stops cost wall-clock time: 8 h 07 min and 2 h 31 min.
  - F4 also cost one full cache rewrite.
- **Agent-error vs infrastructure:** all incidents above are infrastructure. None was caused by agent behaviour. The P1 hang of `gh` waiting on stdin (P1 log) is an agent/tool-usage error and is not listed here.

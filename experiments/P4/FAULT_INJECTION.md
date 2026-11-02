# P4 fault injection (issue #49)

Two parts:
- **A.** A controlled host restart while the lander integrates a throwaway docs-only change.
- **B.** An observational analysis of every real provider failure recorded so far.

Synthetic data only. No tool was killed while it wrote a product file. Times are UTC unless stated otherwise; the local git reflog prints +07:00.

Run by coordinator #15503. @ultimate #52 performed both restarts, because only it may restart the host.

## A. Restart during integration (controlled)

### Setup
- **Change under test:** `experiments/P4/fault-restart-marker.md`, docs only, committed as `0ba0b14` (attempt 1) and `64ac4b8` (attempt 2) on `ultimate/4e9fbc-15503`.
- **Lander:** conversation #28. Checks: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:e2e` (`.ultimate/settings.json`). No push is configured, so the lander only fast-forwards local `main`.
- **Pre-state** (`~/p4-fault-15503/pre.txt`, outside the repo, 17:07:56Z):
  - local `main` at `b87f8df`, reflog head `merge b87f8df: Fast-forward`;
  - `origin/main` at `b87f8df`.
- **Restart mechanism:** @ultimate's `restart` tool. The supervisor type-checks the new core before it swaps processes, so the old process keeps running for about 13 s after the request.
- **Evidence sources:**
  - #52's timing messages;
  - `ps` start times of the new core;
  - lander log #28 (`ultimate.lander` entries);
  - `event.workspaces.landed` entries in #9;
  - the reflog of local `main`;
  - `gh pr list`;
  - `git ls-remote origin`.

### Attempt 1: missed the window (PARTIAL as a test)
| Time (Z) | Event | Source |
|---|---|---|
| 17:08:19.4 | submission `15503-0ba0b14-mvzij0wu` queued and started | #28/15612–15615 |
| 17:08:31.6 | E2E check started | #28/15632 |
| 17:08:36 | restart requested | #52 |
| 17:08:41.8 | checks passed, fast-forward, `landed` | #28/15637–15640; reflog `merge 0ba0b14: Fast-forward` at 00:08:41+07:00 |
| 17:08:49 | new core pid 69722 started (generation 3) | `ps -o lstart` |

The landing finished 7 s before the swap, so the restart did not interrupt it. Effects: one `landed` entry, one `workspaces.landed` event (#9/15641) and one lander report to #15503 and to #52. Nothing was duplicated.

### Attempt 2: restart hit the E2E check (the single allowed retry)
| Time (Z) | Event | Source |
|---|---|---|
| 17:14:04.8 | submission `15503-64ac4b8-mvziqff0` queued and started | #28/15726–15729 |
| 17:14:08 | restart requested | #52 (8 s after the planned 17:14:00) |
| 17:14:08.6–17:14:23.7 | `npm ci`, typecheck and `npm test` passed | #28/15739–15755 |
| 17:14:23.7 | E2E check started; Playwright started Vite (`npm run dev --port 5273`, pid 72455/72489, 17:14:27) | #28/15757; `ps` |
| 17:14:32 | new core pid 72533 started (generation 4). The old core and its check were stopped | `ps -o lstart`; #52 |
| 17:14:36.8 | **lander resumed the same submission** (`setting up`, then `checking: npm run test:e2e` directly; the three passed checks were not rerun) | #28/15764–15765 |
| 17:14:40.5 | E2E failed: `http://localhost:5273 is already used` | #28/15766 |
| 17:14:41.3 | automatic rerun failed the same way. Outcome: `failed` ("check failed twice"), reported once to #15503 | #28/15768–15770; #15503/15771 |
| 17:15:14 | cause found: the Vite server of the interrupted run survived the restart, re-parented to pid 1, and kept holding 5273 | `~/p4-fault-15503/orphan.txt` |
| 17:15:24 | orphan killed by the coordinator (`kill 72489 72455`); 5273 free | bash |
| 17:15:30.2 | resubmitted the same tip (`15503-64ac4b8-mvzis9b4`) | #28/15811 |
| 17:15:48.9 | all four checks passed; fast-forward; `landed` | #28/15831–15834; reflog `merge 64ac4b8: Fast-forward` at 00:15:48+07:00 |

### Results
- **Durable lander:** PASS.
  - The interrupted submission resumed 4.8 s after the new core started, 28.8 s after the restart request.
  - It reused the memoized results of the three checks that had passed, and reran only the interrupted one (EVALUATION.md: "recover; inspect effects").
- **Lost effects:** none.
  - Local `main` stayed at `0ba0b14` until the successful landing; the failed attempt made no partial fast-forward.
  - The marker commit landed intact.
  - `origin/main` was unchanged (`b87f8df`), as expected without push.
- **Duplicate effects:** none.
  - Reflog: exactly one fast-forward per landed tip (`0ba0b14`, `64ac4b8`).
  - Lander log: one `landed` per landed submission, one `failed` for the interrupted one.
  - Events: one `workspaces.landed` per landing (#9/15641, #9/15835).
  - Reports: one lander report per submission in #15503 and in #52.
  - GitHub: no PR or push was produced; 35 PRs, none with a duplicated head branch.
- **Recovery time:** 100.9 s from the restart request (17:14:08) to the landing (17:15:48.9). This includes 43 s for the coordinator to find and kill the orphan.
  - Without the orphan, the resumed E2E check (about 10 s) would have finished at about 17:14:50, roughly 42 s after the request. This is an estimate, not a measurement.
- **Defect found (medium, Ultimate):** a host restart does not stop the child processes of an in-flight check.
  - The orphaned Vite server held the lander's fixed port, so the resumed check failed twice and the landing was refused.
  - It failed closed: no data loss and no bad merge. But it needed one manual action (kill and resubmit).
  - This is the second time this class has appeared: EXP-02 left an orphaned Vite server after a restart too (`experiments/EXP-02/RUN-20261102-01.md`), where the worker cleaned it up itself. 2 of 2 restarts with an E2E run in flight have left an orphan.
  - The lander's immediate rerun ("check failed twice") cannot help with this cause, because the port is still held.
- **Side observation:**
  - The coordinator's first model call after each swap failed with the relay `AggregateError`: #15503/15660, 4 s after generation 3 started, and #15503/15774, 9 s after generation 4 started.
  - Both recovered on the next input (part B). n = 2, so this is not a pattern claim.

### Limits
- n = 2 restarts, and only one hit the window.
- It was a safe restart through the supervisor, not a crash (`kill -9`).
- The phase hit was a check. The fast-forward itself takes about 60 ms and was not targeted.
- The marker was docs-only, so the product could not be harmed by design.

## B. Provider failures as a natural fault data set (observational, not controlled)

**Method (M, codemode, cutoff 2026-11-02 17:16Z).**
- **Count:** `ultimate.search('"stopReason":"error"')` over `pi.assistant` entries, deduplicated by entry id.
- **Recovery:** for each failed call, the conversation's entries after it give the input that preceded the next successful call (classified below), and the time to that call.
- **Duplicate check:**
  - `gh pr list --state all` (35 PRs, no head branch with more than one PR);
  - `git log origin/main` subjects (the only repeated subject is three distinct-file commits by the PO on 2026-11-01, not a repeat);
  - the lander log (one `landed` per landed submission).

Nothing was provoked. These are the real failures of P0–P4, so they are uncontrolled and clustered in time.

### Data set
- **36 failed model calls:**
  - 28 relay `AggregateError` on claude-code (root-caused in `FAILURES.md`);
  - 5 × 429 on claude-code;
  - 3 on other providers (`WebSocket error`, `Connection error`, `408`).
- **29 incidents**: consecutive failed calls in one conversation, up to its next successful call, count as one. The shared 429 window F7+F12 counts as 2 incidents but as 1 window.
- **Four failed calls missing from the F-ledger:** #12079/13550, #52/15291, #15503/15660 and #15503/15774. They are added to `FAILURES.md` as F25–F28.

### Per-incident data (M)

The data come from one codemode pass over the `pi.assistant` entries of each conversation that has a failure.
- An incident runs from its first failed call to the conversation's next successful call.
- "Recovery path" is the deliberate input that preceded that call:
  - a `board.message` from #52 that resumes the conversation;
  - the watchdog's `pi.user` "Your previous run stopped…";
  - a `pause.note`, or the human's input after a 429;
  - an input that arrived anyway;
  - nothing.
- Times are UTC on 2026-11-01/02, and "Lost" is the gap in minutes.

| Conv. | Failed call entries | First failure | Error | Next success (entry, time) | Recovery path | Lost (min) |
|---|---|---|---|---|---|---|
| #1106 | 1267 | 11-01 13:00:56 | WebSocket error | 1268, 13:02:58 | automatic | 2.0 |
| #2462 | 2798 | 11-01 14:15:27 | Connection error | 2799, 14:16:02 | automatic | 0.6 |
| #2901 | 3066 | 11-01 14:23:52 | 408 timeout | 3067, 14:25:23 | automatic | 1.5 |
| #1510 | 4577, 4583 | 11-01 15:28:10 | relay AggregateError | 4610, 15:29:30 | #52 resume (watchdog retry failed) | 1.3 |
| #1510 | 4734, 4739, 4760 | 11-01 15:34:28 | relay AggregateError | 4767, 15:36:53 | #52 resume (watchdog retry failed) | 2.4 |
| #1510 | 5056 | 11-01 16:03:38 | 429 | 5065, 00:10:33 | human (429) | 486.9 |
| #5453 | 5705 | 11-02 00:33:07 | relay AggregateError | 5710, 00:34:09 | watchdog retry | 1.0 |
| #1510 | 5891 | 11-02 00:39:04 | relay AggregateError | 5896, 00:40:06 | watchdog retry | 1.0 |
| #6558 | 6629 | 11-02 04:03:04 | relay AggregateError | 6687, 04:03:28 | #52 resume (first call) | 0.4 |
| #6558 | 7000 | 11-02 04:10:24 | 429 | 7011, 06:41:20 | human (429) | 150.9 |
| #6576 | 7003 | 11-02 04:10:25 | 429 | 7006, 06:41:20 | human (429, same window) | 150.9 |
| #52 | 7233 | 11-02 06:44:23 | relay AggregateError | 7301, 06:44:55 | ordinary input (child's message) | 0.5 |
| #9990 | 10512 | 11-02 09:28:09 | relay AggregateError | 10570, 09:29:10 | watchdog retry | 1.0 |
| #11372 | 11407 | 11-02 10:10:20 | relay AggregateError | 11432, 10:10:47 | #52 resume (first call) | 0.5 |
| #52 | 11925 | 11-02 10:23:34 | 429 | 11930, 11:58:57 | human (429) | 95.4 |
| #12097 | 12150 | 11-02 12:59:31 | relay AggregateError | 12194, 13:00:07 | #52 resume (first call) | 0.6 |
| #12079 | 12151 | 11-02 12:59:31 | relay AggregateError | 12199, 13:00:07 | #52 resume (first call) | 0.6 |
| #12469 | 12542 | 11-02 13:02:43 | relay AggregateError | 12607, 13:03:07 | #52 resume (first call) | 0.4 |
| #52 | 12748 | 11-02 13:04:09 | relay AggregateError | 12832, 13:05:11 | watchdog retry | 1.0 |
| #13171 | 13206 | 11-02 13:09:52 | relay AggregateError | 13233, 13:10:26 | #52 resume (first call) | 0.6 |
| #12079 | 13341, 13351 | 11-02 13:11:58 | relay AggregateError | 13377, 13:13:36 | #52 resume (watchdog retry failed) | 1.6 |
| #52 | 13370, 13452 | 11-02 13:13:36 | relay AggregateError | 13658, 13:17:46 | watchdog retry (its retry failed once; children's inputs followed) | 4.2 |
| #12079 | 13550 | 11-02 13:16:01 | relay AggregateError | 13586, 13:17:02 | watchdog retry | 1.0 |
| #13171 | 13891 | 11-02 13:23:26 | relay AggregateError | 13908, 13:24:27 | watchdog retry | 1.0 |
| #13171 | 15114 | 11-02 13:51:30 | relay AggregateError | 15120, 13:52:31 | watchdog retry | 1.0 |
| #13171 | 15257, 15261, 15269 | 11-02 13:58:01 | 429, then 2 relay errors after Play | 15293, 16:57:20 | human (429) | 179.3 |
| #52 | 15291 | 11-02 16:57:20 | relay AggregateError | 15333, 16:58:23 | watchdog retry | 1.0 |
| #15503 | 15660 | 11-02 17:08:53 | relay AggregateError | 15676, 17:09:47 | ordinary input (#52's timing reply) | 0.9 |
| #15503 | 15774 | 11-02 17:14:41 | relay AggregateError | 15790, 17:15:02 | ordinary input (#52's timing reply) | 0.4 |

After the cutoff, one more incident occurred: #15503/16176 and 16182, 17:31:36. It was a relay `AggregateError` during a `subagent` step. The watchdog retry failed, #52 resumed the conversation, and the next success was 16203 at 17:33:11 (1.6 min). It is F29 in `FAILURES.md` and is not included in the totals below.

### Recovery (aggregated from the table above)
| Recovery path | Incidents | Who acted | Wall time lost (sum; median) |
|---|---|---|---|
| Automatic, with no input at all (provider-level retry; non-claude-code providers) | 3 | nobody | 4.1 min; 1.5 min |
| The watchdog's one retry after 60 s, followed in 2 cases by an ordinary input (#52/12748, #52/13370) | 9 | nobody | 12.4 min; 1.0 min |
| An ordinary input that arrived anyway restarted the run (a child's message to #52; #52's restart-timing replies to #15503) | 3 | nobody deliberately | 1.8 min; 0.5 min |
| Resume message from @ultimate #52: a branch's first call (the watchdog skips it) or a failed watchdog retry | 9 | an agent (#52), not the human | 8.4 min; 0.6 min |
| claude-code 429: the host paused itself; the human pressed Play or sent a resume | 5 incidents in 4 windows (F4, F7+F12, F16, F24) | **the human** | **912.5 min (15.2 h)**: 486.9, 150.9, 95.4 and 179.3 min |

- **Recovery rate:** 29 of 29 incidents recovered (100%). None was abandoned.
- **Deliberate resume needed:** 14 of 29, in two groups:
  - 9 were resumed by the @ultimate agent, with the PO not involved: 6 first calls and 3 failed watchdog retries;
  - 5, in 4 windows, needed the human: every 429. Auto-Play (`pause` README) was off, as it is by default.
  - The other 15 needed no deliberate action.
- **Watchdog retry:** it ran in 14 incidents and its retry failed again, in the same burst, in 5: #1510 twice, #12079, #52/13452, and #13171 right after F24's Play.
- **First calls:** all 6 failures on a branch's first call needed #52, because the watchdog skips reply-expecting inputs (`extensions/watchdog/README.md:3`). These are #6558, #11372, #12097, #12079, #12469 and #13171.
- **Wall time lost:**
  - non-429 incidents: 26.7 min in total across 24 incidents (median 0.9 min);
  - 429 pauses: 15.2 h of waiting for a human. These dominate.
- **Duplicate effects:** none found.
  - Each resumed run checked state first (the watchdog's prompt says "check what you already did and do not redo it").
  - No PR, commit, push or landing was repeated.
  - Two resumes (F2, F3) needed several attempts, and none of them repeated a step.
- **Cost:** failed calls record 0 tokens. The one known cache-cold resume cost $3.15, a list-price proxy (F4, `experiments/P3/TOKEN_ANALYSIS.md` §7).
- **Ledger correction:** the `FAILURES.md` row for F22 says the automatic retry did not recover. The entries show the watchdog retry (#13171/13901) followed by a successful call (13908) one minute later. That suggests the retry did succeed. The row is left as written; this file uses the entry data.

### Limits
- Observational: timing, load and the mix of conversations were not controlled. Bursts of new branches correlate with the relay failures.
- The "wall time lost" is the idle gap. It does not include re-reading context after a resume.
- The 429 windows were account quota waits. Their length reflects the subscription, not Ultimate.
- Searches cover stored conversations only; the trace keeps 1000 rows, so it was not used.

## Verdict for the scorecard
- **Restart during integration:** recovered with no lost and no duplicate effects. Resume of the in-flight landing: **PASS**.
- **End-to-end landing without intervention:** **FAIL**, because of the orphaned check process (medium; Ultimate's restart does not clean up children of running checks).
- **Provider failures:** 100% recovered, none duplicated. 15 of 29 recovered with no deliberate action; 9 needed an agent's resume and 5 (4 windows) the human (429).

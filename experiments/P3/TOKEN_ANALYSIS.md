# P3-A: Coordinator #1510 token analysis (issue #30)

- Subject: coordinator conversation #1510 (claude-code/claude-opus-5-5, medium), which ran P1 and P2. Compared with root #52 and the P2 children in `experiments/P2/LOG.md`.
- Read on 2026-11-02 ~04:05–04:30 UTC by conversation #6558. #1510 was idle and had no calls after 00:58:42 UTC.
- Cost is a **list-price proxy** (subscription providers), not an invoice.

## Method and sources

| Source | What it gives | Limit |
|---|---|---|
| `ultimate.entries(1510)`, paged with `before` | Per call: `usage.input/output/cacheRead/cacheWrite/cost`, `stopReason`, `errorMessage`, timestamps, tool calls. Also every input (`subagents.report`, `board.message`, `pi.user`, `lineage.note`, `workspaces.lander-report`) and tool result | Durable. 291 assistant entries; 8 inherited (forked) entries skipped |
| `ultimate.doc('pi.usage', 1510)` | Totals per model | Reconciles exactly with the sum of the entries (opus: 87,553,326 tokens, $33.83) |
| `ultimate.trace({conversation: 1510})` | Recorded calls | **Truncated:** 1000 rows, oldest row 2026-11-02 00:48 UTC. Covers only the last 19 opus calls, so it is not used for totals |
| `ultimate.search('Incomplete Claude Code')`, entries of #52 | Error entries, `watchdog.failure`, `pause.limit` | See `FAILURES.md` |

Labels:

- **M (measured):** a sum or count read directly from stored fields.
- **D (derived):** computed from measured values with a stated rule or assumption.

Classification rules (D):

- **Phase:** by call timestamp. P1 is before 2026-11-01 15:00 UTC; P2 is from then on. This differs from the P2 log's subtraction, which used a P1 metrics read at 14:47 and therefore put the 14:47–15:00 lander-proof calls into P2.
- **Issue segment:** P2 calls between the landing reports (15:37:24, 00:21:13, 00:42:09 UTC).
- **Trigger:** the input that started the run a call belongs to.
- **Call class:** the tool calls in that response, taking the first match in this order:
  - `coord`: subagent, message, plan, workspace;
  - `github`: bash with `gh`;
  - `edit`: edit, write;
  - `verify`: bash running tests, typecheck or Playwright, plus screenshot and browser;
  - `inspect`: read, git, other bash, codemode;
  - `text-only`: no tool call.
- **Context of a call:** input + cacheRead + cacheWrite.

## 1. Token shares (tokens and cost M; shares D)

Coordinator #1510, all 291 opus calls:

| Field | Tokens (M) | Share of tokens (D) | Cost (D, fitted prices) | Share of cost (D) |
|---|---|---|---|---|
| cacheRead (context re-reads) | 85,730,615 | **97.9 %** | $17.15 | 51 % |
| cacheWrite | 1,646,435 | 1.9 % | $13.17 | **39 %** |
| output | 175,680 | 0.2 % | $3.51 | 10 % |
| fresh input | 596 | 0.0007 % | ~$0 | 0 % |
| **Total** | **87,553,326** | | **$33.83** | |

- **Cache hit ratio (D):** cacheRead / (cacheRead + cacheWrite + input) = **98.1 %**. Caching works. The volume comes from re-reading a large context on every call.
- **Unit prices (D):** a least-squares fit over the 284 non-zero calls gives $0.20/M cacheRead, $8.00/M cacheWrite and $20.00/M output. The cost shares above use these prices.
- **Sonnet (M):** a separate 490,836 tokens ($1.44) of summary and assessment side calls by extensions. These are not coordinator turns.
- **Root #52 (M):** opus 9.54M tokens ($7.05) over the whole project so far, and 0 failed calls.

## 2. Calls and tokens by phase (M; phase split D)

| Phase | Calls | cacheRead | cacheWrite | Output | Total tokens | Cost |
|---|---|---|---|---|---|---|
| P1 (13:47–15:00) | 134 | 22.90M | 0.50M | 93k | 23.49M | $10.48 |
| P2 (15:00–00:59) | 157 | 62.83M | 1.14M | 83k | **64.06M** | **$23.35** |

- P2 had only 17 % more calls than P1, but 2.7× the tokens.
- **P2 coordinator share (D):** 64.06M opus + 0.27M sonnet, against 17.1M for the P2 children (P2 log). That is **79 % of P2 tokens**, which matches the PO's "~80 %".

## 3. Context size over time (per-call context M; min/median/p90/max D)

Context per call grows almost monotonically. There is no compaction, so it never shrinks.

| Window (UTC) | Calls | Min | Median | p90 | Max |
|---|---|---|---|---|---|
| P1 13:47–15:00 | 134 | 26k | 170k | 259k | 270k |
| P2 #18/#19 15:00–16:04 | 67 | 271k | 336k | 371k | 391k |
| P2 #20/#21 00:10–00:30 | 40 | 393k | 419k | 461k | 477k |
| P2 #21/#22 00:30–00:59 | 50 | 479k | 533k | 590k | **597k** |

Every 15th call, as a series (context size in tokens):

- 11-01: 13:47 26k → 13:53 90k → 13:57 122k → 14:05 157k → 14:20 178k → 14:33 206k → 14:46 247k → 15:01 272k → 15:19 319k → 15:29 349k → 15:37 373k
- 11-02: 00:12 415k → 00:21 477k → 00:37 507k → 00:42 550k → 00:58 597k

At the end, each coordinator call re-read ~0.6M tokens. That is about $0.12 of cacheRead per call before any work is done.

## 4. What grows the context (D: difference in context between consecutive calls, by what came in between)

| Came in between | Calls | Context added | Share |
|---|---|---|---|
| The coordinator's own tool results (bash, read, browser, …) | 233 | 448k | **78 %** |
| Subagent reports (30 reports, 97.9k chars) | 30 | 55k | 10 % |
| Other inputs (PO/#52 messages, lander reports, notes) | 20 | 69k | 12 % |

- The growth figures include the assistant's own output, which is ~176k tokens over all calls.
- **Images (M):** 6 image tool results: the screenshot, browser steps and `read` of PNG files.
- **Notes (M):** 6 `lineage.note` inputs, 6.4k chars in total, started **0** runs. Notes join the next input instead of waking the coordinator.

## 5. Coordination vs own work (P2 only)

By the run's trigger (M counts; trigger attribution D):

| Trigger | Runs | Calls | Cost | Calls per run |
|---|---|---|---|---|
| Subagent report (wake-up) | 15 | 127 | **$15.96 (68 %)** | 8.5 |
| `pi.user` (PO and resume inputs) | 5 | 14 | $4.68 (incl. the $3.15 resume, §7) | 2.8 |
| Lander report | 3 | 9 | $1.71 | 3 |
| `board.message` from #52 | 3 | 7 | $1.00 | 2.3 |
| `lineage.note` | 0 | 0 | $0 | — |

The first call of each P2 run (26 calls, $6.44 including the resume) is the fixed cost of being woken: context re-read and decision.

By what the call did (D):

| Class | Calls | Cost |
|---|---|---|
| inspect (read, git, codemode, other bash) | 46 | $5.29 |
| github (`gh` PR, merge, issue) | 9 | $4.35 (incl. the $3.15 resume call) |
| edit / write (coordinator fixes) | 29 | $3.99 |
| coord (subagent, plan, workspace, message) | 27 | $3.97 |
| text-only (answers, reports) | 22 | $3.06 |
| verify (tests, screenshot, browser) | 24 | $2.70 |

- **Coordination proper (D):** coord + github + text-only, without the resume call = 57 calls, **$8.2, 35 % of the P2 coordinator cost**.
- **Own engineering (D):** inspect + edit + verify = 99 calls, **$12.0, 51 %**.
- **Cache-cold resume (D):** 1 call, $3.15, 13.5 %.
- The coordinator fixed all 15 P2 defects itself (P2 log). Wakes after reviewer reports therefore turned into edit and test loops at a 300–600k context.

## 6. Retries after provider errors (M)

- **Failed calls:** 7 in #1510:
  - 6 × "Incomplete Claude Code upstream response (status unknown … relay failure)";
  - 1 × status 429 rate limit.
- All 7 recorded **0 tokens and $0**.
- **Resume calls:** in #1510, the first successful calls after the short outages (F2, F3, F6) re-read a warm cache: cacheWrite 2.3k–3.3k, $0.09–0.14 each.
- **Cost of retries:** negligible, except the resume after the 8 h gap (§7).
- Details per incident are in `FAILURES.md`.

## 7. The 8 h 07 min gap and the cache (M)

The P2 log's "~8.5 h" was an approximation. Measured from call to call (16:03:27 → 00:10:33 UTC), the gap is 8 h 07 min.

- **Timeline:**
  - last successful call 16:03:27 UTC;
  - 429 stop 16:03:38;
  - resume input 00:10:32;
  - first call 00:10:33 (entry 5065).
- **Cache spike:**
  - That call had **cacheRead 0 and cacheWrite 392,952: $3.15** for one call. That is 13.5 % of the P2 coordinator cost.
  - A normal call at that size cost ~$0.09–0.20.
  - The cache had expired, so the whole context was written again.
- **No other cache-cold calls (M):** shorter idle gaps of 10–26 min showed cacheWrite of 3k–18k, not a full rewrite.

## 8. Compaction (M)

- **0 compaction events** in #1510. The only `pi.reset` is the branch start (entry 1520).
- The 29 `conversations.summarized` entries are sidebar summaries made by the sonnet side calls. They do not shrink the context.
- **Effect:** context grew from 26k to 597k without a ceiling.

## 9. Why the coordinator used ~80 %

1. **One long-lived coordinator across two phases.** The cost per call grew with the history: the P2 median context was 336–533k.
2. **No compaction, so no reset.**
3. **The coordinator did its own repair loops:** 78 % of context growth came from its own tool results.
4. **One cache-cold resume ($3.15).**

Subagent reports and notes were small: 10 % and <1 % of context growth.

**Counterfactual (D, not measured):** what if each P2 issue had started a fresh coordinator at ~50k context, with the same calls and the same growth per issue?

- P2 cacheRead would be 13.97M instead of 62.83M: **−78 %**.
- The rule: per segment, the sum over calls of (context − segment start + 50k).

## 10. Overhead-reduction proposals (ranked)

None of these changes Ultimate config, Pi settings or providers. Each is a coordinator working practice. "Baseline" is P2 per issue (M):

| Issue | Coordinator calls | cacheRead |
|---|---|---|
| #20 | 42 | 16.9M |
| #21 | 31 | 15.1M |
| #22 | 21 | 11.9M |

1. **A fresh coordinator per issue.**
   - **What:** @ultimate starts a new `coordinator` branch per issue, briefed from the issue, the memory and `PROJECT_STATUS`. The old one concludes.
   - **Expected:** −70–80 % coordinator cacheRead per issue (D, §9). Its first call starts at ~30–60k context instead of 300–600k.
   - **Risk:** lost tacit context. Mitigation: the brief names ADRs, memory slugs and open decisions.
   - **EXP-03 test:** coordinator tokens per issue ≤ 4M and median context ≤ 150k (M from entries), with no loss of quality: same review rounds or fewer, 0 defects on main, AC met.
2. **Delegate the fix loop to the builder; the coordinator judges diffs and reports.**
   - **What:** reviewer findings go back to the worker or designer that built the issue, with the findings verbatim. The coordinator reads the diff and the child's recorded test exit codes, and does not re-run the suite (the lander does).
   - **Expected:** removes most of the 99 P2 inspect, edit and verify calls ($12.0). Some of that cost moves to cheaper sonnet children.
   - **EXP-03 test:**
     - coordinator `edit`/`write` calls = 0;
     - coordinator `bash:test` calls ≤ 2 per issue;
     - coordinator calls per issue ≤ 15;
     - total issue tokens (coordinator + children) lower than the baseline;
     - reviewer still finds and the builder fixes every P1.
3. **Restart, don't resume, after a gap longer than the cache lifetime.**
   - **What:** after a quota stop or idle gap of more than ~1 h, resume with a fresh coordinator (as in 1), not the old one. The old one's first call rewrites its whole context.
   - **Expected:** the $3.15 resume becomes ~$0.4 (50k × $8/M, D).
   - **EXP-03 test:** cacheWrite of the first call after any gap > 1 h ≤ 100k.
4. **Compact between issues, if 1 is not adopted.**
   - **What:** the coordinator's context is compacted after each landing. There were 0 compactions in #1510.
   - **Expected:** similar to 1, but with a summary in place of a brief.
   - **Note:** this needs a compaction trigger. Checking that one exists without config changes is part of the test; if none does, mark it NOT AVAILABLE.
   - **EXP-03 test:** context after the landing ≤ 100k (M).
5. **A tighter subagent report format.**
   - **What:** a fixed format of verdict, changed files, exit codes and open risks, ≤ 1.5k chars.
   - **Expected:** small. Reports were 10 % of context growth (median ~3k chars, max 7.6k).
   - **EXP-03 test:** report chars ≤ 1.5k each, with no follow-up question needed to get missing evidence.

**Evaluated and not proposed:** fewer status notes. Notes started 0 runs and were 6.4k chars over P1+P2, so the effect is negligible.

## 11. This analysis (#6558)

`pi.usage` of #6558, read at 06:45 UTC after the drafts were written and before review (M):

- opus 1.26M tokens, $2.22: cacheRead 1.07M, cacheWrite 0.16M, output 38k;
- sonnet 7k, $0.02.

The final figure is in the PR's closing comment on #30. Failures of this analysis: F1 and F7 in `FAILURES.md`.

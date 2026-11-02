# P4 infrastructure failures

This log continues `experiments/P3/FAILURES.md` and `experiments/P3/GATE_SUMMARY.md` (F1–F16). These are infrastructure errors, not agent errors, and are left out of each issue's metrics.

| ID | Conversation(s) | Entry, time (UTC) | Error | Recovery | Effect |
|---|---|---|---|---|---|
| F17 | #12097 (CI, #45) and #12079 (EXP-09, #46), one shared outage | #12097 12150; #12079 12151 (2026-11-02) | Claude Code upstream error on each branch's first model call | manual resume message from #52 | none: no work had started |
| F18 | #12469 (EXP-09 arm A, #46) | 12542 (2026-11-02) | Claude Code upstream error on the branch's first model call | manual resume by #52 | none: no answer had been given |
| F19 | #12079 (EXP-09 closeout, #46) | 13341 and 13351 (2026-11-02, about 13:12 UTC) | Claude Code upstream error after a bash step (closeout PR #53 created); the automatic retry failed too | manual resume by #52; state checked first (PR #53 open, CI green) | none: no step repeated |
| F20 | #13171 (EXP-07/08, #47/#48) | 13206 (2026-11-02 13:09:52) | Claude Code upstream error on the branch's first model call. #52's resume note called it F19, but that ID was already taken, so it is F20 | manual resume by #52 | none: no work had started |
| F21 | #52 (root) | 12748 (13:04:09), 13370 (13:13:36), 13452 (13:14:38) | Claude Code upstream error, 3 calls in the same burst | automatic retry / resume | none |
| F22 | #13171 (EXP-07/08, #47/#48) | 13891 (2026-11-02 about 13:24) | Claude Code upstream error (relay `AggregateError`) on the coordinator, after a grading step; automatic retry did not recover | manual resume by #52; state checked first (subagents listed, worktrees inspected) | none: no step repeated; it fell inside the task-1 Ultimate arm's window while QA ran, noted in EXP-08 RUN-20261102-01 |
| F23 | #13171 (EXP-07/08, #47/#48) | 2026-11-02 about 13:50, while reviewer #15049's PR #55 answer arrived | Claude Code upstream error (relay `AggregateError`) on the coordinator | automatic resume; state checked first (`git status`, PR #55 state and CI) | none: no step repeated; after all arms finished, so no arm metric affected |
| F24 | #13171 (EXP-07/08 closeout) | 2026-11-02 after PR #55 merged (`ef2ce9d`), during a `read` of the issue-closeout skill; then a 2 h 57 min claude-code 429 pause | Claude Code upstream error (relay `AggregateError`) after one automatic retry, followed by a rate-limit pause | manual resume by #52; state checked first (PR #55 MERGED, #47/#48 OPEN) | none: no step repeated; after all measurements |

| F25 | #12079 (EXP-09 closeout, #46) | 13550 (2026-11-02 13:16:01) | Claude Code upstream error (relay `AggregateError`), missed by the first count | watchdog retry (13583) | none |
| F26 | #52 (root) | 15291 (2026-11-02 16:57:20) | Claude Code upstream error (relay `AggregateError`), during the F24 recovery burst | watchdog retry (15318) | none |
| F27 | #15503 (#49) | 15660 (2026-11-02 17:08:53), 4 s after the generation-3 host swap | Claude Code upstream error (relay `AggregateError`) | next input (#52's timing message) | none |
| F28 | #15503 (#49) | 15774 (2026-11-02 17:14:41), 9 s after the generation-4 host swap | Claude Code upstream error (relay `AggregateError`) | next input (#52's timing message) | none |

F25–F28 were added by #49 (`experiments/P4/FAULT_INJECTION.md` part B), which re-counted every `stopReason: error` entry up to 2026-11-02 17:16Z: 36 failed calls in 29 incidents.

All F1–F21 rows with the text `relay failure AggregateError:` share the root cause below.

## Root cause: "Incomplete Claude Code upstream response (status unknown, capture incomplete, relay failure AggregateError: )"

Investigated 2026-11-02 by side chat #13404 of @ultimate. Status: **ROOT-CAUSED** (infrastructure: a network-level connect timeout on this Mac, not a provider outage and not an agent error).

**Where the message comes from (M).** It is built in the `@earendil-works/pi-claude-code` dependency of Ultimate (`src/claude-cli.ts:1012`). For each turn, a local relay (`src/turn-relay.ts`) forwards the Claude Code CLI's request to `https://api.anthropic.com`. If the upstream request fails before a response arrives, the status is "unknown", the capture is "incomplete", and `relay failure` holds Node's error (`turn-relay.ts:326`). Here that error is `AggregateError` with an empty message.

**Mechanism (M).**
- `api.anthropic.com` resolves to IPv4 `160.79.104.10` and IPv6 `2607:6bc0::10`.
- This Mac has no IPv6 route: `curl -6` fails with exit 7 every time, and `route -n get -inet6 default` returns "not in table". IPv4 works (`curl -4` connects in about 35–350 ms).
- Node 26.7 tries both families in parallel (`autoSelectFamily` true), with a 500 ms timeout per attempt (`getDefaultAutoSelectFamilyAttemptTimeout()` = 500). When the IPv4 connect takes more than 500 ms and IPv6 fails immediately, Node raises `AggregateError` with an empty message.

**Reproduction (M)** (`node` 26.7.0, a fresh `https.request` to `api.anthropic.com` each time, `agent: false`):

| Setting | Result |
|---|---|
| default attempt timeout (500 ms), 15 fresh connects | 14 ok, **1 failed**: `AggregateError: "" [ETIMEDOUT 160.79.104.10, EHOSTUNREACH 2607:6bc0::10]` after 526 ms |
| `--network-family-autoselection-attempt-timeout=100` | fails on demand, same error |
| `--network-family-autoselection-attempt-timeout=2000`, 3 runs | 3/3 ok |
| `--no-network-family-autoselection`, 3 runs | 3/3 ok |
| 20 calls reusing one connection in one process | 20/20 ok |

**Why first calls are hit (D).** Each Claude Code turn starts a new CLI process and a new relay, so every call opens a fresh connection with no reuse. New branches' first calls also tend to land in bursts (12:59:31, two branches in the same second; 13:02–13:14, eight occurrences). Short latency spikes in those bursts push IPv4 connects past 500 ms. The openai-codex and github-copilot providers use other HTTP stacks with reused connections, which fits their near-absence from the ledger.

**Scale (M, `ultimate.search` on 2026-11-02 ~13:15 UTC).** 22 assistant entries carry `relay failure AggregateError:`, 6 of them on a conversation's first call. 31 entries carry "Incomplete Claude Code upstream response" in total, including 429s and other statuses. The watchdog treats status unknown as temporary and retries once (`extensions/watchdog/server.ts:136`); after that, a manual resume is needed. No committed work was lost or repeated in any case.

**Remediation options (none applied: outside the POC's approved scope, no global or core changes).**
1. **Recommended, machine-level; approval needed at the P4 gate:** start the Ultimate host with `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000`, so the relay process inherits a 2 s attempt timeout. Validation: rerun the 15-connect probe under the setting, then count new `relay failure AggregateError` entries over the next comparable period against the 22 above. Rollback: remove the variable and restart the host.
2. Make IPv6 work on this network, or disable IPv6 on the interface, so the IPv6 address is not attempted. This is an OS setting.
3. Upstream fix in `pi-claude-code`: set `autoSelectFamilyAttemptTimeout` in the relay's request, or retry once when the connect fails before any byte arrives. This is the right long-term fix, but it changes Ultimate's dependency.

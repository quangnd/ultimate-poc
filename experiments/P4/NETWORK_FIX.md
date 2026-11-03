# P4 follow-up B: network fix for the Claude Code relay `AggregateError`

Status: **APPLIED 2026-11-02 23:42:52Z** (option A, chosen by the PO on the decision card). Outcome: **PASS** by the 24 h re-count (section 7), under the rule set in advance.
Owner: coordinator branch #16450, for PO approval of 2026-11-03 (follow-up B). Root cause: `FAILURES.md`, section "Root cause".
Markers: (M) measured here, (D) derived/inferred.

## 1. How the host gets its environment (M)

| Process | Command | Started by |
|---|---|---|
| supervisor, pid 20784 | `node …/pnpm/global/…/node_modules/ultimate/bin/ultimate.ts` (symlink to `/Users/mun/Projects/ultimate`) | interactive `zsh` in Ghostty, cwd `/Users/mun/Projects/ultimate-poc` |
| host core, pid 72533 | `node /Users/mun/Projects/ultimate/server/main.ts` | supervisor `fork()` (`bin/ultimate.ts:283`) |

- There is no launchd plist for Ultimate (`~/Library/LaunchAgents` has only unrelated agents) and no project or user setting that injects env into the host. `~/.ultimate/settings.json` and `.ultimate/settings.json` have no env keys.
- The core gets `{...process.env}` of the supervisor (`bin/ultimate.ts:285-286`). `fork()` also passes the supervisor's `process.execArgv` by default. Shown with `experiments/P4/fork-inherit.mjs`: `node --network-family-autoselection-attempt-timeout=2000 experiments/P4/fork-inherit.mjs` prints `child execArgv=[--network-family-autoselection-attempt-timeout=2000] attemptTimeout=2000 NODE_OPTIONS=<unset>`. Without the flag it prints `execArgv=[] attemptTimeout=500`.
- The relay that fails (`TurnRelay`, `pi-claude-code/src/claude-cli.ts:813`, `turn-relay.ts:287`) runs **inside the host core process**. The `claude` CLI (a Mach-O binary, 2.1.292) talks only to that local relay, so the host core is the only process that needs the flag.
- Neither process carries `NODE_OPTIONS` today (`ps eww` grep, values not printed).
- **Consequence (D):** the `restart` tool (core swap) re-forks from the running supervisor, which does not have the flag. Applying it needs a **manual relaunch of the supervisor** in its terminal. That is the only way short of changing Ultimate core (`bin/`) or the user's shell profile, and both are out of scope.

## 2. Before (M)

**Probe** (`experiments/P4/net-probe.mjs`): one fresh HTTPS request to `api.anthropic.com` per attempt, `agent: false`, the same as the relay's per-turn connection. Node v26.7.0 is the host's binary (`/opt/homebrew/Cellar/node/26.7.0`), and the host runs with no extra flags.

| When (UTC) | Setting | Result |
|---|---|---|
| 2026-11-02 18:13 | default (`attemptTimeout=500ms`, `NODE_OPTIONS` unset), 20 fresh connects | **20/20 ok**, 296–403 ms each |
| same | `--network-family-autoselection-attempt-timeout=100`, 3 | 3/3 ok (~310 ms) |
| same | `…=50`, 3 | 3/3 ok |
| same | `…=10`, 3 | **3/3 FAIL**: `AggregateError: "" [ETIMEDOUT 160.79.104.10, EHOSTUNREACH 2607:6bc0::10]` |
| same | `route -n get -inet6 default` / `curl -6 https://api.anthropic.com` | "not in table" / exit 7: still no IPv6 route |

Reading (D): the network was calm in this window (IPv4 connects ~300 ms, below 500 ms), so the default did not fail here. The 2026-11-02 run in `FAILURES.md` caught 1/15. The mechanism is unchanged: whenever the IPv4 attempt exceeds the attempt timeout while IPv6 fails at once, the identical empty `AggregateError` appears. The fix widens the margin from 500 ms to 2000 ms. A single calm-window probe can neither prove nor disprove it, which is why the 24 h re-count (section 6) is the effectiveness measure.

**Baseline relay error rate**, window 2026-11-01 18:15Z to 2026-11-02 18:15Z. Read-only sqlite query on the project state (command in section 6):

| Measure | Value |
|---|---|
| Claude Code assistant calls (`provider = claude-code`) | 1036 |
| of which `stopReason=error` with `relay failure AggregateError` | **25** (2.4 % of calls, 1.04/h) |
| busiest hour | 2026-11-02 13Z: 10 of 274 calls |

Measurement cutoff: first query at 2026-11-02 ~18:14:55Z returned 1035 calls. This branch made one more Claude Code call at 18:14:57Z, still inside the window, so a re-run after 18:15Z returns 1036 / 25 (found by the reviewer). 1036 is the final figure; the share is unchanged at 2.4 %.

Hours with relay errors (UTC, 2026-11-02; calls / errors): 00Z 148/2, 04Z 67/1, 06Z 61/1, 09Z 89/1, 10Z 58/1, 12Z 29/2, 13Z 274/10, 16Z 15/3, 17Z 138/4. Every other hour had 0 errors. Reproduce: in the section 6 command, replace the final `select … from m where …;` with
`select strftime('%Y-%m-%dT%HZ', ts/1000, 'unixepoch') hour, count(*) calls, sum(em like '%relay failure AggregateError%') relay_err from m where <same window> group by hour having relay_err > 0;`

The cross-check (codemode: `ultimate.search('relay failure AggregateError', {limit: 1000})`, keeping `pi.assistant` entries whose `model[]` message has `stopReason: 'error'` and that text, de-duplicated by conversation and timestamp) gives the same 25 distinct (conversation, timestamp) errors in the window, and 30 since the first on 2026-11-01 15:28Z. Confound (D): the rate depends on how many fresh Claude Code connections are opened, so the re-count compares the **share of calls**, not the raw count.

## 3. Apply

The change is a **launch command**, not a file edit. No Ultimate core code, global Pi setting or `secrets.json` changes. In the Ghostty tab running the supervisor (cwd `/Users/mun/Projects/ultimate-poc`), stop it with Ctrl+C and relaunch it:

```sh
# Recommended (A): flag on the node command line. fork() passes execArgv to the core, spawn() does not pass it to tools.
cd /Users/mun/Projects/ultimate-poc && node --network-family-autoselection-attempt-timeout=2000 /Users/mun/Projects/ultimate/bin/ultimate.ts

# As briefed (B): environment variable. Every node process the host spawns also inherits it
# (bash tool, npm test, Vite, Playwright, tsc, lander checks).
cd /Users/mun/Projects/ultimate-poc && NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000 ultimate
```

Both give the host core a 2000 ms attempt timeout. A is narrower: only the supervisor and the core get it, which matches "host process only". B also changes every Node child of the host. The `restart` tool alone does **not** apply either, because it re-forks from the unchanged supervisor.

**Decision (PO, 2026-11-03): A.** It is the approved setting on fewer processes, which narrows the approved change. Quang relaunched the supervisor with command A at 2026-11-02 23:42:52Z (core generation 1).

## 4. After (M, 2026-11-02 23:43–23:45Z)

**Flag is live, scoped to the host:**

| Process | `ps -o command=` | `NODE_OPTIONS` in `ps eww` |
|---|---|---|
| supervisor, pid 63720 | `node --network-family-autoselection-attempt-timeout=2000 /Users/mun/Projects/ultimate/bin/ultimate.ts` | absent |
| host core, pid 63722 (`ultimate.system().process.pid`) | `/opt/homebrew/Cellar/node/26.7.0/bin/node --network-family-autoselection-attempt-timeout=2000 /Users/mun/Projects/ultimate/server/main.ts` | absent |
| a node spawned by the host's bash tool | `getDefaultAutoSelectFamilyAttemptTimeout()` = **500** | unset |

So `fork()` carried the flag into the core, and the host's `spawn()`ed children (tools, npm, Vite, Playwright, lander checks) keep Node's default. This is the narrowing the decision intended.

**Probe under the flag** (`node --network-family-autoselection-attempt-timeout=2000 experiments/P4/net-probe.mjs 20`, 23:43:48Z): **20/20 ok**, 282–324 ms, `attemptTimeout=2000ms`. Immediately after, at the default: 20/20 ok. The network was still calm, so this shows the flag does no harm. It does not show a gain; that is section 6.

**Side-effect smoke tests:**

| Check | Result |
|---|---|
| Claude Code turns through the relay in the new core | 6 `claude-code` assistant calls (this conversation, #16450) since 23:42:52Z, **0 errors** (sqlite query of section 6 with the cutoff moved) |
| `gh auth status` / `gh repo view` | logged in as quangnd; `quangnd/ultimate-poc`, exit 0 |
| `git fetch origin` | exit 0; `origin/main` = 8c8cef0 |
| web UI `http://127.0.0.1:4747/` | HTTP 200 |
| `npm run test:e2e` (worktree, own free port pair per `rrl-e2e` skill) | **7 passed (12.0 s), exit 0**. `ECONNREFUSED` proxy lines come from `persist.spec.ts` stopping the API on purpose |

The e2e run covers Vite and Playwright on localhost. They run as spawned children without the flag, so a regression there was never expected under option A.

## 5. Rollback

Stop the supervisor (Ctrl+C) and relaunch it as before, with neither the flag nor the variable:

```sh
cd /Users/mun/Projects/ultimate-poc && ultimate
```

Check: `ps eww -o command= -p <core pid>` shows no `network-family` text, and the probe under the host's flags reports `attemptTimeout=500ms`. Nothing persists: no file was changed.

## 6. Effectiveness over time: pending 24 h re-count (owner: @ultimate)

**When:** on or after **2026-11-03 23:43Z**. The window is 2026-11-02T23:42:52Z (applied) to 2026-11-03T23:42:52Z. It is valid only if the host ran with the flag the whole time: check `ps -o command= -p <core pid>` first, and shorten the window to the flagged period if Ultimate was relaunched without it.

**Command** (read-only, same query as the baseline; change the two timestamps):

```sh
DB=/Users/mun/.ultimate/projects/ultimate-poc-a1e52e44/state.sqlite
sqlite3 -readonly "file:$DB?mode=ro" "
with m as (select distinct e.conversation_id c, json_extract(j.value,'\$.timestamp') ts, json_extract(j.value,'\$.errorMessage') em
 from entries e, json_each(e.record,'\$.model') j
 where e.record like '%\"provider\":\"claude-code\"%' and json_extract(j.value,'\$.role')='assistant' and json_extract(j.value,'\$.provider')='claude-code')
select count(*) calls, sum(em like '%relay failure AggregateError%') relay_err
from m where ts >= strftime('%s','2026-11-02T23:42:52')*1000 and ts < strftime('%s','2026-11-03T23:42:52')*1000;"
```

Baseline query: the same command with `2026-11-01T18:15:00` / `2026-11-02T18:15:00`, giving 1036 calls / 25 errors.

**Judgement rule (set before the data):** compare the error **share of calls** against 2.4 % (25/1036).
- 0 errors over at least 300 calls: **effective**; outcome PASS.
- Fewer than 300 calls: inconclusive; extend the window.
- Any `relay failure AggregateError` under the flag: **not effective**; keep the inner error codes for diagnosis. A timeout above 2 s points at the network, not happy-eyeballs; then consider option 2 or 3 of `FAILURES.md`.

Confound (D): network conditions differ between days. One quiet day lowers errors without any fix, so a busy-hour burst like 13Z on 2026-11-02 is the stronger test.

## 7. Re-count result (M, run by @ultimate #52 at 2026-11-03T23:50Z, automation A3)

- **Flag held the whole window:** supervisor 63720 and core 63722 both run `--network-family-autoselection-attempt-timeout=2000`; the core started 2026-11-02T23:42:47Z (`ps -o lstart=`), before the window opened, and was not relaunched.
- **After (section 6 query, window 2026-11-02T23:42:52Z to 2026-11-03T23:42:52Z):** **448 Claude Code calls, 0 relay `AggregateError`, 0 errors of any kind** (`errorMessage` empty on all 448).
- **Baseline, same query:** 1036 calls, 25 relay errors (2.4%), 29 errors of any kind.
- **Calls per hour (UTC) in the window:** 23h 56, 00h 189, 04h 34, 09h 82, 10h 87. The 00Z hour (189 calls) is a busy hour comparable to the 13Z burst on 2026-11-02.
- **Cross-check:** `ultimate.search('relay failure AggregateError')` finds no new error entry after the relaunch, only quotes of the phrase in docs, tool output and messages.
- **Judgement (rule set before the data):** 0 errors over ≥300 calls means **effective, PASS**.
- **Strength of the evidence:** at the baseline rate of 2.4%, 448 calls would be expected to show about 11 errors; under an independent-calls model, P(0 | 2.4%) ≈ (1 − 0.024)^448 ≈ 2 × 10⁻⁵. Calls are not independent: the baseline errors came in bursts (10 of 25 at 13Z over 274 calls, 3 of 15 at 16Z), and the after window had 5 active hours against 13 in the baseline, so this overstates the strength. The day-to-day network confound (D) also remains. The PASS stands under the rule set in advance; the evidence is strong but not as strong as the binomial figure suggests.
- **Side effects:** none observed in 24 h. EXP-10, EXP-11 and EXP-12 ran under the flag with green checks; EXP-12's hand-started previews used the same flag.
- **Rollback** is unchanged (section 5). The fix lasts only while Ultimate is started with the flag; a plain `ultimate` start removes it.

# P4 follow-up B: network fix for the Claude Code relay `AggregateError`

Status: **IN PROGRESS** (before recorded; apply pending the host relaunch). Outcome stays **PARTIAL** until the 24 h re-count.
Owner: coordinator branch #16450, for PO approval of 2026-11-03 (follow-up B). Root cause: `FAILURES.md`, section "Root cause".
Markers: (M) measured here, (D) derived/inferred.

## 1. How the host gets its environment (M)

| Process | Command | Started by |
|---|---|---|
| supervisor, pid 20784 | `node …/pnpm/global/…/node_modules/ultimate/bin/ultimate.ts` (symlink to `/Users/mun/Projects/ultimate`) | interactive `zsh` in Ghostty, cwd `/Users/mun/Projects/ultimate-poc` |
| host core, pid 72533 | `node /Users/mun/Projects/ultimate/server/main.ts` | supervisor `fork()` (`bin/ultimate.ts:283`) |

- There is no launchd plist for Ultimate (`~/Library/LaunchAgents` has only unrelated agents) and no project or user setting that injects env into the host. `~/.ultimate/settings.json` and `.ultimate/settings.json` have no env keys.
- The core gets `{...process.env}` of the supervisor (`bin/ultimate.ts:285-286`). `fork()` also passes the supervisor's `process.execArgv` by default. Shown with a two-process script: a parent started with `node --network-family-autoselection-attempt-timeout=2000` forks a child that reports `execArgv` with the flag and `getDefaultAutoSelectFamilyAttemptTimeout()=2000`; without the flag the child reports 500.
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
| Claude Code assistant calls (`provider = claude-code`) | 1035 |
| of which `stopReason=error` with `relay failure AggregateError` | **25** (2.4 % of calls, 1.04/h) |
| busiest hour | 2026-11-02 13Z: 10 |

Per hour (UTC, 2026-11-02): 00:2, 04:1, 06:1, 09:1, 10:1, 12:2, 13:10, 16:3, 17:4; other hours 0. The cross-check `ultimate.search('relay failure AggregateError')` gives the same 25 distinct (conversation, timestamp) errors in the window, and 30 since the first on 2026-11-01 15:28Z. Confound (D): the rate depends on how many fresh Claude Code connections are opened, so the re-count compares the **share of calls**, not the raw count.

## 3. Apply (ready, not yet applied)

The change is a **launch command**, not a file edit. No Ultimate core code, global Pi setting or `secrets.json` changes. In the Ghostty tab running the supervisor (cwd `/Users/mun/Projects/ultimate-poc`), stop it with Ctrl+C and relaunch it:

```sh
# Recommended (A): flag on the node command line. fork() passes execArgv to the core, spawn() does not pass it to tools.
cd /Users/mun/Projects/ultimate-poc && node --network-family-autoselection-attempt-timeout=2000 /Users/mun/Projects/ultimate/bin/ultimate.ts

# As briefed (B): environment variable. Every node process the host spawns also inherits it
# (bash tool, npm test, Vite, Playwright, tsc, lander checks).
cd /Users/mun/Projects/ultimate-poc && NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000 ultimate
```

Both give the host core a 2000 ms attempt timeout. A is narrower: only the supervisor and the core get it, which matches "host process only". B also changes every Node child of the host. The `restart` tool alone does **not** apply either, because it re-forks from the unchanged supervisor.

## 4. After

_Pending._

## 5. Rollback

Stop the supervisor (Ctrl+C) and relaunch it as before, with neither the flag nor the variable:

```sh
cd /Users/mun/Projects/ultimate-poc && ultimate
```

Check: `ps eww -o command= -p <core pid>` shows no `network-family` text, and the probe under the host's flags reports `attemptTimeout=500ms`. Nothing persists: no file was changed.

## 6. Effectiveness over time: pending 24 h re-count

_Pending._

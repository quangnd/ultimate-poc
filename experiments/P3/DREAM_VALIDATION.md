# Dream proposal validation

## #2 e2e-port-isolation

Issue [#33](https://github.com/quangnd/ultimate-poc/issues/33), Dream proposal 2. Worker conversation #10224.

### Original failure

- F8 in `experiments/P3/FAILURES.md`: two `npm run test:e2e` runs from two worktrees at once, Playwright `webServer` on
  5273/5274 "already in use" / `EADDRINUSE`. No test executed and nothing was written, but the agents lost minutes.
- What the agents did about it (searched in the stored conversations, no new data):
  - #7486, entry 8358: the instruction of its coordinator (#7424) says to check ports free with `lsof -i :5273 -i :5274` before the run;
    entries 8382, 8386 and 8394 run `lsof -nP -iTCP:5273 -iTCP:5274 -sTCP:LISTEN` before each E2E run;
    its final report (entry 8404): "`lsof -i :5273 -i :5274` showed nothing listening before each run".
  - #7509 wrote a wrapper (`/tmp/qa7509/run.sh`, entry 7866) that waits until `lsof` shows nothing on the ports and no
    `playwright test` runs, and retries on "is already used|EADDRINUSE" (its report, entry 8074: "Fixed ports are shared by every worktree ...
    I saw 'already used', `EADDRINUSE` and 'webServer not able to start', which look like failures but are not. Run e2e serially").
- The cause in the code, at `fc404d5`: `playwright.config.ts:4` `export const WEB_PORT = 5273` and `:6` `export const API_PORT = 5274`.

### Root cause

The two ports were constants of the config, so every worktree (and the lander) used the same pair. Playwright's
`webServer` has `reuseExistingServer: false` and the API of each test listens on its fixed port, so the second run
fails with "Port 5273 is already in use" or `EADDRINUSE` on 5274. Nothing else is shared between worktrees
(the data dir of each test is under the OS temp dir, `test-results/` is per checkout).

### Change

- `playwright.config.ts`: `WEB_PORT` and `API_PORT` come from the environment variables of the same names, default 5273 and 5274
  (the pair the lander uses). A value that is not an integer from 1 to 65535, and equal values for both, throw at load time.
  They feed `use.baseURL`, `webServer.command` (`--port`), `webServer.url`, `webServer.env.API_PORT` (the Vite proxy target) and the
  API that `e2e/api.ts` spawns (it imports `API_PORT` from the config; Playwright's workers re-evaluate the config on the inherited env).
  `e2e/api.ts` and `vite.config.ts` needed no change. Vite keeps `strictPort: true`: a collision still fails fast.
- No automatic free-port picking: it would need an asynchronous config or shared state between Playwright's runner and its
  workers, which must agree on the API port. The skill gives a one-liner to pick a free pair instead.
- `.ultimate/skills/rrl-e2e/SKILL.md` (when and how to pick ports, what `EADDRINUSE` means), one line in `README.md`.
- `.ultimate/settings.json`: `isolates.worktree.setup` = `npm ci --no-audit --no-fund` (see timing below).
- Rejected values (`npx playwright test --list`): `WEB_PORT=abc`, `API_PORT=5274.5`, `WEB_PORT=` (empty), `API_PORT=70000`
  each print `Error: <NAME> must be an integer from 1 to 65535, got "<value>"`; `WEB_PORT=5274` prints `Error: WEB_PORT and API_PORT must differ, both are 5274`.

Validated code: blobs `playwright.config.ts` `3417fd9`, `.ultimate/settings.json` `22ae564`, `.ultimate/skills/rrl-e2e/SKILL.md` `8d364f9`
(`git rev-parse HEAD:<path>`). The two temporary worktrees were made from a commit with these blobs.

### Method

Two detached worktrees of the commit, `/tmp/rrl-wt-a` and `/tmp/rrl-wt-b`, each with its own `npm ci --no-audit --no-fund`
(Playwright's Chromium was already installed on the machine). A throwaway script started `npm run test:e2e` in both at the same
time with `env WEB_PORT=... API_PORT=...` and captured each exit code, the summary line and the wall clock. Before each run it checked with
`lsof -nP -iTCP:<port> -sTCP:LISTEN` that none of the ports used was held. The temporary worktrees were removed afterwards.

### After: two runs at once, distinct ports (A 5373/5374, B 5473/5474)

First attempt, **not counted**: A failed all three times with `Error: The package "@esbuild/darwin-arm64" could not be found, and is needed by esbuild.`
(6 failed, exit 1) while B passed (6 passed (19.6s), (11.5s), (13.5s), exit 0). That was an infrastructure fault of my A checkout, not of
the change: its `npm ci` had run with an empty npm cache (`--cache /tmp/...`, to time a cold install) and installed 52 packages, one fewer than B
(`node_modules/@esbuild` was empty). A second cold `npm ci` gave 53 packages and a complete `node_modules`, so this did not reproduce.
After a fresh `npm ci` in A, the three repetitions were run again:

| Run | A ports | B ports | A exit | B exit | A summary | B summary | A / B wall clock |
|---|---|---|---|---|---|---|---|
| after 1 | 5373/5374 | 5473/5474 | 0 | 0 | 6 passed (21.6s) | 6 passed (17.4s) | 23 s / 18 s |
| after 2 | 5373/5374 | 5473/5474 | 0 | 0 | 6 passed (19.1s) | 6 passed (18.8s) | 20 s / 20 s |
| after 3 | 5373/5374 | 5473/5474 | 0 | 0 | 6 passed (24.3s) | 6 passed (25.2s) | 25 s / 26 s |

6 of 6 concurrent runs passed (6 tests each). During the repeated attempts another agent held 5273/5274 (`lsof` showed a `node` in
`/private/tmp/rrl-qa/base`, "BUSY before run" printed before one attempt); these runs were unaffected, which is the point of the change.

### Before: the same two runs at once, both on 5273/5274 (config of `fc404d5`, no environment variables)

In both temporary worktrees `git checkout fc404d5 -- playwright.config.ts` restored the old constants; `lsof` showed both ports free.

| Run | Ports | A exit | B exit | A summary | B summary | A / B wall clock |
|---|---|---|---|---|---|---|
| before 1 | 5273/5274 | 1 | 0 | no test ran | 6 passed (10.9s) | 2 s / 12 s |

A's error output:

```text
[WebServer] error when starting dev server:
[WebServer] Error: Port 5273 is already in use
Error: Process from config.webServer was not able to start. Exit code: 1
```

The collision happened on the first run, so no repetition was needed. It reproduces F8 exactly (a run lost to a port held by another run, no
test executed). B passed only because it won the race.

### Lander path: defaults, no environment variables, own worktree (#10224)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 (2.0 s) |
| `npm test` | 16 files, 775 tests passed (7.6 s) |
| `npm run test:e2e` | exit 0, 6 passed (12.2 s) |

An earlier default-port `npm run test:e2e` in the same worktree failed (`Error: listen EADDRINUSE: address already in use 127.0.0.1:5274`, 4 passed, 2 failed) because another process (pid 90830, gone
before I could look up its directory) took 5274 during it; earlier, an agent's run in `/private/tmp/rrl-qa/base` had held both ports.
That run is not counted, and it is the F8 situation once more. The run above was made after `lsof` showed
both ports free. The skill's own one-liner (a free pair of ports, then `npm run test:e2e`) also passed: ports 50684/50685, 6 passed (20.6s).

### `npm ci` timing (worktree setup)

| Case | Time |
|---|---|
| fresh checkout, npm cache warm | 2.7 s (this worktree), 1.6 s (temporary worktree B) |
| fresh checkout, empty npm cache (`--cache` to an empty dir) | 38.6 s and 40.0 s |

Fast enough for the setup's two-minute limit, so `isolates.worktree.setup` was added (`npm ci --no-audit --no-fund`, safe to repeat).
Remaining risk: a cold-cache install dropped one optional package once (see above), so a setup that "succeeds" can still leave a broken
`node_modules`; it showed as `Cannot find package "@esbuild/darwin-arm64"`.

Outcome: VALIDATED (6 of 6 counted concurrent "after" runs passed; the first attempt is excluded as an infrastructure fault, see above)

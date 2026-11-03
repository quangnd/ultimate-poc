---
name: rrl-e2e
description: Run `npm run test:e2e` of Release Readiness Lab from a worktree, above all while another worktree or the lander may run it too. Use before any E2E run in a worktree, and when one fails with EADDRINUSE or "port already in use".
---

# Run the E2E test from a worktree

The E2E run starts a web server and an API on two fixed ports, and two runs on one pair collide.
`playwright.config.ts` reads them from `WEB_PORT` (default 5273) and `API_PORT` (default 5274).

- **Defaults are the lander's.** Do not set the variables where the lander runs the check; leave 5273/5274 to it.
- **In a worktree, take your own pair**, so a run never meets another one:

  ```bash
  ( eval "$(node -e 'const n=require("node:net"),f=()=>new Promise(r=>{const s=n.createServer().listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>r(p))})});Promise.all([f(),f()]).then(([w,a])=>console.log(`export WEB_PORT=${w} API_PORT=${a}`))')"; npm run test:e2e )
  ```

  The subshell keeps the variables out of your shell, where they would point a later `npm run dev` at the wrong API.
  Or choose them by hand: `WEB_PORT=5373 API_PORT=5374 npm run test:e2e`. Both must be integers and differ.
- **`EADDRINUSE` or "port already in use"** means another run holds one of the pair. Run again with another pair; do not
  hunt with `lsof` and wait. A pair you chose yourself that fails the same way is held by something else, so pick again.
- **After a host restart**, an E2E run that was in flight can leave its Vite server alive on the lander's fixed port, and
  the resumed lander check fails with "already used" (experiments/P4/FAULT_INJECTION.md; upstream HazAT/ultimate#68).
  The lander cannot take another pair, so here, unlike above, find the holder: `lsof -nP -iTCP:<port> -sTCP:LISTEN`,
  then `ps -o ppid=,command= -p <pid>`. Kill it only if its parent is 1 (orphaned) and it is `vite`/`npm run dev` or the
  API; a holder with a live parent belongs to a running check, so leave it. Then resubmit.
- **A fresh checkout needs `npm ci`** first (a worktree has no `node_modules`). The Chromium browser is installed once per
  machine (`npx playwright install chromium`, see README.md), not per worktree.
- The variables are read by Playwright's runner and its workers, so set them for the whole command, not only for part of it.

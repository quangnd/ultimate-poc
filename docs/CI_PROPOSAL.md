# CI proposal: minimal GitHub Actions workflow (enabled in P4, issue #45)

Written as a proposal for issue #30 (PO priority 5). The PO approved it at the P3 gate (2026-11-02), and it was enabled in P4 by PR #50: see [Enabled](#enabled) at the end.

## Workflow (text)

```yaml
# .github/workflows/ci.yml  (proposed; not committed)
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      # Optional E2E (recommended: yes, it is the only restart/persistence check)
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          CI: 'true'
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: test-results/
          retention-days: 7
```

## Expected run time

| Step | Local, measured on 2026-11-02 (M, M1, warm cache) | GitHub runner, estimated (D) |
|---|---|---|
| `npm ci` | 2.6 s | 15–30 s with the npm cache |
| typecheck | 1.7 s | 5–10 s |
| `npm test` (775 tests) | 6.6 s | 15–30 s |
| Playwright Chromium install | already cached | 60–120 s (the first local download took ~8 min, P2 log) |
| `npm run test:e2e` (2 tests) | 7.0 s | 15–30 s |
| **Total** | ~18 s | **~2–4 min** without E2E it is under 1.5 min |

Public repositories get free Actions minutes on standard runners, so there are no new costs or credentials. Enabling it still adds a GitHub feature to the repo, which is an approval gate.

## What it corroborates

- **A different machine.** Results come from a clean Linux machine and OS, independent of the agent's worktree, its Playwright cache and its local Node. This addresses "trust the agent's exit codes".
- **The merged state.** Results apply to the PR head and to main after merge. A check status is visible on the PR, next to the reviewer verdict.
- **Reproducibility.** A fresh-clone install (`npm ci`) works from the lockfile alone.

## What it does not corroborate

- **macOS.** It does not cover the Node/macOS environment the experiments run on.
- **Agent-run checks.** It does not cover browser checks done by agents, screenshots or UI judgement. Concurrency races are not covered by the current tests (see `experiments/P3/UI_CONCURRENCY_LIMITS.md`).
- **The local lander.** The Ultimate lander's own checks stay local. CI duplicates their content but not that process.
- **Correctness beyond the tests.** CI is only as good as the 775 unit tests and the 2 E2E runs.

## Recommendation

**Enable after P3, not now.**

- The lander already runs the same four checks on every merged result and reported green for each P2 landing (P2 log).
- A fresh clone by worker #6014 reproduced them.
- Adding CI during P3 would change the environment the P3 experiments (EXP-01..06) measure, and would add one more signal to compare in the middle of an experiment.

Enable it at the P3 → P4 gate as one small PR with the workflow above. Its first run on main becomes the baseline. If the PO wants independent corroboration sooner, enable it without the two Playwright steps (< 1.5 min); that does not touch the experiment flow.

## Enabled

Enabled on 2026-11-02 by PR #50 (issue #45). The merge commit is `1bdd8b3`. `.github/workflows/ci.yml` is the workflow above, unchanged except for one comment line.

- **Node 26:** available to `actions/setup-node` (`actions/node-versions` manifest, newest 26.13.0), so `node-version: 26` is kept.
- **E2E ports:** the runner sets no `WEB_PORT`/`API_PORT`, so `playwright.config.ts` uses its defaults 5273/5274. They are free on a fresh runner.

| Run (ubuntu-latest) | Commit | Result | Job time | Wall time (queued → done) |
|---|---|---|---|---|
| PR #50, run 41449421136 | `c01edff` | success | 49 s | 52 s |
| **main baseline**, push, run 41449585598 | `1bdd8b3` | success | **51 s** | 54 s |

Steps of the main run: setup-node 5 s, `npm ci` 2 s, typecheck 1 s, `npm test` 3 s, Playwright Chromium install with deps 20 s, `npm run test:e2e` 16 s.

The actual time is about 1 min, under the 2–4 min estimate. The Chromium install took 20 s, against the 60–120 s estimate.

**Agreement with the lander's checks on `1bdd8b3`:** both are green.

- The lander's four check commands (`.ultimate/settings.json`) were run once by the coordinator in the #45 worktree at `1bdd8b3`. `npm ci`, typecheck and E2E passed (7 passed, own port pair); a separate `npx vitest run` reported 775/775 tests.
- The lander then ran the same checks on the #45 closeout tip, which differs from `1bdd8b3` only in docs. Its result is on the landing card.
- CI and the local checks run different operating systems (Linux vs macOS) and different Node patch versions.

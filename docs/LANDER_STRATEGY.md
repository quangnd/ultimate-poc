# Lander and merge strategy

Status: proposed in P0, to be enabled in P1 once tests exist. Nothing is configured yet: this repository has no
`.ultimate/settings.json`, and P0 does not create one.

## What the Ultimate lander is

In Ultimate (clone `d0a2e17`, `extensions/workspaces/README.md` section "Lander", from line 101) every isolated branch
finishes with `workspace submit`. The lander is code, not a model. For each submission it:

1. resets its own detached checkout to the target branch tip (with `lander.push`, fetches and merges the remote branch
   first);
2. merges the submitted tip (a conflict aborts and is reported to the submitter);
3. runs `lander.checks` in order; an entry is a command string, `{ "command": …, "timeout": <s> }`, or an array that
   runs concurrently. A check is stopped after 2 min without output or 10 min total (or its own timeout). A failing
   check reruns once: pass on rerun = reported **flaky**, fail again = submission fails with the output tail;
4. fast-forwards the target branch in the source checkout (up to three attempts if it moved);
5. with `lander.push`, pushes the target branch (never forced);
6. records the landing and emits `workspaces.landed` / `workspaces.check` events (usable as experiment evidence).

Settings shape, quoted from the README (line 188):

```json
"lander": { "checks": ["pnpm check", [{ "command": "pnpm test", "timeout": 180 }, "pnpm test:e2e"]], "push": "origin" }
```

Both keys are optional. Today, with no checks configured, a submission lands after the merge alone.

## Proposed checks for P1 (with ADR-001 scripts)

```json
{
  "lander": {
    "checks": [
      "npm ci --no-audit --no-fund",
      "npm run typecheck",
      { "command": "npm test", "timeout": 300 },
      { "command": "npm run test:e2e", "timeout": 300 }
    ]
  }
}
```

- `typecheck` = `tsc --noEmit`; `test` = Vitest unit + integration (domain, store, HTTP handlers); `test:e2e` =
  Playwright, the single US-08 edit → reload → persisted flow. E2E is added only when it exists (P2); until then the
  list stops after `npm test`.
- Checks run sequentially: the suite is small, and sequential output is easier to read as evidence.
- `npm ci` is listed because the lander checkout is a separate worktree without `node_modules`. Alternative for P1:
  an `isolates.worktree.setup` command (README lines 44–59) that installs once per checkout. Pick one in P1 after
  measuring the install time.
- **No `push`.** The user's chosen flow is a PR per issue (below); the lander must not push to `main` on GitHub.
- Flaky results are recorded in the experiment log, never accepted silently (AGENTS.md "never bypass failing tests").

## Fit with the agreed flow: one PR per issue, coordinator merges

Decision p0-decisions (1a): one PR per GitHub issue; the coordinator merges after an independent reviewer approves and
checks are green. GitHub stays the source of truth for review and merge (AGENTS.md "Source of truth"), so the lander
is used as a **local pre-merge gate**, not as the merge mechanism:

1. Branch work happens in an Ultimate worktree (`ultimate/<hash>-<conversation>`); workers land into the coordinator's
   branch with `subagent land`.
2. Before opening or updating a PR, the coordinator runs the same check commands in its worktree and records the
   output (until the lander has checks, this is the only check run).
3. The coordinator pushes the branch and opens a PR referencing the issue; the independent `reviewer` (different model
   family) reviews the commit range; findings are fixed on the branch.
4. After review approval and green checks, the coordinator merges the PR on GitHub (`gh pr merge`), with the evidence
   in the PR body.
5. `workspace submit` is used only when the target `main` in the local source checkout should follow; with checks
   configured it re-runs them on the merged result, and with no `push` it never updates GitHub by itself.

Open point for P1 (decision needed at the P1 gate): either (a) keep GitHub merges as the only merge path and fetch
`main` locally afterwards, or (b) let the lander land locally and push (`"push": "origin"`), with GitHub PRs used for
review only. (a) matches the agreed flow and is recommended; (b) is simpler but bypasses GitHub's merge button.

No GitHub Actions CI is proposed for P0/P1: it would add a second, unmeasured check runner. Revisit if the PR flow
needs a server-side gate.

## Enablement steps (P1)

1. After ADR-001 approval and the first `npm` scripts exist, add `.ultimate/settings.json` with the `lander` block above
   (minus E2E) in the PR that introduces the scripts. This is a project-level Ultimate setting, so it is shown as a
   diff in that PR and needs the Product Owner's approval (AGENTS.md approval gates).
2. Prove it once: submit a commit with a deliberately failing unit test in a throwaway branch and record that the
   lander refuses it (EXP-03/EXP-06 evidence), then submit the fix.
3. Rollback: delete the `lander` block (or the file); the lander falls back to merge-only.

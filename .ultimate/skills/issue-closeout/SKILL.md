---
name: issue-closeout
description: Close a GitHub issue of this POC with an evidence package (measurement cutoff and scope, metrics from tools/metrics, verification) and leave state/PROJECT_STATUS.md consistent. Use when an issue's PR has merged and the issue, its experiment record or the checkpoint must be closed out.
---

# Issue closeout

Use after the PR has merged. Each step is a separate, bounded call (AGENTS.md "Shell and integration").

1. **Confirm the merge.** `gh pr view <pr> --json state,mergeCommit,mergedAt`. Use `mergeCommit` as the closing commit. Stop if the state is not `MERGED`.
2. **Fix the cutoff and scope before measuring.** Write them down first, and quote them with every number:
   - Cutoff: the UTC time or newest entry id the measurement includes. Anything after it is out of scope, and must not be described as "0".
   - Scope: coordinator only, or coordinator plus all participants (subagents, reviewers, QA). Give n: the number of conversations, and of runs when they are compared.
   - With n = 1, say so: it is an observation, not a trend.
3. **Package the metrics** in codemode, as `tools/metrics/README.md` shows, with `children: true` when the scope includes participants:
   ```js
   const result = await conversationMetrics(ultimate, <coordinator id>, { children: true })
   console.log(metricsMarkdown(result))
   ```
   For counts of errors or events, scan every conversation's entries (`ultimate.entries(id, { kinds: [...] })`) and cross-check with one `ultimate.search(...)`. One search string alone misses cases (see `experiments/P3/FAILURES.md`, correction of 2026-11-02).
4. **Comment and close.** One `gh issue comment <n> --body-file <file>` holding:
   - each acceptance criterion with PASS/FAIL and its evidence (command and result, or file and commit);
   - PR, merge commit, cutoff, scope and n;
   - the metrics table, and the experiment record's path;
   - open risks, and anything NOT AVAILABLE.

   Then `gh issue close <n>`, as a separate call. Check with `gh issue view <n> --json state`.
5. **Reconcile `state/PROJECT_STATUS.md`.** Read the whole file, not only the lines you change. "Current phase", "Current focus", "Active issues", "Last verified commit" and "Next action" must agree with each other and with GitHub:
   - the phase named in "Next action" is the one in "Current phase";
   - closed issues are not listed as active;
   - "Next action" is the real next step, not a step already done.

   Commit the fix in the same closeout branch.

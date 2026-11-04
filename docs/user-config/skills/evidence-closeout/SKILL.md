---
name: evidence-closeout
description: Close a GitHub issue with an evidence package (acceptance criteria with PASS/FAIL, measurement cutoff, scope and n, tokens and cost reported separately) and leave the project's status file consistent. Use when an issue's PR has merged and the issue must be closed out. If the project has its own closeout skill, use that instead.
---

# Evidence closeout

Use after the PR has merged. Run each `gh` call as a separate, bounded step.

1. **Confirm the merge.** `gh pr view <pr> --json state,mergeCommit,mergedAt`. Use `mergeCommit` as the closing commit. Stop if the state is not `MERGED`.
2. **Fix the cutoff and scope before measuring.** Write them down first and quote them with every number:
   - Cutoff: the UTC time or newest entry id the measurement includes. Anything after it is out of scope, never "0".
   - Scope: coordinator only, or coordinator plus all participants (subagents, reviewers, QA). Give n: the conversations, and the runs when they are compared.
   - With n = 1, say so: it is an observation, not a trend.
3. **Measure.** Use the project's metrics tool if its docs name one; otherwise read the conversations' usage in codemode (`ultimate.entries`, `ultimate.trace`). Report tokens and estimated cost separately, never one as a proxy for the other. For counts of errors or events, scan every conversation's entries and cross-check with one `ultimate.search(...)`: one search string alone misses cases.
4. **Comment and close.** One `gh issue comment <n> --body-file <file>` holding:
   - each acceptance criterion with PASS/FAIL and its evidence (command and result, or file and commit);
   - PR, merge commit, cutoff, scope and n;
   - the metrics, and the path of any experiment or run record;
   - open risks, and anything NOT AVAILABLE.

   Then `gh issue close <n>` as a separate call, and check with `gh issue view <n> --json state`.
5. **Reconcile the status file** the project's AGENTS.md or README names, if any. Read all of it, not only the lines you change: phase, focus, active issues, last verified commit and next action must agree with each other and with GitHub. Closed issues are not active; the next action is a real next step, not one already done. Commit the fix through the project's normal PR flow.

Evidence: VALIDATED n=1 (one issue closed with the project version of this skill; its status file was consistent afterwards). General effectiveness is untested.

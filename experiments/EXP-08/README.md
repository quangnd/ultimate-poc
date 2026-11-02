# EXP-08 A/B delivery (and EXP-07 single vs orchestrated): files

Base for every arm: `7385604` (main at the start; main moved to `46fb2b5` during the run with docs-only commits, no
change under `src/`, `tests/`, `fixtures/` or `docs/decisions/`).

| Path | What |
|---|---|
| `task-N/TASK.md` | the prompt, given verbatim to every arm |
| `task-N/hidden.test.ts` | hidden acceptance suite, written and checked (34/34 against a coordinator reference, 3/3 files failing without one) before any arm ran; never in any arm's tree; committed after all arms finished |
| `task-N/pi-build.patch`, `pi.patch` | Pi: after the build pass, after the self-review pass (`git diff 7385604..<sha>`) |
| `task-N/ultimate.patch` | Ultimate builder's final commit; `ultimate-build.patch` (task 3 only) its first commit before the review fix |
| `task-N/ultimate-qa.patch` | Ultimate blind QA spec (`tests/qa/*.qa.test.ts`) |
| `task-N/pi-usage.txt`, `pi-meta.txt` | Pi token sums from `--mode json` `message_end` events, exit codes, SHAs, epoch timestamps |
| `../EXP-07/single-worker.patch` | EXP-07 single worker, task 1 |
| `grades.txt` | every grading run: hidden suite, `npm run typecheck`, `npm test` exit codes and counts, plus cross-QA runs |
| `ultimate-metrics.json` | per-conversation export of `tools/metrics/conversation-metrics.js` (calls, tokens, cost proxy, times) for every Ultimate-arm child, reviewer and the coordinator, with its cutoff timestamp |
| `reference/` | coordinator reference implementations used to check the hidden suites before any arm ran |
| `provenance.txt` | file times of the hidden suites and references vs the first arm launch |
| `tools/` | `run-pi.sh` (Pi arm driver), `grade.sh`, `crossqa.sh`, `piusage.mjs` |

Reproduce a grade: `git apply task-N/<arm>.patch` on `7385604`, copy `task-N/hidden.test.ts` to `tests/hidden/`, run
`npx vitest run tests/hidden`, then delete `tests/hidden/` and run `npm run typecheck` and `npm test`.
(`tools/*.sh` contain the original temp paths; they are records, not portable scripts.)

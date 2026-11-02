# EXP-08 (A/B delivery) and EXP-07 (multi-agent ROI): summary

Issues #48 (EXP-08) and #47 (EXP-07). Run 2026-11-02, 13:17–13:43 UTC, by coordinator #13171. Run records:
`RUN-20261102-01..03.md` (one per task), `../EXP-07/RUN-20261102-01.md`. File map: `README.md`.

## Design (as run)

- 3 matched domain-level tasks (`task-N/TASK.md`), each a new pure module in `src/domain/` with unit tests, inside
  PRD US-03/05/06 and ADR-002, no new scope: link add/remove, gate status summary, per-stream summary.
- Hidden suites (12/11/11 cases) written before any arm, checked against a coordinator reference (34/34) and without
  one (all 3 files fail), kept outside every arm's tree, committed only now.
- Same base `7385604`, same verbatim prompt, same grading script for every arm.
- Order alternated: task 1 Pi first, task 2 Ultimate first, task 3 Pi first.
- **Pi arm:** fresh clone, `pi -p --no-session --mode json --model anthropic/claude-opus-5-5:medium "<TASK>"`, then
  one self-review-and-fix `pi -p` pass with the same model.
- **Ultimate arm:** the project's lean flow: `worker` builder, blind QA `worker` from the base (AC only), `reviewer`,
  findings sent verbatim to the builder.
- **EXP-07 (task 1):** a single `worker` alone, same model as the Ultimate builder.

## Results

| Task / arm | Wall min | Interv. | Hidden 1st / final | Defects (sev.) | typecheck / test | Model calls | Tokens | Cost proxy USD |
|---|---|---|---|---|---|---|---|---|
| 1 Pi | 3.1 | 0 | 12/12 / 12/12 | 0 | 0 / 0 | 17 | 477,653 | 0.59 |
| 1 Ultimate | 5.6 | 0 | 12/12 / 12/12 | 0 | 0 / 0 | 29 | 1,240,925 | 0.88 |
| 1 single worker (EXP-07) | 1.9 | 0 | 12/12 / 12/12 | 0 | 0 / 0 | 14 | 457,155 | 0.24 |
| 2 Pi | 2.5 | 0 | 11/11 / 11/11 | 0 | 0 / 0 | 18 | 475,307 | 0.50 |
| 2 Ultimate | 4.3 | 0 | 11/11 / 11/11 | 0 | 0 / 0 | 28 | 1,121,415 | 0.74 |
| 3 Pi | 2.3 | 0 | 11/11 / 11/11 | 0 | 0 / 0 | 15 | 436,860 | 0.50 |
| 3 Ultimate | 6.3 | 0 | 11/11 / 11/11 | 1 medium + 1 low in first commit, both fixed by its own review loop | 0 / 0 | 41 | 2,030,570 | 1.10 |
| **Pi, 3 tasks** | **7.9** | 0 | 34/34 | 0 | all 0 | 50 | 1,389,820 | **1.59** |
| **Ultimate, 3 tasks** | **16.2** | 0 | 34/34 | 1 medium (fixed) | all 0 | 98 | 4,392,910 | **2.72** |

Within the Ultimate arm, blind QA took 67–74 % of tokens and 63–71 % of the cost proxy in each task; builders
alone took 1.3–2.5 min. Wall time per arm runs from first launch to the last report (QA phase 2), i.e. until the
arm's own evidence is complete; Pi's includes clone and `npm ci`.

**Coordinator share (excluded from the arms above):** #13171, all of EXP-07 and EXP-08 including task design,
hidden suites, grading, cross-checks and these records up to this point: 77+ model calls, about 8.5M tokens (94 %
cache reads), about $6.84 list-price proxy (Opus 5.5 via Claude Code). That is more than both arms together. It is
experiment overhead; a normal issue coordinator does not write hidden suites or grade other arms, but it does
launch, wait, read reports and route findings, which the Ultimate arm needs and the Pi arm does not.

**Cross-checks (post hoc).** Each Ultimate blind-QA spec (77/35/41 tests) passes on Pi's build and final commits and
on the EXP-07 single worker: no defect in any other arm. A read-only reviewer (#14896) approved all four non-Ultimate
implementations with no findings.

**The one defect** (task 3, `cb68e59`): repeated workstream names were deduplicated, contrary to AC1. The Ultimate
reviewer found it; the builder fixed it in one round (`328d977`). Neither the hidden suite nor blind QA covered
repeated names, so both scored the defective commit as passing. Pi's code never had it.

## What the numbers support

- On these three small, well-specified domain tasks, **every arm reached full hidden-suite acceptance on the first
  pass with zero interventions** and no regressions. Quality, as measured, was equal.
- **Plain Pi was faster and cheaper here:** about 2.0× less wall time and 1.7× less cost proxy than the Ultimate
  flow across the three tasks (arm totals; coordinator excluded), with about half the model calls.
- **EXP-07 (same model, unconfounded):** on task 1 the orchestrated flow cost about 3.6× the single worker's cost
  proxy, 2.1× its model calls and 2.9× its wall time, and found nothing the single worker had wrong. The single
  worker was also the cheapest arm in the whole experiment.
- **The review step had real value once:** in task 3 it caught a medium defect that the hidden suite and blind QA
  both missed. Pi's self-review pass found no defects in its own work (it only added tests), but Pi never had one.

## What they do not support

- **No general speed or quality ranking.** n = 3 tasks (1 for EXP-07), each 1–3 minutes of build work, far below the
  5–20 minutes aimed for. The tasks were too easy to separate the arms on correctness; orchestration overhead
  dominates on tasks this small and may matter less, or pay off more, on larger or vaguer ones.
- **Model confound in EXP-08:** Pi ran Opus 5.5 medium; Ultimate's workers ran Sonnet 5.5 xhigh and its reviewer GPT-6.1
  medium (subagent model override NOT AVAILABLE). Speed, tokens and the task-3 defect may come from the model, not
  the tool. Only EXP-07 is same-model.
- **Cost proxies are list prices**, across different providers and subscriptions (Copilot for the workers), not
  invoices. Token totals are dominated by cache reads.
- **Instrument limits:** the hidden suites missed the one real defect; first-pass "equal" is only as good as the
  suites. The task-3 probe was written after the runs.
- **Shared machine:** arms ran with other subagents active; wall times have noise of tens of seconds.
- **Grader is part of the system under test:** the coordinator (an Ultimate agent) designed, ran and graded every
  arm; the reviewer of this PR is the independent check.

## Caveats on procedure

- A coordinator setup error (EXP-07 worktree cut from a later docs-only commit) was caught by the worker itself and
  corrected; timing counts from the restart.
- Infrastructure: coordinator provider errors F20 (first call) and F22 (mid-run) in `experiments/P4/FAILURES.md`; no
  arm was hit; neither step was repeated.
- No arm's code was merged into product code; each lives only as a patch here.

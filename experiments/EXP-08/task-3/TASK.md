# Task 3: per-stream summary (US-06)

You work in the Release Readiness Lab repository (TypeScript; read `AGENTS.md`, `docs/PRD.md` US-06 and
`docs/decisions/ADR-002-scheduling-semantics.md` §2, §5, §7 first). Add a pure domain function that summarises each
workstream for the dashboard: tasks by status, remaining work, blocked tasks and the stream's forecast finish.

## What to build

Create `src/domain/streams.ts` that exports:

```ts
import type { IsoDate, ReleaseDocument, Status } from './types'

export interface StreamSummary {
  stream: string
  /** number of the stream's tasks per status; every status key is present, 0 when none */
  counts: Record<Status, number>
  total: number
  /** sum of estimateDays over the stream's tasks that are not 'done' */
  remainingDays: number
  /** ids of the stream's tasks (any status) with at least one direct predecessor that is not 'done', sorted by id */
  blocked: string[]
  /** latest forecast finishDate among the stream's tasks in schedule(doc); null when the stream has no tasks */
  forecastFinishDate: IsoDate | null
}

export function streamSummary(doc: ReleaseDocument): StreamSummary[]
```

## Acceptance criteria

Precondition: `doc` has passed `validateDocument` (`src/domain/validate.ts`).

1. One entry per name in `doc.workstreams`, in that order, including streams that have no tasks.
2. `counts` has the keys `todo`, `in_progress` and `done`, each an integer ≥ 0; `total` is their sum.
3. `remainingDays` sums `estimateDays` of the stream's tasks whose status is not `done` (0 when none).
4. `blocked` follows ADR-002 §7 (task level): a task of the stream is listed when at least one of its direct
   predecessors, in any stream, is not `done`. Sorted by id in code-unit order (not `localeCompare`). A `done` task with
   an open predecessor is listed too.
5. `forecastFinishDate` is the latest `finishDate` of the stream's tasks in `schedule(doc)` (`src/domain/schedule.ts`);
   do not reimplement the scheduler. A stream whose tasks are all `done` gets the finish date of day −1 (the working
   day before day 0), as the scheduler reports it. A stream without tasks gets `null`.
6. Pure: no I/O, no clock, no randomness; the input document is not mutated; the result does not depend on the order of
   tasks or predecessors in the document.
7. Unit tests in `tests/domain/streams.test.ts` cover the above; `npm run typecheck` and `npm test` pass.

Do not change existing modules' behaviour, the UI, the API or the fixtures. Commit your work on the current branch
when done.

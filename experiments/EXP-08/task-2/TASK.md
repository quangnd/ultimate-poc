# Task 2: gate status summary (US-05, US-06)

You work in the Release Readiness Lab repository (TypeScript; read `AGENTS.md`, `docs/PRD.md` US-05/US-06 and
`docs/decisions/ADR-002-scheduling-semantics.md` §5, §6, §8 and the clarifications first). Add a pure domain function
that summarises the four mandatory readiness gates for the dashboard.

## What to build

Create `src/domain/gates.ts` that exports:

```ts
import type { Gate, IsoDate, ReleaseDocument, Status } from './types'

export interface GateStatus {
  gate: Gate
  /** false when no task carries this gate */
  defined: boolean
  /** the gate task's id; absent when not defined */
  taskId?: string
  /** the gate task's status; absent when not defined */
  status?: Status
  /** true only when defined and the gate task's status is 'done' */
  done: boolean
  /** the gate task's forecast finish date from schedule(doc); absent when not defined */
  forecastFinishDate?: IsoDate
  /** the gate task's targetDate; absent when the task has none or the gate is not defined */
  targetDate?: IsoDate
  /** the gate task's slipDays from schedule(doc) (positive = late); absent when there is no targetDate */
  slipDays?: number
}

export function gateStatus(doc: ReleaseDocument): GateStatus[]
```

## Acceptance criteria

Precondition: `doc` has passed `validateDocument` (`src/domain/validate.ts`).

1. Returns exactly four entries, in the order of `GATES` in `src/domain/types.ts`, whatever the order of tasks in
   the document.
2. A gate carried by a task: `defined: true`, `taskId`, `status` and `done` from that task.
3. `forecastFinishDate` and `slipDays` equal the gate task's `finishDate` and `slipDays` in `schedule(doc)`
   (`src/domain/schedule.ts`); do not reimplement the scheduler. `targetDate` is the task's own `targetDate`.
4. A gate no task carries: `{ gate, defined: false, done: false }` and no other keys.
5. Optional fields that do not apply are absent (not `undefined`-valued keys, not `null`), so
   `JSON.stringify` of the result is stable.
6. Pure: no I/O, no clock, no randomness; the input document is not mutated; identical input gives identical output.
7. Unit tests in `tests/domain/gates.test.ts` cover the above; `npm run typecheck` and `npm test` pass.

Do not change existing modules' behaviour, the UI, the API or the fixtures. Commit your work on the current branch
when done.

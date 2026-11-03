# Issue: delay impact what-if (US-04, PRD fixture firmware-delay scenario)

You work in the Release Readiness Lab repository (TypeScript). Read `AGENTS.md`, `docs/PRD.md` (US-04 and "Fixture"),
`docs/decisions/ADR-002-scheduling-semantics.md` (§2, §6, §7 and clarification 1), `fixtures/README.md`
("Firmware-delay scenario"), `src/domain/schedule.ts`, `src/domain/readiness.ts` and `src/domain/calendar.ts` first.

The operator wants to ask "what happens to the release if this task takes N more days?" without editing the stored
release. Add a pure domain function that answers it.

## What to build

Create `src/domain/whatif.ts` exporting exactly this (other exports allowed):

```ts
import type { IsoDate, ReleaseDocument } from './types'

export interface DelayImpact {
  taskId: string
  extraDays: number
  /** `schedule(doc).finishDate` before and after the delay */
  beforeFinishDate: IsoDate
  afterFinishDate: IsoDate
  /** working days from beforeFinishDate to afterFinishDate, counted as `slipDays(beforeFinishDate, afterFinishDate)` */
  deltaWorkingDays: number
  /** `schedule(doc).slipDays` before and after; null when the release has no targetDate */
  beforeSlipDays: number | null
  afterSlipDays: number | null
  /** true when the task is on the driving chain of the document BEFORE the delay (`assessReadiness`) */
  onDrivingChain: boolean
}

export type DelayErrorCode = 'unknown-task' | 'done-task' | 'invalid-days'
export type DelayResult =
  | { ok: true; impact: DelayImpact }
  | { ok: false; error: { code: DelayErrorCode; message: string } }

export function delayImpact(doc: ReleaseDocument, taskId: string, extraDays: number): DelayResult
```

## Acceptance criteria

Precondition: `doc` passed `validateDocument` (`src/domain/validate.ts`).

1. On success, the "after" values come from scheduling a copy of `doc` in which only that task's `estimateDays` is
   raised by `extraDays`; the "before" values from scheduling `doc` itself. Call `schedule`, `assessReadiness` and
   `slipDays` (`src/domain/calendar.ts`); do not reimplement them.
2. `deltaWorkingDays` is `slipDays(beforeFinishDate, afterFinishDate)`: 0 when the finish does not move, +n when it
   moves n working days later.
3. Fixture firmware-delay scenario: `delayImpact(sample, 'FW-03', 3)` gives `beforeFinishDate` `2027-02-10`,
   `afterFinishDate` `2027-02-15`, `deltaWorkingDays` 3, `beforeSlipDays` -2, `afterSlipDays` 1, `onDrivingChain`
   true.
4. `beforeSlipDays`/`afterSlipDays` are null when the release has no `targetDate`.
5. Errors, checked in this order, each `{ ok: false }` with one error:
   - `taskId` not in the document: code `'unknown-task'`;
   - the task's status is `done`: code `'done-task'` (a done task has no remaining work to delay, ADR-002 §2);
   - `extraDays` is not a positive integer (0, negative, fractional, NaN or Infinity): code `'invalid-days'`.
   `message` is a non-empty string naming the task id or the bad value.
6. Pure: no I/O, no clock, no randomness; `doc` is never mutated, on success or failure. Reordering the tasks, the
   predecessors or the workstreams of `doc` does not change the result (deep-equal).
7. Unit tests in `tests/domain/whatif.test.ts` cover criteria 1–6.
8. `npm run typecheck` and `npm test` pass, and `npm run test:e2e` still passes.

## Constraints

- Stay within the PRD and the accepted ADRs: no new dependency, no API or UI change, no change to existing domain
  modules, fixtures or the store.

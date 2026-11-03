# Issue: late-task report (US-04, US-06)

You work in the Release Readiness Lab repository (TypeScript). Read `AGENTS.md`, `docs/PRD.md` (US-04, US-06),
`docs/decisions/ADR-002-scheduling-semantics.md` (§6, §7 and clarification 1) and `src/domain/schedule.ts`,
`src/domain/readiness.ts` first.

The operator wants to see which open tasks the forecast puts past their own target date, worst first. Add a pure
domain function for it.

## What to build

Create `src/domain/late.ts` exporting exactly this (other exports allowed):

```ts
import type { IsoDate, ReleaseDocument } from './types'

export interface LateTask {
  id: string
  stream: string
  targetDate: IsoDate
  /** the task's forecast finish date, `schedule(doc)` */
  finishDate: IsoDate
  /** the task's `slipDays` from `schedule(doc)`; always > 0 here */
  slipDays: number
  /** true when the task is on `assessReadiness(doc, schedule(doc)).drivingChain` */
  onDrivingChain: boolean
}

export function lateTasks(doc: ReleaseDocument): LateTask[]
```

## Acceptance criteria

Precondition: `doc` passed `validateDocument` (`src/domain/validate.ts`).

1. The result has one entry per task that is **not done**, **has a `targetDate`**, and whose forecast `slipDays`
   (from `schedule(doc)`, ADR-002 §6 and clarification 1) is **greater than 0**. No other task appears.
2. `finishDate` and `slipDays` are exactly the scheduler's values for that task; `stream` and `targetDate` are the
   task's own. Do not reimplement the scheduler, the calendar or the driving chain: call `schedule` and
   `assessReadiness`.
3. `onDrivingChain` is true if and only if the task id is in `assessReadiness(doc, schedule(doc)).drivingChain`.
4. Order: `slipDays` descending; equal `slipDays` by `id` ascending in code-unit order (`a < b`, not `localeCompare`).
5. An empty array when no task qualifies (for example when every task is done, or no task has a target date).
6. Pure: no I/O, no clock, no randomness; the input is not mutated. Reordering the tasks, the predecessors or the
   workstreams of `doc` does not change the result (deep-equal).
7. Unit tests in `tests/domain/late.test.ts` cover criteria 1–6, including the sample fixture (`fixtures/release.json`)
   and its firmware-delay scenario (`fixtures/README.md`).
8. `npm run typecheck` and `npm test` pass, and `npm run test:e2e` still passes.

## Constraints

- Stay within the PRD and the accepted ADRs: no new dependency, no API or UI change, no change to existing domain
  modules, fixtures or the store.

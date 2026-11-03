# EXP-10 task: import preview diff (US-07, US-04, US-05)

You work in the Release Readiness Lab repository (TypeScript, Vite + React UI, small Node API). Read `AGENTS.md`,
`docs/PRD.md` (US-04, US-05, US-07), `docs/decisions/ADR-001-stack-storage.md` and
`docs/decisions/ADR-002-scheduling-semantics.md` first, then `src/web/transfer.ts`, `src/web/ImportPanel.tsx` and
`src/web/App.tsx`, which implement the import today.

Today, when the operator chooses a file to import, the import panel only summarises the file (task counts, streams,
dates) and says it "replaces everything stored now". The operator cannot see **what would change**. Add an import
preview: before a valid import replaces a stored valid release, show what changes, computed by a new pure domain
function.

## 1. Domain: `src/domain/diff.ts`

Create `src/domain/diff.ts` exporting exactly these types and this function (you may add other exports):

```ts
import type { Gate, IsoDate, ReleaseDocument } from './types'

/** The task fields compared, in this order. `predecessors` is not a field here: links are reported in `links`. */
export const TASK_FIELDS = ['title', 'stream', 'ownerRole', 'status', 'estimateDays', 'targetDate', 'gate'] as const
export type TaskField = (typeof TASK_FIELDS)[number]

export interface FieldChange {
  field: TaskField
  /** the value in `before`/`after`; an absent optional field (`targetDate`, `gate`) is null */
  before: string | number | null
  after: string | number | null
}

export interface TaskChange {
  id: string
  /** only fields whose value differs, in TASK_FIELDS order; never empty */
  changes: FieldChange[]
}

/** A finish-to-start link: `to` lists `from` among its predecessors. */
export interface Link {
  from: string
  to: string
}

export type GateState = 'missing' | 'open' | 'done'

export interface GateChange {
  gate: Gate
  before: GateState
  after: GateState
}

export interface ReleaseFieldChange {
  field: 'startDate' | 'targetDate'
  before: IsoDate | null
  after: IsoDate | null
}

export interface ReleaseDiff {
  /** true when release, workstreams, tasks and links all have no change */
  unchanged: boolean
  /** only differing fields, startDate before targetDate; an absent targetDate is null */
  release: ReleaseFieldChange[]
  /** stream names in one document but not the other, each sorted; a reordering alone is not a change */
  workstreams: { added: string[]; removed: string[] }
  tasks: {
    /** ids only in `after`, sorted */
    added: string[]
    /** ids only in `before`, sorted */
    removed: string[]
    /** ids in both with at least one differing field, sorted by id */
    changed: TaskChange[]
  }
  /** links only in `after` / only in `before` (including links of added or removed tasks), sorted by `to`, then `from` */
  links: { added: Link[]; removed: Link[] }
  readiness: {
    /** `assessReadiness(...).ready` of each document */
    before: boolean
    after: boolean
    /** one entry per mandatory gate whose state differs, in GATES order (src/domain/types.ts) */
    gates: GateChange[]
  }
  forecast: {
    /** `schedule(doc).finishDate` of each document */
    beforeFinishDate: IsoDate
    afterFinishDate: IsoDate
    /** working days from the before finish date to the after finish date: positive = later, negative = earlier, 0 = same */
    deltaWorkingDays: number
    /** `schedule(doc).slipDays` of each document; null when that document has no release targetDate */
    beforeSlipDays: number | null
    afterSlipDays: number | null
  }
}

export function diffReleases(before: ReleaseDocument, after: ReleaseDocument): ReleaseDiff
```

### Acceptance criteria (domain)

Precondition: both documents passed `validateDocument` (`src/domain/validate.ts`).

1. **Identity.** `diffReleases(d, d)` and `diffReleases(d, structuredClone(d))` give `unchanged: true`, every list
   empty, `readiness.before === readiness.after`, and `deltaWorkingDays: 0`.
2. **Tasks added / removed.** Matched by `id`. `tasks.added` and `tasks.removed` are sorted by id in code-unit order
   (`a < b`, not `localeCompare`). An added or removed task never also appears in `tasks.changed`.
3. **Tasks changed.** For a task id in both documents, each field of `TASK_FIELDS` whose value differs is one
   `FieldChange`, in `TASK_FIELDS` order. An optional field that is absent is `null` (so adding a `targetDate` is
   `null → date`, removing a `gate` is `gate → null`). A task whose only difference is in `predecessors` is **not** in
   `tasks.changed`. `tasks.changed` is sorted by id.
4. **Links.** A link is a pair (predecessor `from`, successor `to`). `links.added` holds the pairs present in `after`
   and not in `before`; `links.removed` the reverse. This includes every link of an added or removed task. The order of
   ids within a `predecessors` array is not a change. Both lists are sorted by `to`, then by `from`, code-unit order.
5. **Release and workstreams.** `release` lists `startDate` and/or `targetDate` when they differ (absent target =
   `null`), `startDate` first. `workstreams.added`/`removed` compare names as sets, each list sorted (code-unit).
6. **`unchanged`** is true if and only if `release`, `workstreams.added`, `workstreams.removed`, `tasks.added`,
   `tasks.removed`, `tasks.changed`, `links.added` and `links.removed` are all empty.
7. **Readiness and gates.** `readiness.before`/`after` equal `assessReadiness(doc, schedule(doc)).ready`
   (`src/domain/readiness.ts`). For each of the four mandatory gates, its state in a document is `missing` when no task
   has that `gate` value, `done` when the task that has it is `done`, and `open` otherwise. `readiness.gates` lists the
   gates whose state differs, in `GATES` order. A gate that moves to another task in the same state is not listed.
8. **Forecast.** `beforeFinishDate`/`afterFinishDate` are `schedule(doc).finishDate` (`src/domain/schedule.ts`) and
   `beforeSlipDays`/`afterSlipDays` are `schedule(doc).slipDays ?? null`. Do not reimplement the scheduler or the
   readiness rules: call them. `deltaWorkingDays` counts working days (Monday–Friday, ADR-002 §3) between the two
   finish dates as `slipDays` counts them (ADR-002 clarification 1a, `slipDays(beforeFinishDate, afterFinishDate)` in
   `src/domain/calendar.ts`): +n when the after finish is n working days later, −n when earlier. This holds also when
   the two documents have different start dates.
9. **Pure and order-independent.** No I/O, no clock, no randomness, inputs not mutated. Reordering the tasks, the
   predecessors or the workstreams of either document does not change the result (deep-equal).

## 2. UI: the preview in the import panel

10. When the operator has chosen a valid file and a valid release is stored, the import panel (`ImportPanel.tsx`) shows
    the preview of `diffReleases(stored, imported)` before the confirm button, in addition to what it shows today:
    - tasks added, removed and changed, naming each id; for a changed task each changed field with its old and new
      value;
    - links added and removed, each as `from → to`;
    - changes to the release start and target dates, and to the workstream list;
    - readiness before and after (READY / NOT READY) and every gate whose state changes;
    - the forecast finish before and after with the delta in working days (for example "+3 working days later"), and the
      slip against the target before and after when either document has a target. Label it an estimate, as the
      dashboard does (US-06).
    - When `unchanged` is true, the panel says the file matches the stored release instead of listing empty sections.
11. When nothing is stored, or the stored file is unusable, the panel behaves as today (no preview).
12. The preview compares with the **stored** release, not with unsaved editor edits; when there are unsaved edits, the
    panel says so next to the preview (the existing warning about discarding edits stays).
13. Nothing changes in how an import is confirmed, sent, refused or stored; the API is unchanged.

## 3. Tests

14. Unit tests in `tests/domain/diff.test.ts` cover criteria 1–9.
15. One Playwright test in `e2e/` (follow the existing specs and `e2e/api.ts`): with the sample release stored, import
    a file in which FW-03 has `estimateDays` 8 instead of 5 (see `fixtures/README.md`, "Firmware-delay scenario"); the
    preview shows FW-03's estimate change 5 → 8 and a forecast delta of +3 working days; after confirming, the
    dashboard shows the delayed finish.
16. `npm run typecheck`, `npm test` and `npm run test:e2e` pass. For `test:e2e` from a working copy that is not the
    main checkout, use your own port pair: `WEB_PORT=<p1> API_PORT=<p2> npm run test:e2e` (two free ports that
    differ; the defaults 5273/5274 may be in use by another run).

## Constraints

- Stay within the PRD and the accepted ADRs: no new dependency, no new architecture, no API change, no change to the
  behaviour of existing domain modules, the fixtures or the store.
- Keep the UI consistent with the existing import panel and dashboard (reuse `formatDate`, `slipText` and the
  existing CSS classes where they fit; add CSS to `src/web/styles.css` only as needed).
- Commit your work on the current branch when done.

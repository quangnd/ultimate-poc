# ADR-002: Scheduling, blocking and readiness semantics

- Date: 2026-11-01
- Status: Proposed
- Deciders: Product Owner (approval), coordinator (proposal)
- Related: docs/PRD.md (US-02..US-06), docs/ARCHITECTURE.md, ADR-001

## Context

US-04 asks for a deterministic scheduler with "one capacity unit per stream, Monday-Friday, no holidays, no partial-day
units", and US-05/06 need "blocking task", "critical blocker" and readiness gates. The PRD leaves open how the schedule
is anchored in time, how ties are broken, whether target dates constrain anything, and how gates are represented.
docs/ARCHITECTURE.md says a critical blocker is "the blocker delaying the projected finish under the explicit
simplistic capacity assumptions, not a mathematically proven critical path". Without fixed answers, two agents (or
plain Pi vs Ultimate in the A/B runs) would build different schedulers and the P1 tests would not be comparable.
Every rule below is written so a test can assert it.

## Decision

### Data the scheduler sees

- **Release:** `startDate` (`YYYY-MM-DD`, required), optional `targetDate`.
- **Task:** `id` (non-empty, unique), `title`, `stream` (one of the release's workstreams; v1 fixture: FW, SPS,
  Security, App, QA), `ownerRole`, `status` (`todo` | `in_progress` | `done`), `estimateDays`, optional `targetDate`,
  `predecessors` (task ids, finish-to-start), optional `gate`.
- "Blocked" is **derived**, never stored (see Blocking).

### 1. Project start date

The schedule starts at `release.startDate`, an explicit input stored with the data. The domain never reads the system
clock, so the same document always yields the same forecast. If the start date is a Saturday or Sunday, day 0 is the
following Monday. (The UI may prefill today's date when a release is created; after that it is data.)

### 2. Estimates are integer working days; fractions are rejected

`estimateDays` must be an integer. Fractional values (`1.5`), negatives, `NaN` and non-numbers are **rejected with a
visible validation error**, both in the editor and on import. Rounding is not used because it silently changes the
operator's data, hides input mistakes, and makes import→export round trips lossy (US-07); the PRD already excludes
partial-day units, so a fraction is an input error, not a precision to approximate.

- Ordinary tasks: `1 ≤ estimateDays ≤ 250`.
- Gate tasks (§8) may have `estimateDays = 0` (a milestone); then they occupy no capacity.
- For a task that is not `done`, `estimateDays` is the **remaining** work from the start date. `done` tasks are
  treated as finished before day 0 and occupy nothing.

### 3. Working-day calendar

Working days are Monday to Friday; there are no holidays or per-person calendars in v1. Days are integer indexes from
day 0 (§1). A task with estimate `d` starting on day `s` occupies days `s … s+d-1` and **finishes at the end of day
`s+d-1`**. Index ↔ date conversion skips weekends; all date arithmetic is on UTC calendar dates (no time zones).

### 4. One capacity unit per stream

Each stream works on at most one task per working day; tasks are not split or pre-empted. A stream is free from the
day after its previous task's finish. Streams are independent of each other except through dependencies.

### 5. Algorithm and deterministic tie-breaking

Serial list scheduling over the dependency graph (after validation, §9):

1. `done` tasks: finish = day −1.
2. Repeat until all tasks are scheduled. A task is *eligible* when all its predecessors are scheduled. For each eligible
   task, `earliest = max(1 + max(predecessor finishes, default −1), streamFree[stream])` (zero-estimate gates ignore
   `streamFree`).
3. Schedule the eligible task with the **smallest `earliest`**; ties are broken by **task `id` in ascending
   lexicographic (code-unit) order**. Set its start to `earliest`, finish to `start + d − 1` (a 0-day gate finishes on
   `earliest − 1`, i.e. at the same moment as its latest predecessor), and for `d ≥ 1` set `streamFree = finish + 1`.

Input order of tasks or links never affects the result; `id` is the only tie-breaker. Identical documents give
byte-identical forecasts (asserted by a test that shuffles input order).

### 6. Target dates are compared, never constraints

Task and release `targetDate`s do **not** affect the schedule. The forecast reports, per task and for the release,
`slipDays` = working days between target and forecast finish (positive = late). Treating targets as constraints would
need a different (optimising) scheduler and would make the forecast look like a commitment, which US-06 forbids.
The projected release finish is the latest forecast finish of all tasks.

### 7. Blocking task and critical blocker

- **Blocking predecessor (task level, US-03):** for a task `T`, every direct predecessor of `T` whose status is not
  `done`. `T` is **blocked** if it has at least one; the UI lists them.
- **Blocking task (release level, US-05):** a task that is not `done` and is a direct or transitive predecessor of
  a mandatory gate (§8). Marking a task `done` while a predecessor is open is *allowed* (status reports can lag),
  but it is reported as an inconsistency, and the open predecessor still counts as blocking.
- **Driving chain:** start from the task with the latest forecast finish (ties: smallest `id`) and walk backwards.
  At each task, its start was bound either by a predecessor (one whose `finish = start − 1`) or by its stream (the
  previous task on that stream, with `finish = start − 1`). Follow the predecessor if one binds (smallest `id` on ties),
  otherwise the stream. Stop at a task that starts on day 0.
- **Critical blocker (US-06):** a blocking task (release level) that lies on the driving chain, i.e. an open task
  whose delay moves the projected finish under the v1 assumptions. The UI labels the driving chain "driving chain
  under v1 capacity assumptions", not "critical path"; no claim of mathematical optimality is made.

### 8. Gates are tasks with a gate flag

A gate is an ordinary task with `gate` set to one of `fw-integrated`, `security-verified`, `app-integration`,
`qa-complete` (the four mandatory gates of US-05). Each mandatory gate value must appear on **exactly one** task. A
duplicate gate value is a validation error; a missing gate is not a validation error but makes the release
NOT READY with reason "gate <name> not defined". Gates take part in dependencies, the schedule and the dashboard
exactly like other tasks.

Chosen over a separate `Gate` entity because gates need the same dependencies, status and forecast as tasks: one
graph, one validator, one scheduler, and no second link type.

**Readiness (US-05):** READY if and only if all four mandatory gates exist and are `done` **and** no blocking task
(§7) remains. Otherwise NOT READY, with one reason per failed condition in a fixed order (missing gates, open gates,
blocking tasks, then inconsistencies), each naming task ids.

### 9. Validation: unknown predecessors, cycles and other rejections

The whole document is validated before it is scheduled, saved or imported; a rejected edit or import leaves the
stored data unchanged and shows every error.

- Missing or empty `id`, duplicate `id` → rejected.
- A predecessor id that is not a task in the document → rejected ("unknown predecessor X on task Y").
- A task listing itself, or a repeated predecessor → rejected.
- A dependency cycle → rejected. The error names one cycle as an ordered id list, found by depth-first search
  visiting tasks and predecessors in ascending `id` order, so the same input always reports the same cycle.
- Unknown `stream`, unknown `status`, invalid dates, invalid `estimateDays` (§2), duplicate gate (§8) → rejected.

## Alternatives considered

| Topic | Alternative | Why not |
|---|---|---|
| Start date | "today" from the clock | non-deterministic; tests and A/B runs would drift by date |
| Estimates | round fractions (half-up) | silent data change; lossy round trip; PRD excludes partial days |
| Capacity | unlimited parallelism (pure CPM) | contradicts US-04 "one capacity unit per stream" |
| Tie-breaking | input order, or a priority field | input order is fragile across import/export; a priority field is new scope |
| Targets | deadlines as constraints | needs an optimiser; turns an estimate into a commitment |
| Critical blocker | full resource-constrained critical path analysis | out of scope; ARCHITECTURE.md explicitly allows the simpler definition |
| Gates | separate `Gate` entity with its own links | two link types, two validators, more UI, no extra behaviour |
| Done-with-open-predecessor | reject the status change | blocks honest status reporting; readiness already catches it |

## Consequences

- P1 unit tests follow directly: unknown predecessor, self-link, cycle (with the exact reported cycle), fractional and
  negative estimates rejected, weekend start, cross-stream chain, stream capacity serialising two tasks, tie-break by
  id, shuffle-invariance, target not moving the forecast, readiness false (each reason) and true.
- The fixture must define all four gate tasks and one scenario where a firmware estimate change moves the release
  finish (PRD "Fixture").
- The UI must show the assumptions (Mon–Fri, no holidays, one task per stream at a time, integer days, estimates are
  remaining work) next to the forecast (US-04).
- The schedule is a greedy heuristic: it is deterministic but not optimal; a different tie-break could finish earlier.
  This is accepted and stated in the UI.

## Evidence

- Requirements quoted from docs/PRD.md US-02..US-06 and docs/ARCHITECTURE.md ("critical blocker" definition).
- No code exists yet (P0 is docs only); each rule above is a P1 test case, which is where the evidence will be
  recorded.

## Review trigger

Revisit when: holidays, partial days or per-person capacity are requested; the operator needs targets to constrain
the plan; a P1 test or the Product Owner finds the driving-chain result misleading on the fixture; or gates need
behaviour that tasks cannot express.

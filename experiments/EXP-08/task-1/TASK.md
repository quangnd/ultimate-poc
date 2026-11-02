# Task 1: dependency link operations (US-03)

You work in the Release Readiness Lab repository (TypeScript; read `AGENTS.md`, `docs/PRD.md` US-03 and
`docs/decisions/ADR-002-scheduling-semantics.md` §9 first). Add a pure domain module for adding and removing a
finish-to-start dependency link, so callers get one validated operation instead of editing `predecessors` by hand.

## What to build

Create `src/domain/links.ts` that exports:

```ts
import type { ReleaseDocument } from './types'

export interface LinkError {
  code: string
  message: string
  taskId?: string
  /** only for code 'cycle': as in ValidationError.cycle */
  cycle?: string[]
}
export type LinkResult = { ok: true; document: ReleaseDocument } | { ok: false; errors: LinkError[] }

/** Make `predecessorId` a finish-to-start predecessor of `taskId`. */
export function addLink(doc: ReleaseDocument, taskId: string, predecessorId: string): LinkResult
/** Remove `predecessorId` from the predecessors of `taskId`. */
export function removeLink(doc: ReleaseDocument, taskId: string, predecessorId: string): LinkResult
```

## Acceptance criteria

Precondition: `doc` has passed `validateDocument` (`src/domain/validate.ts`).

1. `addLink` on success returns `{ ok: true, document }`, where `document.tasks` has the same tasks in the same order,
   the target task's `predecessors` is its old list with `predecessorId` appended at the end, and every other field
   and task is unchanged.
2. `removeLink` on success returns `{ ok: true, document }` with `predecessorId` removed from the target task's
   `predecessors`; the remaining predecessors keep their order; everything else is unchanged.
3. The input `doc` is never mutated, by either function, on success or failure.
4. A successful result's `document` passes `validateDocument`.
5. `taskId` not in the document: `{ ok: false }` with exactly one error, code `'unknown-task'`, `taskId` set to the
   given `taskId` (both functions).
6. `addLink` errors use the validator's codes (ADR-002 §9): a predecessor id not in the document gives
   `'unknown-predecessor'`; `predecessorId === taskId` gives `'self-predecessor'`; a link that already exists gives
   `'repeated-predecessor'`; a link that closes a dependency cycle gives `'cycle'` with the same `cycle` list and
   message that `validateDocument` reports for the resulting document. On failure, `errors` holds only errors caused
   by the new link (none of them is about another task's pre-existing state, which is valid by precondition).
7. `removeLink` where `predecessorId` is not currently a predecessor of `taskId`: exactly one error, code
   `'unknown-link'`, `taskId` set.
8. Pure: no I/O, no clock, no randomness; deterministic for the same input.
9. Unit tests in `tests/domain/links.test.ts` cover the above; `npm run typecheck` and `npm test` pass.

Do not change existing modules' behaviour, the UI, the API or the fixtures. Commit your work on the current branch
when done.

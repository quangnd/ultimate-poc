# P3-A: Limits of manual-only checks for P2 UI concurrency (issue #30)

## What covers what (M: read from `e2e/persist.spec.ts`, `tests/web/*.test.ts` and the P2 defect table)

| Scenario (P2 defect) | Unit / API test | E2E (`e2e/persist.spec.ts`) | Only a browser check by the agent |
|---|---|---|---|
| Edit → save → reload → API restart → export | `draft.test.ts` (forecast value), `transfer.api.test.ts` | **yes**, run twice | — |
| Edits made during a save are lost (D7) | no | no | **yes**: browser-verified (P2 log, D7) |
| A view switch during a save resets the save lock (D10) | no | no | **yes** |
| An import while an editor save is in flight, or a save during an import (D12) | no | no | **yes**: a stalled fetch in the browser |
| Lost import answer reported as "nothing imported" (D13) | partly: `transfer.test.ts` covers checks, not the outcome UI | no | **yes** |
| Export link vs API (D15) | — | **yes**, after the fix, with a mutation run | — |

The E2E covers one sequential happy path. All three P1 races (D7, D10, D12) are covered only by a single manual browser check by an agent, on the commit it fixed.

## Risk

- **No regression net.** A later refactor of `App.tsx` or `Editor.tsx` can bring back D7, D10 or D12 with every check green: typecheck, 775 unit tests and the E2E. An example is moving the editor back under `view === 'edit'`, which reintroduces D10.
- **Not reproducible.** The manual checks used timing (a stalled fetch, a click during a save). The evidence is a screenshot or a narrative, not a command anyone can re-run.
- **Severity.** The lock logic exists to prevent silent data loss: a lost edit, or an import overwritten by a save. A regression would be silent data loss, the class of bug US-07 is meant to exclude.
- **Who catches it.** The GPT reviewer found all three, and builder tests found none (P2 log). Today, detection depends on a reviewer reading the code again.

## Proposal for minimal automated coverage (not implemented)

Add one Playwright spec, about 80 lines, that reuses the existing fixture and holds the request with `page.route()`, with no timing sleeps:

1. **D7 / D10:** route `PUT /api/release` and hold it. Edit, click Save, switch to the dashboard and back, and try to edit. Assert the draft is inert (locked) and that "Saving…" is still shown. Release the route, then assert that the stored value is the one that was saved and that no edit is lost.
2. **D12:** hold `PUT /api/release` during an editor save, and assert that the Import button is disabled. In reverse, hold the import request and assert that the editor is locked. Then release and assert that the stored file equals the import.
3. **D13:** abort the import request with `route.abort()`. Assert the "unknown outcome, reload" message, not "nothing imported".

- **Expected cost:** about 5–10 s more in `npm run test:e2e`, and no new dependency.
- **Mutation check before adoption:** removing the `locked` prop or remounting the editor must fail the spec.
- **Alternative:** component tests with jsdom and Testing Library would need new dev dependencies (human approval), so they are not proposed.

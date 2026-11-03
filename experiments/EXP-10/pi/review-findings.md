**Verdict: request changes.**

1. **Medium, criterion 10:** `src/web/ImportPreview.tsx:213–237` hides finish dates, the working-day delta and target slip when either release has all tasks done. Reproduced by importing an all-done version of the sample: the domain returns `2027-01-01`, `-28` working days and `-30` slip days, but the preview shows “Complete”, no delta and “—”. Criterion 10 requires these forecast values without a completion exception. Show them, optionally alongside “Complete”, and add a regression test.

Checks passed: typecheck, all 821 unit/integration tests, and all 8 E2E tests using ports 5473/5474. No other findings against criteria 1–16.

# EXP-00 baseline task (verbatim prompt, identical for Run A and Run B)

The text between the markers is passed unchanged as the whole prompt.

<!-- TASK-BEGIN -->
In a fresh TypeScript ESM folder with no dependencies except Node's built-in test runner, implement `addWorkingDays(start: string /* YYYY-MM-DD */, days: number): string` that skips Saturdays and Sundays, rejects negative or non-integer days and invalid dates with a thrown Error, and treats days=0 as returning start if it is a weekday or the next Monday otherwise. Write tests with `node --test` covering weekend crossing, month/year rollover, zero, and invalid input. All tests must pass.
<!-- TASK-END -->

Hidden acceptance suite: `acceptance.test.mjs` (never shown to either run).

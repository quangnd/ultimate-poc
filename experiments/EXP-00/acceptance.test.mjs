// EXP-00 hidden acceptance suite. Written before either run; neither run sees it.
// Usage: AWD_MODULE=/abs/path/to/module.ts node --test acceptance.test.mjs
// Run it under several time zones (TZ=UTC, America/Los_Angeles, Pacific/Kiritimati).
// Only cases the task text defines unambiguously are tested (no "weekend start with days>0").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const path = process.env.AWD_MODULE;
if (!path) throw new Error('set AWD_MODULE to the implementation file');
const mod = await import(pathToFileURL(path).href);
const addWorkingDays = mod.addWorkingDays ?? mod.default;

test('1 Friday + 1 crosses the weekend to Monday', () => {
  assert.equal(addWorkingDays('2026-11-06', 1), '2026-11-09');
});
test('2 Monday + 5 is next Monday', () => {
  assert.equal(addWorkingDays('2026-11-02', 5), '2026-11-09');
});
test('3 Monday + 10 spans two weekends', () => {
  assert.equal(addWorkingDays('2026-11-02', 10), '2026-11-16');
});
test('4 year rollover: Thu 2026-12-31 + 1 is Fri 2027-01-01', () => {
  assert.equal(addWorkingDays('2026-12-31', 1), '2027-01-01');
});
test('5 month rollover across a weekend: Fri 2027-01-29 + 1', () => {
  assert.equal(addWorkingDays('2027-01-29', 1), '2027-02-01');
});
test('6 leap day: Mon 2028-02-28 + 1 is 2028-02-29', () => {
  assert.equal(addWorkingDays('2028-02-28', 1), '2028-02-29');
});
test('7 zero on a weekday returns start', () => {
  assert.equal(addWorkingDays('2026-11-04', 0), '2026-11-04');
});
test('8 zero on Saturday and Sunday returns next Monday', () => {
  assert.equal(addWorkingDays('2026-11-07', 0), '2026-11-09');
  assert.equal(addWorkingDays('2026-11-08', 0), '2026-11-09');
});
test('9 negative and non-integer days throw', () => {
  assert.throws(() => addWorkingDays('2026-11-02', -1), Error);
  assert.throws(() => addWorkingDays('2026-11-02', 1.5), Error);
  assert.throws(() => addWorkingDays('2026-11-02', Number.NaN), Error);
});
test('10 invalid dates throw', () => {
  for (const bad of ['2026-02-30', '2026-13-01', 'not-a-date', '2026-1-5', '']) {
    assert.throws(() => addWorkingDays(bad, 1), Error, bad);
  }
});

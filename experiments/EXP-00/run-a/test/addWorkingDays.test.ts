import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays } from "../src/addWorkingDays.ts";

describe("weekday arithmetic", () => {
  test("within the same week", () => {
    assert.equal(addWorkingDays("2024-06-03", 1), "2024-06-04"); // Mon -> Tue
    assert.equal(addWorkingDays("2024-06-03", 4), "2024-06-07"); // Mon -> Fri
  });
});

describe("weekend crossing", () => {
  test("Friday + 1 -> Monday", () => {
    assert.equal(addWorkingDays("2024-06-07", 1), "2024-06-10");
  });
  test("Thursday + 3 -> Tuesday", () => {
    assert.equal(addWorkingDays("2024-06-06", 3), "2024-06-11");
  });
  test("Monday + 5 -> next Monday", () => {
    assert.equal(addWorkingDays("2024-06-03", 5), "2024-06-10");
  });
  test("multiple weeks", () => {
    assert.equal(addWorkingDays("2024-06-03", 10), "2024-06-17");
    assert.equal(addWorkingDays("2024-06-05", 12), "2024-06-21"); // Wed + 12 -> Fri
  });
  test("weekend start rolls to Monday first", () => {
    assert.equal(addWorkingDays("2024-06-08", 1), "2024-06-11"); // Sat -> Tue
    assert.equal(addWorkingDays("2024-06-09", 5), "2024-06-17"); // Sun -> Mon+5
  });
});

describe("month/year rollover", () => {
  test("month end", () => {
    assert.equal(addWorkingDays("2024-05-31", 1), "2024-06-03"); // Fri -> Mon
    assert.equal(addWorkingDays("2024-04-30", 3), "2024-05-03");
  });
  test("leap February", () => {
    assert.equal(addWorkingDays("2024-02-28", 1), "2024-02-29");
    assert.equal(addWorkingDays("2024-02-29", 1), "2024-03-01");
  });
  test("non-leap February", () => {
    assert.equal(addWorkingDays("2023-02-28", 1), "2023-03-01");
  });
  test("year end", () => {
    assert.equal(addWorkingDays("2024-12-31", 3), "2025-01-03"); // Tue -> Fri
    assert.equal(addWorkingDays("2021-12-31", 1), "2022-01-03"); // Fri -> Mon
  });
  test("long span across years", () => {
    assert.equal(addWorkingDays("2024-01-01", 260), "2024-12-30"); // 52 weeks
  });
});

describe("zero days", () => {
  test("weekday returns start", () => {
    assert.equal(addWorkingDays("2024-06-03", 0), "2024-06-03");
    assert.equal(addWorkingDays("2024-06-07", 0), "2024-06-07");
  });
  test("weekend returns next Monday", () => {
    assert.equal(addWorkingDays("2024-06-08", 0), "2024-06-10"); // Sat
    assert.equal(addWorkingDays("2024-06-09", 0), "2024-06-10"); // Sun
  });
  test("weekend at month/year end rolls over", () => {
    assert.equal(addWorkingDays("2022-12-31", 0), "2023-01-02"); // Sat
  });
});

describe("invalid input", () => {
  test("negative days", () => {
    assert.throws(() => addWorkingDays("2024-06-03", -1), Error);
  });
  test("non-integer days", () => {
    for (const d of [1.5, NaN, Infinity, -Infinity, 2 ** 60]) {
      assert.throws(() => addWorkingDays("2024-06-03", d), Error, String(d));
    }
    assert.throws(() => addWorkingDays("2024-06-03", "1" as unknown as number), Error);
  });
  test("bad format", () => {
    for (const s of ["", "2024-6-3", "2024/06/03", "20240603", "2024-06-03T00:00", " 2024-06-03", "abcd-ef-gh"]) {
      assert.throws(() => addWorkingDays(s, 1), Error, s);
    }
  });
  test("impossible calendar dates", () => {
    for (const s of ["2023-02-29", "2024-02-30", "2024-04-31", "2024-13-01", "2024-00-10", "2024-01-00", "2024-01-32"]) {
      assert.throws(() => addWorkingDays(s, 1), Error, s);
    }
  });
  test("non-string start", () => {
    assert.throws(() => addWorkingDays(undefined as unknown as string, 1), Error);
  });
  test("result beyond year 9999", () => {
    assert.throws(() => addWorkingDays("9999-12-31", 1), Error);
  });
});

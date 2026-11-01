import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addWorkingDays } from "../src/addWorkingDays.ts";

const isError = (error: unknown) => error instanceof Error;

// 2024-01-01 is a Monday: 01 Mon, 02 Tue, 03 Wed, 04 Thu, 05 Fri, 06 Sat, 07 Sun, 08 Mon.
describe("addWorkingDays: weekend crossing", () => {
  it("stays within the week when no weekend is crossed", () => {
    assert.equal(addWorkingDays("2024-01-01", 1), "2024-01-02");
    assert.equal(addWorkingDays("2024-01-01", 4), "2024-01-05");
  });

  it("skips Saturday and Sunday when crossing a weekend", () => {
    assert.equal(addWorkingDays("2024-01-05", 1), "2024-01-08"); // Fri + 1
    assert.equal(addWorkingDays("2024-01-04", 2), "2024-01-08"); // Thu + 2
    assert.equal(addWorkingDays("2024-01-03", 3), "2024-01-08"); // Wed + 3
    assert.equal(addWorkingDays("2024-01-04", 3), "2024-01-09"); // Thu + 3
  });

  it("adds whole weeks in multiples of five", () => {
    assert.equal(addWorkingDays("2024-01-01", 5), "2024-01-08");
    assert.equal(addWorkingDays("2024-01-01", 10), "2024-01-15");
    assert.equal(addWorkingDays("2024-01-03", 20), "2024-01-31");
  });

  it("counts from the preceding Friday when starting on a weekend", () => {
    assert.equal(addWorkingDays("2024-01-06", 1), "2024-01-08"); // Sat + 1
    assert.equal(addWorkingDays("2024-01-07", 1), "2024-01-08"); // Sun + 1
    assert.equal(addWorkingDays("2024-01-06", 2), "2024-01-09");
    assert.equal(addWorkingDays("2024-01-06", 5), "2024-01-12");
    assert.equal(addWorkingDays("2024-01-07", 6), "2024-01-15");
  });

  it("never returns a weekend and matches a day-by-day count", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const reference = (start: string, days: number) => {
      let time = Date.parse(`${start}T00:00:00Z`);
      for (let counted = 0; counted < days; ) {
        time += DAY_MS;
        const weekday = new Date(time).getUTCDay();
        if (weekday !== 0 && weekday !== 6) counted++;
      }
      return new Date(time).toISOString().slice(0, 10);
    };
    // 14 consecutive starts cover every weekday and weekend day twice.
    for (let offset = 0; offset < 14; offset++) {
      const start = new Date(Date.UTC(2024, 0, 1 + offset)).toISOString().slice(0, 10);
      for (let days = 1; days <= 60; days++) {
        const result = addWorkingDays(start, days);
        assert.equal(result, reference(start, days), `${start} + ${days}`);
        const weekday = new Date(`${result}T00:00:00Z`).getUTCDay();
        assert.ok(weekday >= 1 && weekday <= 5, `${result} is a weekend`);
      }
    }
  });
});

describe("addWorkingDays: month and year rollover", () => {
  it("rolls over a month end", () => {
    assert.equal(addWorkingDays("2024-01-30", 2), "2024-02-01"); // Tue + 2
    assert.equal(addWorkingDays("2024-03-29", 1), "2024-04-01"); // Fri + 1 across the weekend
  });

  it("handles February in leap and non-leap years", () => {
    assert.equal(addWorkingDays("2024-02-28", 1), "2024-02-29");
    assert.equal(addWorkingDays("2024-02-28", 2), "2024-03-01");
    assert.equal(addWorkingDays("2024-02-28", 3), "2024-03-04");
    assert.equal(addWorkingDays("2023-02-27", 2), "2023-03-01");
    assert.equal(addWorkingDays("2023-02-28", 1), "2023-03-01");
  });

  it("rolls over a year end", () => {
    assert.equal(addWorkingDays("2024-12-30", 2), "2025-01-01");
    assert.equal(addWorkingDays("2024-12-31", 3), "2025-01-03");
    assert.equal(addWorkingDays("2025-12-31", 1), "2026-01-01");
    assert.equal(addWorkingDays("2023-12-29", 1), "2024-01-01"); // Fri + 1 over the weekend and New Year
  });

  it("adds many days across several months", () => {
    assert.equal(addWorkingDays("2024-01-01", 260), "2024-12-30"); // 52 weeks
    assert.equal(addWorkingDays("2024-01-01", 261), "2024-12-31");
    assert.equal(addWorkingDays("2024-01-01", 262), "2025-01-01");
  });

  it("keeps the zero padding of small years", () => {
    assert.equal(addWorkingDays("0001-01-01", 1), "0001-01-02"); // 0001-01-01 is a Monday
    assert.equal(addWorkingDays("0099-12-31", 2), "0100-01-04"); // Thu + 2, across the weekend
    assert.equal(addWorkingDays("0100-01-02", 0), "0100-01-04"); // a Saturday
  });
});

describe("addWorkingDays: zero days", () => {
  it("returns a weekday start unchanged", () => {
    for (const day of ["2024-01-01", "2024-01-03", "2024-01-05"]) {
      assert.equal(addWorkingDays(day, 0), day);
    }
  });

  it("returns the next Monday for a Saturday or Sunday start", () => {
    assert.equal(addWorkingDays("2024-01-06", 0), "2024-01-08");
    assert.equal(addWorkingDays("2024-01-07", 0), "2024-01-08");
  });

  it("rolls the next Monday over a month or year end", () => {
    assert.equal(addWorkingDays("2023-12-30", 0), "2024-01-01");
    assert.equal(addWorkingDays("2024-03-31", 0), "2024-04-01");
  });
});

describe("addWorkingDays: invalid input", () => {
  it("rejects negative days", () => {
    assert.throws(() => addWorkingDays("2024-01-03", -1), isError);
    assert.throws(() => addWorkingDays("2024-01-03", -5), isError);
  });

  it("rejects non-integer days", () => {
    for (const days of [1.5, 0.1, NaN, Infinity, -Infinity, 1e300, Number.MAX_SAFE_INTEGER + 2]) {
      assert.throws(() => addWorkingDays("2024-01-03", days), isError, String(days));
    }
    assert.throws(() => addWorkingDays("2024-01-03", "3" as unknown as number), isError);
    assert.throws(() => addWorkingDays("2024-01-03", undefined as unknown as number), isError);
  });

  it("rejects malformed dates", () => {
    for (const date of ["", "not a date", "2024-1-5", "24-01-05", "20240105", "2024/01/05", "2024-01-05T00:00:00Z", " 2024-01-05", "2024-01-05\n"]) {
      assert.throws(() => addWorkingDays(date, 1), isError, JSON.stringify(date));
    }
  });

  it("rejects dates that do not exist", () => {
    for (const date of ["2024-02-30", "2023-02-29", "1900-02-29", "2024-04-31", "2024-13-01", "2024-00-10", "2024-01-00", "2024-01-32"]) {
      assert.throws(() => addWorkingDays(date, 1), isError, date);
      assert.throws(() => addWorkingDays(date, 0), isError, date);
    }
    assert.equal(addWorkingDays("2000-02-29", 0), "2000-02-29"); // 2000 is a leap year
  });

  it("rejects a non-string start", () => {
    for (const date of [undefined, null, 20240105, new Date(0)]) {
      assert.throws(() => addWorkingDays(date as unknown as string, 1), isError);
    }
  });

  it("rejects a result beyond year 9999", () => {
    assert.equal(addWorkingDays("9999-12-30", 1), "9999-12-31");
    assert.throws(() => addWorkingDays("9999-12-31", 1), isError);
    assert.throws(() => addWorkingDays("2024-01-01", Number.MAX_SAFE_INTEGER), isError);
  });
});

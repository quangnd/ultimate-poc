const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a strict YYYY-MM-DD calendar date to UTC midnight, or throws. */
function parseDate(value: string): Date {
  const match = typeof value === "string" ? ISO_DATE.exec(value) : null;
  if (!match) throw new Error(`Invalid date: ${String(value)}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // setUTCFullYear avoids Date.UTC mapping years 0-99 to 1900-1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  // Rolled-over dates such as 2024-02-30 or 2024-13-01 do not round-trip.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  if (!(year >= 0 && year <= 9999)) throw new Error("Result is outside the supported date range");
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

/**
 * Adds `days` working days (Monday to Friday) to `start`, a YYYY-MM-DD date.
 *
 * Each counted day is the next weekday after the previous one, so Friday + 1 and
 * Saturday + 1 are both Monday. `days = 0` returns `start` when it is a weekday and
 * the following Monday otherwise. Throws an Error for an invalid date or for `days`
 * that is not a non-negative integer. No holidays are modelled.
 */
export function addWorkingDays(start: string, days: number): string {
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new Error(`days must be a non-negative integer, got ${String(days)}`);
  }
  const date = parseDate(start);
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const monday = date.getTime() - weekday * DAY_MS; // Monday of the start's Monday-Sunday week

  // Weekdays are numbered 0-4 within a week. A weekend start counts as that week's
  // Friday (4), except that days = 0 moves forward to the next Monday (week position 5).
  const isWeekend = weekday > 4;
  const position = isWeekend ? 4 + (days === 0 ? 1 : days) : weekday + days;
  const result = new Date(monday + (Math.floor(position / 5) * 7 + (position % 5)) * DAY_MS);
  return formatDate(result);
}

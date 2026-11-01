const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function parseDate(start: string): Date {
  if (typeof start !== "string") throw new Error(`Invalid date: ${String(start)}`);
  const m = DATE_RE.exec(start);
  if (!m) throw new Error(`Invalid date format, expected YYYY-MM-DD: ${start}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d); // avoids Date.UTC's 0-99 -> 1900s quirk
  // Round-trip check rejects 2023-02-29, 2024-13-01, 2024-04-31, etc.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date: ${start}`);
  }
  return date;
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  if (y < 0 || y > 9999) throw new Error("Result is outside the YYYY-MM-DD range");
  return `${String(y).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Adds `days` working days (Mon-Fri) to `start`.
 * A weekend start is first rolled forward to Monday, so:
 *   Sat + 0 -> Mon, Sat + 1 -> Tue, Fri + 1 -> Mon.
 */
export function addWorkingDays(start: string, days: number): string {
  if (typeof days !== "number" || !Number.isSafeInteger(days) || days < 0) {
    throw new Error(`days must be a non-negative integer, got: ${String(days)}`);
  }
  const date = parseDate(start);

  // Roll a weekend start forward to Monday (UTC: 0 = Sun, 6 = Sat).
  const dow = date.getUTCDay();
  let offset = dow === 6 ? 2 : dow === 0 ? 1 : 0;

  // O(1): whole weeks, then the remainder, jumping a weekend if crossed.
  const weekdayIdx = dow === 0 || dow === 6 ? 0 : dow - 1; // Mon=0 .. Fri=4
  const weeks = Math.floor(days / 5);
  const rem = days % 5;
  offset += weeks * 7 + rem + (weekdayIdx + rem >= 5 ? 2 : 0);

  return formatDate(new Date(date.getTime() + offset * MS_PER_DAY));
}

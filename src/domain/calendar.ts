/**
 * Working-day calendar (ADR-002 §1, §3, §6): Monday-Friday, no holidays, UTC calendar dates only.
 * Dates go in and out as `YYYY-MM-DD` strings. The arithmetic is integer civil-date math (proleptic Gregorian), so no
 * `Date` quirks apply: `Date.UTC` would map years 0000-0099, which the validator accepts, to 1900-1999.
 */
import type { IsoDate } from './types'

/** Days since 1970-01-01 (a Thursday) of an ISO date (H. Hinnant's days_from_civil). */
function toEpochDay(date: IsoDate): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Inverse of `toEpochDay` (civil_from_days); years are zero-padded to four digits. */
function fromEpochDay(epochDay: number): IsoDate {
  const z = epochDay + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0)
  const pad = (n: number, width: number) => String(n).padStart(width, '0')
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

/** Weekday of an epoch day with Monday = 0 … Sunday = 6. */
function weekday(epochDay: number): number {
  return (((epochDay + 3) % 7) + 7) % 7
}

/** day 0: startDate, or the following Monday when startDate is Sat/Sun (§1) */
export function firstWorkingDay(startDate: IsoDate): IsoDate {
  const epochDay = toEpochDay(startDate)
  const dow = weekday(epochDay)
  return fromEpochDay(dow >= 5 ? epochDay + (7 - dow) : epochDay)
}

/**
 * date of working-day index `day` relative to day0 (a working day); negative indexes go backwards, skipping weekends.
 * Precondition: `day0` is a Monday-Friday date, as returned by `firstWorkingDay`.
 */
export function workingDayDate(day0: IsoDate, day: number): IsoDate {
  const epochDay = toEpochDay(day0)
  const dow = weekday(epochDay)
  const position = dow + day // working days since the Monday of day0's week
  const weeks = Math.floor(position / 5)
  return fromEpochDay(epochDay - dow + 7 * weeks + (position - 5 * weeks))
}

/** Working days from an arbitrary fixed Monday up to and including `epochDay`; a weekend counts like the Friday before it. */
function workingDaysUpTo(epochDay: number): number {
  const sinceMonday = epochDay + 3 // epoch day -3 is a Monday
  const weeks = Math.floor(sinceMonday / 7)
  return 5 * weeks + Math.min(sinceMonday - 7 * weeks, 4) + 1
}

/**
 * clarification 1a: working days in (target, finish] when finish > target (positive); -(working days in (finish, target])
 * when finish < target; 0 when equal. Weekend targets therefore behave like the preceding Friday.
 */
export function slipDays(target: IsoDate, finish: IsoDate): number {
  return workingDaysUpTo(toEpochDay(finish)) - workingDaysUpTo(toEpochDay(target))
}

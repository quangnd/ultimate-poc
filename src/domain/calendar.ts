/**
 * Working-day calendar (ADR-002 §1, §3, §6): Monday-Friday, no holidays, UTC calendar dates only.
 * Dates go in and out as `YYYY-MM-DD` strings; the Date objects used for the arithmetic never leave this module.
 */
import type { IsoDate } from './types'

const MS_PER_DAY = 86_400_000

/** Days since 1970-01-01 (a Thursday) of an ISO date. */
function toEpochDay(date: IsoDate): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!) / MS_PER_DAY
}

function fromEpochDay(epochDay: number): IsoDate {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10)
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

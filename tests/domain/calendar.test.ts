import { describe, expect, it } from 'vitest'
import { firstWorkingDay, slipDays, workingDayDate } from '../../src/domain/calendar'

// Reference dates: 2026-01-05 is a Monday; 01-03 Sat, 01-04 Sun, 01-09 Fri, 01-10 Sat, 01-12 Mon.

describe('firstWorkingDay (ADR-002 §1)', () => {
  it('moves a Saturday or Sunday start to the following Monday and keeps a working day', () => {
    expect(firstWorkingDay('2026-01-03')).toBe('2026-01-05') // Sat -> Mon
    expect(firstWorkingDay('2026-01-04')).toBe('2026-01-05') // Sun -> Mon
    expect(firstWorkingDay('2026-01-05')).toBe('2026-01-05') // Mon stays
    expect(firstWorkingDay('2026-01-09')).toBe('2026-01-09') // Fri stays
  })

  it('crosses month and year boundaries', () => {
    expect(firstWorkingDay('2026-01-31')).toBe('2026-02-02') // Sat 31 Jan -> Mon 2 Feb
    expect(firstWorkingDay('2025-12-27')).toBe('2025-12-29') // Sat -> Mon
  })
})

describe('workingDayDate (ADR-002 §3)', () => {
  it('skips weekends going forward from a Monday', () => {
    // day0 = Mon 2026-01-05; each week holds 5 working days
    expect(workingDayDate('2026-01-05', 0)).toBe('2026-01-05') // Mon
    expect(workingDayDate('2026-01-05', 4)).toBe('2026-01-09') // Fri
    expect(workingDayDate('2026-01-05', 5)).toBe('2026-01-12') // Mon after the weekend
    expect(workingDayDate('2026-01-05', 10)).toBe('2026-01-19') // Mon two weeks later
  })

  it('skips weekends going backwards, including negative indexes', () => {
    expect(workingDayDate('2026-01-05', -1)).toBe('2026-01-02') // Mon - 1 -> previous Fri
    expect(workingDayDate('2026-01-05', -5)).toBe('2025-12-29') // Mon, one week back
    expect(workingDayDate('2026-01-05', -6)).toBe('2025-12-26') // Fri before that
    // day0 = Wed 2026-01-07
    expect(workingDayDate('2026-01-07', -2)).toBe('2026-01-05') // Mon
    expect(workingDayDate('2026-01-07', -3)).toBe('2026-01-02') // Fri
    expect(workingDayDate('2026-01-07', 2)).toBe('2026-01-09') // Fri
    expect(workingDayDate('2026-01-07', 3)).toBe('2026-01-12') // Mon
  })

  it('handles a leap day', () => {
    // day0 = Wed 2024-02-28
    expect(workingDayDate('2024-02-28', 1)).toBe('2024-02-29') // Thu
    expect(workingDayDate('2024-02-28', 2)).toBe('2024-03-01') // Fri
    expect(workingDayDate('2024-02-28', 3)).toBe('2024-03-04') // Mon
  })
})

describe('slipDays (ADR-002 §6, clarification 1a)', () => {
  it('is positive when the finish is after the target', () => {
    // target Wed 2026-01-07
    expect(slipDays('2026-01-07', '2026-01-09')).toBe(2) // (Wed, Fri] = Thu, Fri
    expect(slipDays('2026-01-07', '2026-01-12')).toBe(3) // Thu, Fri, Mon (weekend skipped)
    expect(slipDays('2026-01-09', '2026-01-16')).toBe(5) // one full week
  })

  it('is negative when the finish is before the target', () => {
    // target Wed 2026-01-07
    expect(slipDays('2026-01-07', '2026-01-06')).toBe(-1) // (Tue, Wed] = Wed
    expect(slipDays('2026-01-07', '2026-01-05')).toBe(-2) // (Mon, Wed] = Tue, Wed
    expect(slipDays('2026-01-16', '2026-01-12')).toBe(-4) // (Mon, Fri] = Tue..Fri
  })

  it('is 0 when finish equals target', () => {
    expect(slipDays('2026-01-07', '2026-01-07')).toBe(0)
  })

  it('treats a weekend target like the preceding Friday', () => {
    // Sat 2026-01-10 and Sun 2026-01-11 both behave like Fri 2026-01-09
    for (const target of ['2026-01-10', '2026-01-11']) {
      expect(slipDays(target, '2026-01-09')).toBe(0) // finish Fri: on time
      expect(slipDays(target, '2026-01-12')).toBe(1) // finish Mon: one working day late
      expect(slipDays(target, '2026-01-08')).toBe(-1) // finish Thu: one working day early
    }
  })

  it('is the difference of working-day indexes for any two working days', () => {
    const day0 = '2026-01-07' // Wed
    for (let a = -12; a <= 12; a++) {
      for (let b = -12; b <= 12; b++) {
        expect(slipDays(workingDayDate(day0, a), workingDayDate(day0, b))).toBe(b - a)
      }
    }
  })
})

// Regression (reviewer #2857): Date.UTC mapped years 0000-0099 to 1900-1999, though the validator accepts them.
describe('low years the validator accepts', () => {
  it('keeps years 0000-0099 and crosses 0099/0100 by working days', () => {
    // 0099-01-05 and 0001-01-01 are Mondays (proleptic Gregorian); 0099-12-31 is a Thursday, 0100-01-01 a Friday.
    expect(firstWorkingDay('0099-01-05')).toBe('0099-01-05')
    expect(firstWorkingDay('0000-01-01')).toBe('0000-01-03') // a Saturday -> Monday
    expect(workingDayDate('0001-01-01', -1)).toBe('0000-12-29')
    expect(workingDayDate('0099-12-31', 2)).toBe('0100-01-04')
    expect(slipDays('0099-12-31', '0100-01-04')).toBe(2)
  })
})

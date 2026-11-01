/**
 * Independent QA acceptance tests for issue #7 "P1-3: Deterministic working-day scheduler".
 *
 * Black-box, written from ADR-002 (§1, §3-§6 and the §7 worked example), src/domain/types.ts, the issue's
 * acceptance criteria and the agreed contract for `firstWorkingDay`, `workingDayDate`, `slipDays` and `schedule`
 * only. Every expected schedule is derived by hand from §5; each derivation is written next to the test.
 *
 * Conventions used in the derivations:
 * - `earliest = max(1 + max(finishes of predecessors, default -1), streamFree[stream])`; a 0-day gate ignores
 *   streamFree. `streamFree` starts at 0 and becomes `finish + 1` after every task with estimate >= 1.
 * - The next task is the eligible one with the smallest `earliest`, ties by ascending id (code units).
 * - "A 0..2" means start 0, finish 2 (finish = start + estimate - 1).
 * - Working-day index -> date comes from the CAL table below (Monday 2026-01-05 is index 0). A document whose day 0
 *   is another date is read through the same table with an offset: day 0 = Monday 2026-01-12 is `at(i + 5)`,
 *   day 0 = Wednesday 2026-01-07 is `at(i + 2)`.
 *
 * Tolerated detail: a slipDays of -0 counts as 0 (see `canon`); they serialise identically.
 * Tests assert the whole forecast with `toStrictEqual`, so absent optional fields must really be absent (an own
 * property holding `undefined` fails) and no extra fields may appear.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { firstWorkingDay, slipDays, workingDayDate } from '../../src/domain/calendar'
import { schedule, type Forecast, type ScheduledTask } from '../../src/domain/schedule'
import { GATES, type Release, type ReleaseDocument, type Task } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'

// ---------------------------------------------------------------- the hand-written calendar

/**
 * Working-day dates around Monday 2026-01-05 = index 0, written out by hand (Mon-Fri only).
 * The first entry is index -6.
 */
const CAL: readonly string[] = [
  '2025-12-26', // -6 Fri
  '2025-12-29', // -5 Mon
  '2025-12-30', // -4 Tue
  '2025-12-31', // -3 Wed
  '2026-01-01', // -2 Thu
  '2026-01-02', // -1 Fri
  '2026-01-05', //  0 Mon
  '2026-01-06', //  1 Tue
  '2026-01-07', //  2 Wed
  '2026-01-08', //  3 Thu
  '2026-01-09', //  4 Fri
  '2026-01-12', //  5 Mon
  '2026-01-13', //  6 Tue
  '2026-01-14', //  7 Wed
  '2026-01-15', //  8 Thu
  '2026-01-16', //  9 Fri
  '2026-01-19', // 10 Mon
  '2026-01-20', // 11 Tue
  '2026-01-21', // 12 Wed
  '2026-01-22', // 13 Thu
  '2026-01-23', // 14 Fri
  '2026-01-26', // 15 Mon
  '2026-01-27', // 16 Tue
  '2026-01-28', // 17 Wed
  '2026-01-29', // 18 Thu
  '2026-01-30', // 19 Fri
  '2026-02-02', // 20 Mon
]

function at(index: number): string {
  const date = CAL[index + 6]
  if (date === undefined) throw new Error(`QA calendar has no entry for working-day index ${index}`)
  return date
}

const MON = '2026-01-05'

// ---------------------------------------------------------------- fixtures

const STREAMS = ['FW', 'SPS', 'Security', 'App', 'QA']

/** An ordinary task; `over` replaces fields (predecessors, status, targetDate, gate). */
function task(id: string, stream: string, estimateDays: number, over: Partial<Task> = {}): Task {
  return { id, title: id, stream, ownerRole: 'owner', status: 'todo', estimateDays, predecessors: [], ...over }
}

/** A gate task: estimate 0 unless `over` says otherwise. */
function gate(id: string, stream: string, gateName: Task['gate'], predecessors: string[], over: Partial<Task> = {}): Task {
  return task(id, stream, 0, { gate: gateName, predecessors, ...over })
}

/** A valid document (guarded by the validator, so a mistake in a fixture is reported as such). */
function docOf(tasks: Task[], release: Release = { startDate: MON }): ReleaseDocument {
  const document: ReleaseDocument = { schemaVersion: 1, release, workstreams: [...STREAMS], tasks }
  const validation = validateDocument(document)
  if (!validation.ok) throw new Error(`QA fixture is invalid: ${JSON.stringify(validation.errors)}`)
  return document
}

/** Expected scheduled task; `start` undefined for done tasks; optional fields only when given. */
function st(
  id: string,
  start: number | undefined,
  finish: number,
  finishDate: string,
  extra: { binder?: string; slip?: number } = {},
): ScheduledTask {
  const t: ScheduledTask = { id, finish, finishDate }
  if (start !== undefined) t.start = start
  if (extra.binder !== undefined) t.capacityBinder = extra.binder
  if (extra.slip !== undefined) t.slipDays = extra.slip
  return t
}

/** Expected scheduled done task: finish -1, no start. */
function doneSt(id: string, finishDate: string): ScheduledTask {
  return st(id, undefined, -1, finishDate)
}

function fc(day0: string, tasks: ScheduledTask[], finish: number, finishDate: string, slip?: number): Forecast {
  const f: Forecast = { day0, tasks, finish, finishDate }
  if (slip !== undefined) f.slipDays = slip
  return f
}

/** Copy of a forecast with every slipDays number normalised (-0 -> 0); own `undefined` properties are kept. */
function canon(f: Forecast): Forecast {
  const fix = <T extends { slipDays?: number }>(o: T): T => {
    const copy = { ...o }
    if (copy.slipDays !== undefined) copy.slipDays = copy.slipDays + 0
    return copy
  }
  return { ...fix(f), tasks: f.tasks.map((s: ScheduledTask) => fix(s)) }
}

function run(document: ReleaseDocument): Forecast {
  return canon(schedule(document))
}

/** The forecast without any slipDays (own properties removed). */
function withoutSlip(f: Forecast): Forecast {
  const { slipDays: _releaseSlip, ...release } = f
  const tasks = f.tasks.map((s: ScheduledTask) => {
    const { slipDays: _taskSlip, ...rest } = s
    return rest
  })
  return { ...release, tasks }
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()]
  const out: T[][] = []
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([item, ...p])
  })
  return out
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

const has = (o: object, key: string): boolean => Object.hasOwn(o, key)

/** Test-side oracle for date arithmetic, UTC only: weekday 0 = Sunday. */
const weekday = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay()
const plusDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// ================================================================= calendar

describe('firstWorkingDay (ADR-002 §1)', () => {
  it.each(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'])(
    'a weekday (%s) is its own first working day',
    (date) => {
      expect(firstWorkingDay(date)).toBe(date)
    },
  )

  it('moves a Saturday to the following Monday', () => {
    expect(firstWorkingDay('2026-01-10')).toBe('2026-01-12')
  })

  it('moves a Sunday to the following Monday', () => {
    expect(firstWorkingDay('2026-01-11')).toBe('2026-01-12')
  })

  // Weekends that straddle a month, a year or a leap day; the Monday is written out by hand.
  it.each([
    ['2026-01-31', '2026-02-02'], // Sat -> Mon, month change
    ['2026-02-01', '2026-02-02'], // Sun -> Mon
    ['2022-12-31', '2023-01-02'], // Sat -> Mon, year change
    ['2023-01-01', '2023-01-02'], // Sun -> Mon
    ['2025-12-27', '2025-12-29'], // Sat -> Mon
    ['2020-02-29', '2020-03-02'], // Saturday that is a leap day -> Mon in March
    ['2020-03-01', '2020-03-02'], // Sun -> Mon
    ['2028-02-26', '2028-02-28'], // Sat before a leap day Tuesday -> Mon
    ['2028-02-27', '2028-02-28'], // Sun -> Mon
  ])('%s -> %s', (start, monday) => {
    expect(firstWorkingDay(start)).toBe(monday)
  })

  it('for every date in 2026-2028: weekdays stay, Saturday +2 days, Sunday +1 day', () => {
    for (let date = '2026-01-01'; date < '2029-01-01'; date = plusDays(date, 1)) {
      const wd = weekday(date)
      const expected = wd === 6 ? plusDays(date, 2) : wd === 0 ? plusDays(date, 1) : date
      expect(firstWorkingDay(date), date).toBe(expected)
    }
  })
})

describe('workingDayDate (ADR-002 §3)', () => {
  it.each(['2026-01-05', '2026-01-07', '2026-01-09'])('day 0 is the day0 date itself (%s)', (day0) => {
    expect(workingDayDate(day0, 0)).toBe(day0)
  })

  it('from a Monday, skips every weekend: indexes 0..20 give the hand-written table', () => {
    for (let i = 0; i <= 20; i++) expect(workingDayDate('2026-01-05', i), `day ${i}`).toBe(at(i))
  })

  it('from a Wednesday (index 2 of the table), skips the weekend', () => {
    // Wed 01-07 = 0, Thu = 1, Fri = 2, Mon 01-12 = 3, ... Fri 01-16 = 7, Mon 01-19 = 8
    for (let k = 0; k <= 15; k++) expect(workingDayDate('2026-01-07', k), `day ${k}`).toBe(at(2 + k))
  })

  it('from a Friday (index 4 of the table), the next working day is Monday', () => {
    expect(workingDayDate('2026-01-09', 1)).toBe('2026-01-12')
    for (let k = 0; k <= 16; k++) expect(workingDayDate('2026-01-09', k), `day ${k}`).toBe(at(4 + k))
  })

  it('negative indexes go back over working days only (from a Monday)', () => {
    // -1 = Fri 2026-01-02 (the weekend 01-03/04 is skipped), -2 = Thu 01-01, ..., -5 = Mon 2025-12-29, -6 = Fri 12-26
    for (let k = -6; k <= -1; k++) expect(workingDayDate('2026-01-05', k), `day ${k}`).toBe(at(k))
  })

  it('negative indexes from a Wednesday', () => {
    // Wed 01-07: -1 Tue 06, -2 Mon 05, -3 Fri 01-02, -4 Thu 01-01, -5 Wed 12-31, -6 Tue 12-30, -7 Mon 12-29, -8 Fri 12-26
    for (let k = -8; k <= -1; k++) expect(workingDayDate('2026-01-07', k), `day ${k}`).toBe(at(2 + k))
  })

  it('from a Friday, -1 is Thursday and -5 is the previous Friday', () => {
    expect(workingDayDate('2026-01-09', -1)).toBe('2026-01-08')
    expect(workingDayDate('2026-01-09', -5)).toBe('2026-01-02')
  })

  it('50 whole weeks are 250 working days: 250 -> Monday 2026-12-21, 249 -> Friday 2026-12-18, -250 -> Monday 2025-01-20', () => {
    // 2026-01-05 + 350 calendar days = 2026-12-21 (Mon); minus 350 days = 2025-01-20 (Mon)
    expect(workingDayDate('2026-01-05', 250)).toBe('2026-12-21')
    expect(workingDayDate('2026-01-05', 249)).toBe('2026-12-18')
    expect(workingDayDate('2026-01-05', -250)).toBe('2025-01-20')
  })

  it('crosses a leap day (Sat 2020-02-29 and Sun 2020-03-01 are skipped)', () => {
    expect(workingDayDate('2020-02-28', 1)).toBe('2020-03-02')
    expect(workingDayDate('2020-02-27', 2)).toBe('2020-03-02')
    expect(workingDayDate('2020-03-02', -1)).toBe('2020-02-28')
    expect(workingDayDate('2020-03-02', -2)).toBe('2020-02-27')
  })

  it('crosses a year boundary: Wed 2025-12-31 + 1 = Thu 2026-01-01, + 2 = Fri 01-02, + 3 = Mon 01-05', () => {
    expect(workingDayDate('2025-12-31', 1)).toBe('2026-01-01')
    expect(workingDayDate('2025-12-31', 2)).toBe('2026-01-02')
    expect(workingDayDate('2025-12-31', 3)).toBe('2026-01-05')
  })

  it('for each weekday start, indexes -30..30 are weekdays and each is the next working day of the previous one', () => {
    for (const day0 of ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']) {
      for (let day = -30; day <= 30; day++) {
        const date = workingDayDate(day0, day)
        expect([0, 6], `${day0} day ${day}`).not.toContain(weekday(date))
        const next = weekday(date) === 5 ? plusDays(date, 3) : plusDays(date, 1)
        expect(workingDayDate(day0, day + 1), `${day0} day ${day + 1}`).toBe(next)
      }
    }
  })
})

describe('slipDays (agreed clarification 1a)', () => {
  /** -0 is accepted as 0. */
  const slip = (target: string, finish: string): number => slipDays(target, finish) + 0

  it('is 0 when finish equals target', () => {
    expect(slip('2026-01-07', '2026-01-07')).toBe(0)
    expect(slip('2026-01-09', '2026-01-09')).toBe(0)
  })

  it('is the positive count of working days in (target, finish] when finish is after the target', () => {
    expect(slip('2026-01-05', '2026-01-07')).toBe(2) // Tue, Wed
    expect(slip('2026-01-07', '2026-01-08')).toBe(1) // Thu
    expect(slip('2026-01-09', '2026-01-12')).toBe(1) // Mon (Sat and Sun do not count)
    expect(slip('2026-01-09', '2026-01-13')).toBe(2) // Mon, Tue
    expect(slip('2026-01-08', '2026-01-13')).toBe(3) // Fri, Mon, Tue
  })

  it('is the negative count of working days in (finish, target] when finish is before the target', () => {
    expect(slip('2026-01-07', '2026-01-05')).toBe(-2) // Tue, Wed
    expect(slip('2026-01-12', '2026-01-09')).toBe(-1) // Mon
    expect(slip('2026-01-13', '2026-01-08')).toBe(-3) // Fri, Mon, Tue
    expect(slip('2026-01-09', '2026-01-08')).toBe(-1) // Fri
  })

  it('counts a long span: (Mon 2026-01-05, Thu 2026-02-05] holds 4+5+5+5+4 = 23 working days', () => {
    // Jan 6-9 (4), Jan 12-16 (5), Jan 19-23 (5), Jan 26-30 (5), Feb 2-5 (4)
    expect(slip('2026-01-05', '2026-02-05')).toBe(23)
    expect(slip('2026-02-05', '2026-01-05')).toBe(-23)
  })

  it('does not count weekend days across a leap day or a year boundary', () => {
    expect(slip('2020-02-28', '2020-03-02')).toBe(1) // Fri -> Mon
    expect(slip('2020-03-02', '2020-02-28')).toBe(-1)
    expect(slip('2025-12-31', '2026-01-02')).toBe(2) // Thu, Fri
  })

  it('a weekend target behaves like the preceding Friday (Saturday 2026-01-10, Sunday 01-11, Friday 01-09)', () => {
    for (const weekendTarget of ['2026-01-10', '2026-01-11']) {
      for (const finish of ['2026-01-05', '2026-01-08', '2026-01-09', '2026-01-12', '2026-01-13', '2026-01-20']) {
        expect(slip(weekendTarget, finish), `${weekendTarget} vs ${finish}`).toBe(slip('2026-01-09', finish))
      }
    }
  })

  it('weekend targets, worked by hand', () => {
    expect(slip('2026-01-10', '2026-01-09')).toBe(0) // Sat target, Fri finish: (Fri, Sat] has no working day
    expect(slip('2026-01-11', '2026-01-09')).toBe(0) // Sun target, Fri finish
    expect(slip('2026-01-10', '2026-01-12')).toBe(1) // Sat target, Mon finish: Mon
    expect(slip('2026-01-11', '2026-01-12')).toBe(1) // Sun target, Mon finish
    expect(slip('2026-01-10', '2026-01-13')).toBe(2) // Sat target, Tue finish: Mon, Tue
    expect(slip('2026-01-11', '2026-01-08')).toBe(-1) // Sun target, Thu finish: (Thu, Sun] = Fri
    expect(slip('2026-01-10', '2026-01-07')).toBe(-2) // Sat target, Wed finish: Thu, Fri
  })

  it('agrees with working-day indexes: slipDays(date(i), date(j)) = j - i for i, j in -6..20', () => {
    for (let i = -6; i <= 20; i++) {
      for (let j = -6; j <= 20; j++) expect(slip(at(i), at(j)), `${i} -> ${j}`).toBe(j - i)
    }
  })
})

describe('calendar functions use UTC calendar dates only (ADR-002 §3)', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  // [Friday, Saturday, Sunday, Monday, Tuesday] around daylight-saving changes of several regions
  const weeks = [
    ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'], // US spring forward Sun 03-08
    ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'], // Europe spring forward Sun 03-29
    ['2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07'], // Australia/NZ fall back Sun 04-05
    ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'], // US fall back Sun 11-01
  ] as const

  it.each(['UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Pacific/Auckland', 'Pacific/Kiritimati'])(
    'gives the same dates when the process time zone is %s',
    (zone) => {
      process.env.TZ = zone
      for (const [fri, sat, sun, mon, tue] of weeks) {
        expect(firstWorkingDay(fri)).toBe(fri)
        expect(firstWorkingDay(sat)).toBe(mon)
        expect(firstWorkingDay(sun)).toBe(mon)
        expect(workingDayDate(fri, 1)).toBe(mon)
        expect(workingDayDate(fri, 2)).toBe(tue)
        expect(workingDayDate(mon, -1)).toBe(fri)
        expect(slipDays(fri, mon) + 0).toBe(1)
        expect(slipDays(mon, fri) + 0).toBe(-1)
        expect(slipDays(sat, tue) + 0).toBe(2)
        // a Saturday start, 2 days of work: day 0 = Monday, finish on day 1 = Tuesday
        const f = run(docOf([task('A', 'FW', 2)], { startDate: sat }))
        expect(f.day0).toBe(mon)
        expect(f.finishDate).toBe(tue)
      }
    },
  )
})

// ================================================================= schedule

describe('day 0 (ADR-002 §1)', () => {
  it('a Monday start is day 0: A/FW 2 days -> 0..1', () => {
    // A: earliest 0, start 0, finish 0+2-1 = 1 = Tue 01-06
    expect(run(docOf([task('A', 'FW', 2)]))).toStrictEqual(fc(at(0), [st('A', 0, 1, at(1))], 1, at(1)))
  })

  it('a Wednesday start is day 0 (A/FW 3 days: Wed, Thu, Fri)', () => {
    // day 0 = Wed 2026-01-07, A 0..2, finish day 2 = Fri 01-09
    expect(run(docOf([task('A', 'FW', 3)], { startDate: '2026-01-07' }))).toStrictEqual(
      fc('2026-01-07', [st('A', 0, 2, at(2 + 2))], 2, '2026-01-09'),
    )
  })

  it('a Friday start: 2 days of work finish on the following Monday', () => {
    // day 0 = Fri 01-09, day 1 = Mon 01-12; A 0..1
    expect(run(docOf([task('A', 'FW', 2)], { startDate: '2026-01-09' }))).toStrictEqual(
      fc('2026-01-09', [st('A', 0, 1, '2026-01-12')], 1, '2026-01-12'),
    )
  })

  it.each([
    ['Saturday', '2026-01-10'],
    ['Sunday', '2026-01-11'],
  ])('a %s start moves day 0 to the following Monday 2026-01-12', (_name, startDate) => {
    // day 0 = Mon 01-12; A 0..1, finishing on day 1 = Tue 01-13 (not Mon 01-12 + 1 calendar day from the weekend)
    expect(run(docOf([task('A', 'FW', 2)], { startDate }))).toStrictEqual(
      fc('2026-01-12', [st('A', 0, 1, '2026-01-13')], 1, '2026-01-13'),
    )
  })

  it('weekday starts keep their own date, weekend starts get the Monday, for a whole week', () => {
    const expectedDay0 = [
      ['2026-01-05', '2026-01-05'],
      ['2026-01-06', '2026-01-06'],
      ['2026-01-07', '2026-01-07'],
      ['2026-01-08', '2026-01-08'],
      ['2026-01-09', '2026-01-09'],
      ['2026-01-10', '2026-01-12'],
      ['2026-01-11', '2026-01-12'],
    ] as const
    for (const [startDate, day0] of expectedDay0) {
      const f = run(docOf([task('A', 'FW', 1)], { startDate }))
      expect(f.day0, startDate).toBe(day0)
      expect(f.finishDate, startDate).toBe(day0) // 1 day of work: finishes on day 0
    }
  })

  it('a Saturday start with a chain: A/FW 4 days then B/FW 2 days', () => {
    // day 0 = Mon 01-12. A 0..3 (Mon 12, Tue 13, Wed 14, Thu 15). B: earliest max(1+3, streamFree 4) = 4 -> 4..5
    // = Fri 01-16, Mon 01-19. B's capacity binder is A.
    const f = run(docOf([task('A', 'FW', 4), task('B', 'FW', 2, { predecessors: ['A'] })], { startDate: '2026-01-10' }))
    expect(f).toStrictEqual(
      fc(at(5), [st('A', 0, 3, at(5 + 3)), st('B', 4, 5, at(5 + 5), { binder: 'A' })], 5, at(5 + 5)),
    )
  })

  it('a Saturday start with a done task: day -1 is the Friday before the Monday day 0', () => {
    // day 0 = Mon 01-12, day -1 = Fri 01-09. D done -> finish -1. E/FW 1 after D: earliest 1 + (-1) = 0 -> 0..0
    const f = run(docOf([task('D', 'FW', 3, { status: 'done' }), task('E', 'FW', 1, { predecessors: ['D'] })], { startDate: '2026-01-10' }))
    expect(f).toStrictEqual(fc(at(5), [doneSt('D', '2026-01-09'), st('E', 0, 0, '2026-01-12')], 0, '2026-01-12'))
  })
})

describe('finish = start + estimate - 1 (ADR-002 §3)', () => {
  // A single task on day 0 starts at 0 and finishes at estimate - 1; the date skips weekends.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])('a single task with an estimate of %i day(s)', (d) => {
    expect(run(docOf([task('A', 'FW', d)]))).toStrictEqual(fc(at(0), [st('A', 0, d - 1, at(d - 1))], d - 1, at(d - 1)))
  })

  it('the largest estimate, 250 days, finishes on index 249 = Friday 2026-12-18', () => {
    expect(run(docOf([task('A', 'FW', 250)]))).toStrictEqual(fc(at(0), [st('A', 0, 249, '2026-12-18')], 249, '2026-12-18'))
  })

  it('an in_progress task is scheduled like a todo task (estimate = remaining work from day 0)', () => {
    expect(run(docOf([task('A', 'FW', 2, { status: 'in_progress' })]))).toStrictEqual(
      fc(at(0), [st('A', 0, 1, at(1))], 1, at(1)),
    )
  })
})

describe('one capacity unit per stream (ADR-002 §4)', () => {
  it('serialises two tasks of one stream: A/FW 2 and B/FW 3, no dependencies', () => {
    // Both earliest 0, tie -> A. A 0..1, streamFree[FW] = 2. B: earliest 2 -> 2..4, binder A.
    const expected = fc(at(0), [st('A', 0, 1, at(1)), st('B', 2, 4, at(4), { binder: 'A' })], 4, at(4))
    expect(run(docOf([task('A', 'FW', 2), task('B', 'FW', 3)]))).toStrictEqual(expected)
    expect(run(docOf([task('B', 'FW', 3), task('A', 'FW', 2)]))).toStrictEqual(expected)
  })

  it('the stream is free the day after its previous task finishes: the second task starts at first.finish + 1', () => {
    const f = run(docOf([task('A', 'FW', 3), task('B', 'FW', 1)]))
    const [a, b] = f.tasks
    expect(b?.start).toBe((a?.finish ?? NaN) + 1)
  })

  it('independent streams run in parallel: A/FW 2 and B/SPS 3 both start on day 0', () => {
    // No predecessors and different streams: both earliest 0.
    expect(run(docOf([task('A', 'FW', 2), task('B', 'SPS', 3)]))).toStrictEqual(
      fc(at(0), [st('A', 0, 1, at(1)), st('B', 0, 2, at(2))], 2, at(2)),
    )
  })

  it('three tasks of one stream run one after the other: A/1, B/2, C/1', () => {
    // A 0..0 (sf 1). B earliest 1 -> 1..2 (binder A, sf 3). C earliest 3 -> 3..3 (binder B).
    expect(run(docOf([task('A', 'FW', 1), task('B', 'FW', 2), task('C', 'FW', 1)]))).toStrictEqual(
      fc(
        at(0),
        [st('A', 0, 0, at(0)), st('B', 1, 2, at(2), { binder: 'A' }), st('C', 3, 3, at(3), { binder: 'B' })],
        3,
        at(3),
      ),
    )
  })

  it('two streams with two tasks each interleave without interfering: A/FW 2, B/FW 1, C/SPS 1, D/SPS 2', () => {
    // all earliest 0 -> A (0..1, FW sf 2); then B 2, C 0, D 0 -> C (0..0, SPS sf 1); then B 2, D 1 -> D (1..2, binder C,
    // SPS sf 3); then B (2..2, binder A).
    expect(
      run(docOf([task('A', 'FW', 2), task('B', 'FW', 1), task('C', 'SPS', 1), task('D', 'SPS', 2)])),
    ).toStrictEqual(
      fc(
        at(0),
        [
          st('A', 0, 1, at(1)),
          st('B', 2, 2, at(2), { binder: 'A' }),
          st('C', 0, 0, at(0)),
          st('D', 1, 2, at(2), { binder: 'C' }),
        ],
        2,
        at(2),
      ),
    )
  })
})

describe('dependencies (finish-to-start, ADR-002 §5)', () => {
  it('a cross-stream chain: A/FW 2 -> B/SPS 3 -> C/App 1 -> D/QA 1', () => {
    // A 0..1. B earliest 1+1 = 2 -> 2..4. C earliest 1+4 = 5 -> 5..5 (Mon 01-12). D earliest 1+5 = 6 -> 6..6.
    // Every task is the first of its stream, so no capacity binders.
    const f = run(
      docOf([
        task('A', 'FW', 2),
        task('B', 'SPS', 3, { predecessors: ['A'] }),
        task('C', 'App', 1, { predecessors: ['B'] }),
        task('D', 'QA', 1, { predecessors: ['C'] }),
      ]),
    )
    expect(f).toStrictEqual(
      fc(
        at(0),
        [st('A', 0, 1, at(1)), st('B', 2, 4, at(4)), st('C', 5, 5, at(5)), st('D', 6, 6, at(6))],
        6,
        at(6),
      ),
    )
  })

  it('a successor waits for the latest predecessor: C/App 1 after A/FW 3 and B/SPS 5', () => {
    // A 0..2, B 0..4. C earliest 1 + max(2, 4) = 5 -> 5..5 (Mon 01-12).
    const f = run(
      docOf([task('A', 'FW', 3), task('B', 'SPS', 5), task('C', 'App', 1, { predecessors: ['A', 'B'] })]),
    )
    expect(f).toStrictEqual(
      fc(at(0), [st('A', 0, 2, at(2)), st('B', 0, 4, at(4)), st('C', 5, 5, at(5))], 5, at(5)),
    )
  })

  it('stream capacity wins over a predecessor that finishes earlier: C/FW after B/SPS, but A/FW 2 is still running', () => {
    // A 0..1 (FW sf 2). B/SPS 1 -> 0..0. C earliest max(1+0, 2) = 2 -> 2..2, binder A.
    const f = run(docOf([task('A', 'FW', 2), task('B', 'SPS', 1), task('C', 'FW', 1, { predecessors: ['B'] })]))
    expect(f).toStrictEqual(
      fc(at(0), [st('A', 0, 1, at(1)), st('B', 0, 0, at(0)), st('C', 2, 2, at(2), { binder: 'A' })], 2, at(2)),
    )
  })

  it('two successors of one predecessor in the same stream serialise in id order: X/SPS 1 and Y/SPS 2 after P/FW 1', () => {
    // P 0..0. X and Y both earliest 1 -> X first (1..1, sf 2); Y earliest 2 -> 2..3, binder X.
    const f = run(
      docOf([
        task('P', 'FW', 1),
        task('Y', 'SPS', 2, { predecessors: ['P'] }),
        task('X', 'SPS', 1, { predecessors: ['P'] }),
      ]),
    )
    expect(f).toStrictEqual(
      fc(
        at(0),
        [st('P', 0, 0, at(0)), st('X', 1, 1, at(1)), st('Y', 2, 3, at(3), { binder: 'X' })],
        3,
        at(3),
      ),
    )
  })
})

describe('capacityBinder (ADR-002 §5 step 3)', () => {
  it('is absent (not even an undefined property) for the first task of each stream', () => {
    // A/FW 1, B/FW 1, C/SPS 1: A and C are first of their streams; B follows A.
    const f = run(docOf([task('A', 'FW', 1), task('B', 'FW', 1), task('C', 'SPS', 1)]))
    const [a, b, c] = f.tasks
    expect(a && has(a, 'capacityBinder')).toBe(false)
    expect(c && has(c, 'capacityBinder')).toBe(false)
    expect(b?.capacityBinder).toBe('A')
  })

  it('is the task that last set streamFree of the stream, even when a predecessor decides the start', () => {
    // A/FW 1 -> 0..0 (sf 1). B/SPS 3 -> 0..2. C/FW 1 after B: earliest max(1+2, 1) = 3 -> 3..3. The last task that
    // set streamFree[FW] before C is A, so C's binder is A although B's finish determined the start.
    const f = run(docOf([task('A', 'FW', 1), task('B', 'SPS', 3), task('C', 'FW', 1, { predecessors: ['B'] })]))
    expect(f).toStrictEqual(
      fc(at(0), [st('A', 0, 0, at(0)), st('B', 0, 2, at(2)), st('C', 3, 3, at(3), { binder: 'A' })], 3, at(3)),
    )
  })

  it('is tracked per stream', () => {
    // A/FW 1, B/SPS 1, C/FW 1, D/SPS 1: C follows A, D follows B; no cross-stream binders.
    const f = run(docOf([task('A', 'FW', 1), task('B', 'SPS', 1), task('C', 'FW', 1), task('D', 'SPS', 1)]))
    expect(f).toStrictEqual(
      fc(
        at(0),
        [
          st('A', 0, 0, at(0)),
          st('B', 0, 0, at(0)),
          st('C', 1, 1, at(1), { binder: 'A' }),
          st('D', 1, 1, at(1), { binder: 'B' }),
        ],
        1,
        at(1),
      ),
    )
  })

  it('a 0-day gate has no binder, does not set streamFree and is never the binder of the next task', () => {
    // A/FW 2, B/FW 1 after G, C/FW 1, G gate/FW 0 after A.
    // eligible A(0), C(0) -> A: 0..1, sf FW 2.
    // eligible C(max(0,2)=2), G(1+1=2, ignores sf) -> tie, 'C' < 'G' -> C: 2..2, binder A, sf 3.
    // G: earliest 2 -> start 2, finish 1, no binder, sf stays 3.
    // B: earliest max(1+1, 3) = 3 -> 3..3, binder C (not G).
    const f = run(
      docOf([
        task('A', 'FW', 2),
        task('B', 'FW', 1, { predecessors: ['G'] }),
        task('C', 'FW', 1),
        gate('G', 'FW', 'fw-integrated', ['A']),
      ]),
    )
    expect(f).toStrictEqual(
      fc(
        at(0),
        [
          st('A', 0, 1, at(1)),
          st('B', 3, 3, at(3), { binder: 'C' }),
          st('C', 2, 2, at(2), { binder: 'A' }),
          st('G', 2, 1, at(1)),
        ],
        3,
        at(3),
      ),
    )
  })

  it('a done task has no binder and is never the binder of the next task in its stream', () => {
    // D/FW done (est 5, ignored) -> finish -1. E/FW 2 -> 0..1, no binder (first real task of FW). F/FW 1 after E ->
    // earliest max(1+1, 2) = 2 -> 2..2, binder E.
    const f = run(
      docOf([
        task('D', 'FW', 5, { status: 'done' }),
        task('E', 'FW', 2),
        task('F', 'FW', 1, { predecessors: ['E'] }),
      ]),
    )
    expect(f).toStrictEqual(
      fc(
        at(0),
        [doneSt('D', at(-1)), st('E', 0, 1, at(1)), st('F', 2, 2, at(2), { binder: 'E' })],
        2,
        at(2),
      ),
    )
    const d = f.tasks[0]
    expect(d && has(d, 'capacityBinder')).toBe(false)
    expect(d && has(d, 'start')).toBe(false)
  })

  it('a gate with estimate >= 1 is an ordinary task: it occupies the stream and binds the next one', () => {
    // A gate/FW 2 -> 0..1 (first of stream, no binder, sf 2). B/FW 1 -> 2..2, binder A.
    const f = run(docOf([gate('A', 'FW', 'fw-integrated', [], { estimateDays: 2 }), task('B', 'FW', 1)]))
    expect(f).toStrictEqual(fc(at(0), [st('A', 0, 1, at(1)), st('B', 2, 2, at(2), { binder: 'A' })], 2, at(2)))
  })
})

describe('selection order and tie-break (ADR-002 §5 steps 2-3)', () => {
  it('the smallest earliest wins before the id tie-break', () => {
    // A/FW 1 after X; X/SPS 3; Z/FW 1.
    // eligible X(0), Z(0) -> X (id): 0..2.
    // eligible A(max(1+2, 0) = 3), Z(0) -> Z, although 'A' < 'Z': Z 0..0 (sf FW 1).
    // A: earliest max(3, 1) = 3 -> 3..3, binder Z. (Picking by id alone would put A at 3..3 first and Z at 4..4.)
    const f = run(
      docOf([task('A', 'FW', 1, { predecessors: ['X'] }), task('X', 'SPS', 3), task('Z', 'FW', 1)]),
    )
    expect(f).toStrictEqual(
      fc(
        at(0),
        [st('A', 3, 3, at(3), { binder: 'Z' }), st('X', 0, 2, at(2)), st('Z', 0, 0, at(0))],
        3,
        at(3),
      ),
    )
  })

  it('earliest is recomputed after streamFree changes (a stale value would pick D before C)', () => {
    // A/FW 3, D/FW 1, P/SPS 2, C/FW 1 after P.
    // 1. eligible A(0), D(0), P(0) -> A: 0..2, sf FW 3.
    // 2. eligible D(max(0,3) = 3), P(0) -> P: 0..1. C becomes eligible.
    // 3. eligible D(3), C(max(1+1, 3) = 3) -> tie, 'C' < 'D' -> C: 3..3, binder A, sf 4.
    // 4. D: earliest 4 -> 4..4, binder C.
    const f = run(
      docOf([
        task('A', 'FW', 3),
        task('D', 'FW', 1),
        task('P', 'SPS', 2),
        task('C', 'FW', 1, { predecessors: ['P'] }),
      ]),
    )
    expect(f).toStrictEqual(
      fc(
        at(0),
        [
          st('A', 0, 2, at(2)),
          st('C', 3, 3, at(3), { binder: 'A' }),
          st('D', 4, 4, at(4), { binder: 'C' }),
          st('P', 0, 1, at(1)),
        ],
        4,
        at(4),
      ),
    )
  })

  it('equal earliest: the smaller id goes first, whatever the input order', () => {
    // B/FW 2 and A/FW 3 listed B first. Both earliest 0 -> A: 0..2, B: 3..4, binder A.
    const expected = fc(at(0), [st('A', 0, 2, at(2)), st('B', 3, 4, at(4), { binder: 'A' })], 4, at(4))
    expect(run(docOf([task('B', 'FW', 2), task('A', 'FW', 3)]))).toStrictEqual(expected)
    expect(run(docOf([task('A', 'FW', 3), task('B', 'FW', 2)]))).toStrictEqual(expected)
  })

  // Pairs where the first id is smaller in code-unit order. Locale or case-insensitive comparison, or code-point
  // comparison, would order some of them the other way round.
  it.each([
    ['B', 'a'], // 66 < 97; localeCompare puts 'a' first
    ['Z', 'a'], // 90 < 97
    ['A', '_'], // 65 < 95; localeCompare puts '_' first
    ['T10', 'T2'], // '1' < '2'
    ['z', '\u00e9'], // 122 < 233; localeCompare puts 'é' first
    ['\u{1F600}', '\uFF5E'], // first code unit 0xD83D < 0xFF5E (code-point order would put U+FF5E first)
  ])('breaks an earliest tie by code units: %j before %j', (first, second) => {
    // `second` (FW 2 days) is listed first, `first` (FW 1 day): both earliest 0 -> `first`: 0..0, `second`: 1..2, binder `first`.
    const f = run(docOf([task(second, 'FW', 2), task(first, 'FW', 1)]))
    expect(f).toStrictEqual(
      fc(at(0), [st(first, 0, 0, at(0)), st(second, 1, 2, at(2), { binder: first })], 2, at(2)),
    )
  })

  it('lists the forecast tasks sorted by id in code-unit order, whatever the input order', () => {
    // code units: B 66, T10 84 49 48, T2 84 50, _ 95, a 97, b 98, é 233, U+1F600 0xD83D 0xDE00, U+FF5E 0xFF5E
    const sorted = ['B', 'T10', 'T2', '_', 'a', 'b', '\u00e9', '\u{1F600}', '\uFF5E']
    const inputOrder = ['b', '\uFF5E', 'T2', 'a', '\u{1F600}', 'B', '_', '\u00e9', 'T10']
    const tasks = inputOrder.map((id) => task(id, STREAMS[inputOrder.indexOf(id) % 4] as string, 1))
    expect(schedule(docOf(tasks)).tasks.map((s: ScheduledTask) => s.id)).toEqual(sorted)
  })

  it('lists done tasks and gates among the sorted tasks too', () => {
    const f = schedule(
      docOf([
        gate('G', 'QA', 'qa-complete', ['C']),
        task('D', 'FW', 1, { status: 'done' }),
        task('C', 'SPS', 1),
        task('A', 'FW', 1),
      ]),
    )
    expect(f.tasks.map((s: ScheduledTask) => s.id)).toEqual(['A', 'C', 'D', 'G'])
  })
})

describe('0-day gates (ADR-002 §3, §5)', () => {
  it('finish one day before the start: A/FW 3 then a gate G: start 3, finish 2 (same moment as A)', () => {
    // A 0..2. G earliest 1+2 = 3 -> start 3, finish 3+0-1 = 2 = Wed 01-07. The release finish is 2.
    expect(run(docOf([task('A', 'FW', 3), gate('G', 'QA', 'qa-complete', ['A'])]))).toStrictEqual(
      fc(at(0), [st('A', 0, 2, at(2)), st('G', 3, 2, at(2))], 2, at(2)),
    )
  })

  it('without predecessors: start 0, finish -1 (the working day before day 0)', () => {
    // G: earliest 1 + (-1) = 0 -> start 0, finish -1 = Fri 2026-01-02. A/SPS 2 -> 0..1 sets the release finish.
    expect(run(docOf([gate('G', 'FW', 'fw-integrated', []), task('A', 'SPS', 2)]))).toStrictEqual(
      fc(at(0), [st('A', 0, 1, at(1)), st('G', 0, -1, at(-1))], 1, at(1)),
    )
  })

  it('ignore streamFree and do not consume capacity: G/FW 0 after B/SPS 2 while A/FW 5 occupies FW', () => {
    // A 0..4 (FW sf 5). B 0..1. G: earliest 1+1 = 2 (streamFree[FW] = 5 ignored) -> start 2, finish 1, no binder.
    expect(
      run(docOf([task('A', 'FW', 5), task('B', 'SPS', 2), gate('G', 'FW', 'fw-integrated', ['B'])])),
    ).toStrictEqual(
      fc(at(0), [st('A', 0, 4, at(4)), st('B', 0, 1, at(1)), st('G', 2, 1, at(1))], 4, at(4)),
    )
  })

  it('finish at the latest predecessor finish: G after A/FW 3 (finish 2) and B/SPS 5 (finish 4)', () => {
    // G earliest 1 + 4 = 5 -> start 5, finish 4 = Fri 01-09 (not Mon 01-12).
    expect(
      run(docOf([task('A', 'FW', 3), task('B', 'SPS', 5), gate('G', 'App', 'app-integration', ['A', 'B'])])),
    ).toStrictEqual(
      fc(at(0), [st('A', 0, 2, at(2)), st('B', 0, 4, at(4)), st('G', 5, 4, at(4))], 4, at(4)),
    )
  })

  it('a chain of gates keeps the same finish and passes it on: A/FW 2 -> G1 -> G2 -> T/App 1', () => {
    // A 0..1. G1: earliest 2 -> start 2, finish 1. G2 after G1: earliest 1+1 = 2 -> start 2, finish 1.
    // T: earliest 1+1 = 2 -> 2..2.
    expect(
      run(
        docOf([
          task('A', 'FW', 2),
          gate('G1', 'SPS', 'fw-integrated', ['A']),
          gate('G2', 'QA', 'security-verified', ['G1']),
          task('T', 'App', 1, { predecessors: ['G2'] }),
        ]),
      ),
    ).toStrictEqual(
      fc(
        at(0),
        [st('A', 0, 1, at(1)), st('G1', 2, 1, at(1)), st('G2', 2, 1, at(1)), st('T', 2, 2, at(2))],
        2,
        at(2),
      ),
    )
  })

  it('does not delay a following task of its stream: T/FW 1 after G (after B/SPS 1) while A/FW 3 runs', () => {
    // A 0..2 (FW sf 3). B 0..0. G: earliest 1 -> start 1, finish 0 (sf ignored, no binder). T: earliest max(1+0, 3) = 3
    // -> 3..3, binder A (G is not a binder).
    expect(
      run(
        docOf([
          task('A', 'FW', 3),
          task('B', 'SPS', 1),
          gate('G', 'FW', 'fw-integrated', ['B']),
          task('T', 'FW', 1, { predecessors: ['G'] }),
        ]),
      ),
    ).toStrictEqual(
      fc(
        at(0),
        [st('A', 0, 2, at(2)), st('B', 0, 0, at(0)), st('G', 1, 0, at(0)), st('T', 3, 3, at(3), { binder: 'A' })],
        3,
        at(3),
      ),
    )
  })
})

describe('done tasks occupy nothing (ADR-002 §2, §5 step 1)', () => {
  it('finish at day -1, have no start, no binder, and do not occupy the stream (even with a big estimate)', () => {
    // D/FW done (est 250, ignored) -> finish -1 = Fri 2026-01-02. E/FW 2 -> 0..1, no binder.
    const f = run(docOf([task('D', 'FW', 250, { status: 'done' }), task('E', 'FW', 2)]))
    expect(f).toStrictEqual(fc(at(0), [doneSt('D', at(-1)), st('E', 0, 1, at(1))], 1, at(1)))
    const d = f.tasks[0]
    expect(d && has(d, 'start')).toBe(false)
    expect(d && has(d, 'capacityBinder')).toBe(false)
    const e = f.tasks[1]
    expect(e && has(e, 'capacityBinder')).toBe(false)
  })

  it('a successor of a done task can start on day 0', () => {
    // D done -> finish -1. S/SPS 2 after D: earliest 1 + (-1) = 0 -> 0..1.
    expect(
      run(docOf([task('D', 'FW', 4, { status: 'done' }), task('S', 'SPS', 2, { predecessors: ['D'] })])),
    ).toStrictEqual(fc(at(0), [doneSt('D', at(-1)), st('S', 0, 1, at(1))], 1, at(1)))
  })

  it('only open predecessors delay a successor: S/App 2 after D (done) and X/SPS 3', () => {
    // X 0..2. S earliest 1 + max(-1, 2) = 3 -> 3..4.
    expect(
      run(
        docOf([
          task('D', 'FW', 2, { status: 'done' }),
          task('X', 'SPS', 3),
          task('S', 'App', 2, { predecessors: ['D', 'X'] }),
        ]),
      ),
    ).toStrictEqual(
      fc(at(0), [doneSt('D', at(-1)), st('S', 3, 4, at(4)), st('X', 0, 2, at(2))], 4, at(4)),
    )
  })

  it('a done task with an open predecessor still finishes at -1 (status reports may lag)', () => {
    // P/FW 3 -> 0..2. D/SPS done after P -> finish -1. S/App 1 after D: earliest 0 -> 0..0 (not after P).
    expect(
      run(
        docOf([
          task('P', 'FW', 3),
          task('D', 'SPS', 2, { status: 'done', predecessors: ['P'] }),
          task('S', 'App', 1, { predecessors: ['D'] }),
        ]),
      ),
    ).toStrictEqual(
      fc(at(0), [doneSt('D', at(-1)), st('P', 0, 2, at(2)), st('S', 0, 0, at(0))], 2, at(2)),
    )
  })

  it('a done 0-day gate also finishes at -1 without a start', () => {
    // G done -> finish -1. A/FW 1 after G: earliest 0 -> 0..0.
    expect(
      run(docOf([gate('G', 'FW', 'fw-integrated', [], { status: 'done' }), task('A', 'FW', 1, { predecessors: ['G'] })])),
    ).toStrictEqual(fc(at(0), [st('A', 0, 0, at(0)), doneSt('G', at(-1))], 0, at(0)))
  })

  it('when every task is done the release finish is -1, the working day before day 0', () => {
    // A, B done -> both -1; the release finish is the max = -1 = Fri 2026-01-02.
    expect(
      run(
        docOf([
          task('A', 'FW', 3, { status: 'done' }),
          task('B', 'SPS', 2, { status: 'done', predecessors: ['A'] }),
        ]),
      ),
    ).toStrictEqual(fc(at(0), [doneSt('A', at(-1)), doneSt('B', at(-1))], -1, at(-1)))
  })
})

describe('release finish (ADR-002 §6)', () => {
  it('is the latest task finish, not the finish of the last task by id or of the last scheduled task', () => {
    // A/FW 2 (0..1), B/SPS 5 (0..4), C/App 1 (0..0): max finish = 4 (Fri 01-09)
    expect(run(docOf([task('A', 'FW', 2), task('B', 'SPS', 5), task('C', 'App', 1)]))).toStrictEqual(
      fc(at(0), [st('A', 0, 1, at(1)), st('B', 0, 4, at(4)), st('C', 0, 0, at(0))], 4, at(4)),
    )
  })

  it('has the date of its finish index, across a weekend: A/FW 6 finishes on index 5 = Mon 01-12', () => {
    const f = run(docOf([task('A', 'FW', 6), task('B', 'SPS', 1)]))
    expect(f.finish).toBe(5)
    expect(f.finishDate).toBe('2026-01-12')
  })
})

describe('target dates are compared, never constraints (ADR-002 §6)', () => {
  // A/FW 2, B/FW 3, C/SPS 1 after A.
  // A 0..1 (sf 2). eligible B(2), C(2) -> tie, B: 2..4, binder A. C: earliest 2 -> 2..2, no binder.
  const plain = (): Task[] => [
    task('A', 'FW', 2),
    task('B', 'FW', 3),
    task('C', 'SPS', 1, { predecessors: ['A'] }),
  ]
  const plainExpected = fc(
    at(0),
    [st('A', 0, 1, at(1)), st('B', 2, 4, at(4), { binder: 'A' }), st('C', 2, 2, at(2))],
    4,
    at(4),
  )

  it('baseline without any target date', () => {
    expect(run(docOf(plain()))).toStrictEqual(plainExpected)
  })

  it.each([
    ['all targets long before the forecast', '2025-01-01'],
    ['all targets long after the forecast', '2030-01-01'],
    ['all targets on a Saturday', '2026-01-10'],
    ['all targets on the first working day', '2026-01-05'],
  ])('%s: start, finish, finishDate and capacityBinder are unchanged', (_name, target) => {
    const tasks = plain().map((t) => ({ ...t, targetDate: target }))
    const f = run(docOf(tasks, { startDate: MON, targetDate: target }))
    expect(withoutSlip(f)).toStrictEqual(plainExpected)
  })

  it('a done task with a target date is not moved either', () => {
    // D/FW done with a target: still finish -1, no start, and E/FW 2 starts at 0.
    const f = run(
      docOf([task('D', 'FW', 3, { status: 'done', targetDate: '2026-02-27' }), task('E', 'FW', 2, { targetDate: '2026-01-05' })]),
    )
    expect(withoutSlip(f)).toStrictEqual(fc(at(0), [doneSt('D', at(-1)), st('E', 0, 1, at(1))], 1, at(1)))
  })

  it('a missing target leaves slipDays absent for the task and for the release', () => {
    const f = run(docOf([task('A', 'FW', 2)]))
    expect(has(f, 'slipDays')).toBe(false)
    expect(f.tasks.some((s: ScheduledTask) => has(s, 'slipDays'))).toBe(false)
  })

  it('task slipDays only on tasks with a targetDate; release slipDays only with a release targetDate', () => {
    // A/FW 2 (finish Tue 01-06) has a target, B/SPS 2 has none; the release has none.
    const taskOnly = run(docOf([task('A', 'FW', 2, { targetDate: '2026-01-06' }), task('B', 'SPS', 2)]))
    expect(taskOnly.tasks.map((s: ScheduledTask) => [s.id, has(s, 'slipDays')])).toEqual([
      ['A', true],
      ['B', false],
    ])
    expect(has(taskOnly, 'slipDays')).toBe(false)
    // Only the release has a target.
    const releaseOnly = run(docOf([task('A', 'FW', 2), task('B', 'SPS', 2)], { startDate: MON, targetDate: '2026-01-06' }))
    expect(releaseOnly.tasks.some((s: ScheduledTask) => has(s, 'slipDays'))).toBe(false)
    expect(releaseOnly.slipDays).toBe(0)
  })

  // A single task A/FW d finishes on index d-1; the release finish is the same, so both slips are equal.
  it.each([
    // [label, estimate, finish date (by hand), target, expected slip]
    ['late by two working days', 3, '2026-01-07', '2026-01-05', 2], // (Mon 05, Wed 07] = Tue, Wed
    ['late across a weekend', 6, '2026-01-12', '2026-01-08', 2], // (Thu 08, Mon 12] = Fri, Mon
    ['early by three working days', 2, '2026-01-06', '2026-01-09', -3], // (Tue 06, Fri 09] = Wed, Thu, Fri
    ['early across a weekend', 2, '2026-01-06', '2026-01-13', -5], // (Tue 06, Tue 13] = Wed, Thu, Fri, Mon, Tue
    ['on time', 4, '2026-01-08', '2026-01-08', 0],
    ['Saturday target, Friday finish', 5, '2026-01-09', '2026-01-10', 0],
    ['Sunday target, Friday finish', 5, '2026-01-09', '2026-01-11', 0],
    ['Saturday target, Monday finish', 6, '2026-01-12', '2026-01-10', 1],
    ['Saturday target, Tuesday finish', 7, '2026-01-13', '2026-01-10', 2],
    ['Sunday target, Thursday finish', 4, '2026-01-08', '2026-01-11', -1], // (Thu 08, Sun 11] = Fri
  ])('slipDays: %s', (_name, estimate, finishDate, target, expectedSlip) => {
    const f = run(docOf([task('A', 'FW', estimate, { targetDate: target })], { startDate: MON, targetDate: target }))
    expect(f).toStrictEqual(
      fc(at(0), [st('A', 0, estimate - 1, finishDate, { slip: expectedSlip })], estimate - 1, finishDate, expectedSlip),
    )
  })

  it('the release slip compares the release finish (the latest) with the release target, each task with its own target', () => {
    // A/FW 3: 0..2 (Wed 01-07), target Wed 07 -> 0. B/SPS 5: 0..4 (Fri 01-09), target Mon 12 -> -1 ((Fri, Mon] = Mon).
    // Release finish 4 = Fri 09, target Wed 07 -> +2 (Thu, Fri).
    const f = run(
      docOf([task('A', 'FW', 3, { targetDate: '2026-01-07' }), task('B', 'SPS', 5, { targetDate: '2026-01-12' })], {
        startDate: MON,
        targetDate: '2026-01-07',
      }),
    )
    expect(f).toStrictEqual(
      fc(at(0), [st('A', 0, 2, at(2), { slip: 0 }), st('B', 0, 4, at(4), { slip: -1 })], 4, at(4), 2),
    )
  })

  it('with a Saturday start the slip is measured from the Monday schedule: A/FW 1 finishes Mon 2026-01-12', () => {
    // target Fri 01-09 -> finish Mon 12 is 1 working day late; target Mon 12 -> 0.
    const late = run(docOf([task('A', 'FW', 1, { targetDate: '2026-01-09' })], { startDate: '2026-01-10' }))
    expect(late).toStrictEqual(fc('2026-01-12', [st('A', 0, 0, '2026-01-12', { slip: 1 })], 0, '2026-01-12'))
    const onTime = run(docOf([task('A', 'FW', 1, { targetDate: '2026-01-12' })], { startDate: '2026-01-10', targetDate: '2026-01-12' }))
    expect(onTime).toStrictEqual(fc('2026-01-12', [st('A', 0, 0, '2026-01-12', { slip: 0 })], 0, '2026-01-12', 0))
  })

  it('a longer task: A/FW 8 finishes Wed 2026-01-14 (index 7), target Fri 01-09 -> 3 working days late (Mon, Tue, Wed)', () => {
    const f = run(docOf([task('A', 'FW', 8, { targetDate: '2026-01-09' })]))
    expect(f).toStrictEqual(fc(at(0), [st('A', 0, 7, '2026-01-14', { slip: 3 })], 7, '2026-01-14'))
  })
})

describe('ADR-002 §7 worked example', () => {
  // A/FW 2 days, B/App 1 day, gate G/FW 0 days after B, T/FW 1 day after G.
  // eligible A(0), B(0) -> A: 0..1 (FW sf 2). Then B(0) -> B: 0..0 (App sf 1). G becomes eligible: earliest 1+0 = 1
  // (FW streamFree 2 is ignored) -> start 1, finish 0. T: earliest max(1+0, 2) = 2 -> 2..2, binder A (finish 1 = 2-1).
  const example = (): Task[] => [
    task('A', 'FW', 2),
    task('B', 'App', 1),
    gate('G', 'FW', 'fw-integrated', ['B']),
    task('T', 'FW', 1, { predecessors: ['G'] }),
  ]
  const expected = fc(
    at(0),
    [st('A', 0, 1, at(1)), st('B', 0, 0, at(0)), st('G', 1, 0, at(0)), st('T', 2, 2, at(2), { binder: 'A' })],
    2,
    at(2),
  )

  it('gives A [0,1], B [0,0], G start 1 / finish 0, T [2,2] with T capacity-bound by A', () => {
    expect(run(docOf(example()))).toStrictEqual(expected)
  })

  it('is the same for every input order', () => {
    for (const order of permutations(example())) expect(run(docOf(order))).toStrictEqual(expected)
  })

  it('T has no binder other than A and G has none at all', () => {
    const f = run(docOf(example()))
    const byId = new Map<string, ScheduledTask>(f.tasks.map((s: ScheduledTask) => [s.id, s]))
    expect(byId.get('T')?.capacityBinder).toBe('A')
    expect(has(byId.get('G') ?? {}, 'capacityBinder')).toBe(false)
    expect(has(byId.get('B') ?? {}, 'capacityBinder')).toBe(false)
  })
})

// ================================================================= determinism

/**
 * Seven tasks, start Saturday 2026-01-10 (day 0 = Monday 2026-01-12, table offset +5), release target Tue 2026-01-20.
 *   A FW 3          target Tue 01-13
 *   B FW 2
 *   C SPS 4 after A
 *   D QA done (estimate 9, ignored)
 *   E App 2 after D, B
 *   F QA 1 after C, E   target Fri 01-23
 *   G qa-complete gate/QA 0 after F
 * Derivation:
 *   D done -> -1 (Fri 2026-01-09).
 *   eligible A(0), B(0) -> A: 0..2, FW sf 3.
 *   eligible B(max(0,3) = 3), C(1+2 = 3) -> tie, B: 3..4, binder A, FW sf 5.
 *   eligible C(3), E(1+4 = 5) -> C: 3..6 (SPS sf 7). E: 5..6 (App sf 7).
 *   F: earliest 1 + max(6, 6) = 7; QA sf 0 (D is done) -> 7..7, no binder.
 *   G: earliest 1 + 7 = 8 -> start 8, finish 7. Release finish 7.
 * Dates, day i = at(i + 5): A 2 -> 01-14, B 4 -> 01-16, C 6 -> 01-20, D -1 -> 01-09, E 6 -> 01-20, F 7 -> 01-21,
 * G 7 -> 01-21.
 * Slips: A target Tue 13, finish Wed 14 -> +1. F target Fri 23, finish Wed 21 -> -2 (Thu, Fri).
 * Release target Tue 20, finish Wed 21 -> +1.
 */
const SHUF_RELEASE: Release = { startDate: '2026-01-10', targetDate: '2026-01-20' }
const shufTasks = (reversePredecessors = false): Task[] => {
  const preds = (...ids: string[]): string[] => (reversePredecessors ? [...ids].reverse() : ids)
  return [
    task('A', 'FW', 3, { targetDate: '2026-01-13' }),
    task('B', 'FW', 2),
    task('C', 'SPS', 4, { predecessors: ['A'] }),
    task('D', 'QA', 9, { status: 'done' }),
    task('E', 'App', 2, { predecessors: preds('D', 'B') }),
    task('F', 'QA', 1, { predecessors: preds('C', 'E'), targetDate: '2026-01-23' }),
    gate('G', 'QA', 'qa-complete', ['F']),
  ]
}
const SHUF_EXPECTED = fc(
  at(5),
  [
    st('A', 0, 2, at(5 + 2), { slip: 1 }),
    st('B', 3, 4, at(5 + 4), { binder: 'A' }),
    st('C', 3, 6, at(5 + 6)),
    doneSt('D', at(5 - 1)),
    st('E', 5, 6, at(5 + 6)),
    st('F', 7, 7, at(5 + 7), { slip: -2 }),
    st('G', 8, 7, at(5 + 7)),
  ],
  7,
  at(5 + 7),
  1,
)

describe('determinism (ADR-002 §1, §5)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('the seven-task document gives the hand-derived forecast', () => {
    expect(run(docOf(shufTasks(), SHUF_RELEASE))).toStrictEqual(SHUF_EXPECTED)
  })

  it('shuffling the task order (all 5040 permutations) and the predecessor lists gives a byte-identical forecast', () => {
    const baseline = JSON.stringify(schedule(docOf(shufTasks(), SHUF_RELEASE)))
    // the baseline is the hand-derived forecast (same fields; the key order is the implementation's own)
    expect(JSON.parse(baseline)).toEqual(JSON.parse(JSON.stringify(SHUF_EXPECTED)))
    for (const reverse of [false, true]) {
      for (const order of permutations(shufTasks(reverse))) {
        const json = JSON.stringify(schedule(docOf(order, SHUF_RELEASE)))
        if (json !== baseline) {
          throw new Error(`forecast differs for task order ${order.map((t) => t.id).join('')} (reversed predecessors: ${reverse})`)
        }
      }
    }
  }, 60_000)

  it('shuffling does not change a tie-heavy document: five FW tasks with equal earliest', () => {
    // T1..T5 (2, 2, 1, 1, 1 days), no dependencies, one stream: every earliest is tied at each step, so the ids decide.
    // T1 0..1; T2 earliest 2 -> 2..3; T3 4..4; T4 5..5; T5 6..6, each bound by the previous one.
    const estimates: Record<string, number> = { T1: 2, T2: 2, T3: 1, T4: 1, T5: 1 }
    const mk = (ids: string[]): Task[] => ids.map((id) => task(id, 'FW', estimates[id] as number))
    const expected = fc(
      at(0),
      [
        st('T1', 0, 1, at(1)),
        st('T2', 2, 3, at(3), { binder: 'T1' }),
        st('T3', 4, 4, at(4), { binder: 'T2' }),
        st('T4', 5, 5, at(5), { binder: 'T3' }),
        st('T5', 6, 6, at(6), { binder: 'T4' }),
      ],
      6,
      at(6),
    )
    for (const order of permutations(['T3', 'T1', 'T5', 'T2', 'T4'])) {
      expect(run(docOf(mk(order))), order.join(',')).toStrictEqual(expected)
    }
  })

  it('the same document gives byte-identical output twice and is not modified', () => {
    const frozen = deepFreeze(docOf(shufTasks(), SHUF_RELEASE))
    const before = JSON.stringify(frozen)
    const first = JSON.stringify(schedule(frozen))
    const second = JSON.stringify(schedule(frozen))
    expect(second).toBe(first)
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('does not depend on the current date', () => {
    const forecasts = ['2001-01-01T00:00:00Z', '2026-01-10T12:00:00Z', '2099-12-31T23:59:59Z'].map((now) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(now))
      const json = JSON.stringify(schedule(docOf(shufTasks(), SHUF_RELEASE)))
      vi.useRealTimers()
      return json
    })
    expect(new Set(forecasts).size).toBe(1)
  })
})

describe('invariants on seeded random documents (ADR-002 §3-§6)', () => {
  /** mulberry32: a small deterministic PRNG, so the documents are the same on every run. */
  function prng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function randomDocument(seed: number): ReleaseDocument {
    const rnd = prng(seed)
    const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1))
    const n = int(6, 12)
    const prefixes = ['T', 'a', 'Z', '_', 'b']
    const streams = ['FW', 'SPS', 'App', 'QA']
    let gatesUsed = 0
    const ids: string[] = []
    const tasks: Task[] = []
    for (let i = 0; i < n; i++) {
      const id = `${prefixes[int(0, prefixes.length - 1)]}${int(0, 9)}${String.fromCharCode(97 + i)}`
      const predecessors = ids.filter(() => rnd() < 0.25)
      const kind = rnd()
      const over: Partial<Task> = { predecessors }
      let estimate = int(1, 5)
      if (kind < 0.12 && gatesUsed < GATES.length) {
        over.gate = GATES[gatesUsed]
        gatesUsed++
        estimate = 0
      } else if (kind < 0.3) {
        over.status = 'done'
      } else if (kind < 0.4) {
        over.status = 'in_progress'
      }
      if (rnd() < 0.5) over.targetDate = plusDays('2026-01-05', int(0, 40))
      ids.push(id)
      tasks.push(task(id, streams[int(0, streams.length - 1)] as string, estimate, over))
    }
    const release: Release = { startDate: plusDays('2026-01-05', int(0, 13)) }
    if (rnd() < 0.7) release.targetDate = plusDays('2026-01-05', int(0, 40))
    return docOf(tasks, release)
  }

  /** The rules of §3-§6 that hold for every schedule, whatever the selection order. */
  function checkInvariants(document: ReleaseDocument, forecast: Forecast, label: string): void {
    const day0 = firstWorkingDay(document.release.startDate)
    expect(forecast.day0, label).toBe(day0)
    expect(forecast.tasks.map((s: ScheduledTask) => s.id), label).toEqual(document.tasks.map((t) => t.id).sort())
    const byId = new Map<string, ScheduledTask>(forecast.tasks.map((s: ScheduledTask) => [s.id, s]))
    const get = (id: string): ScheduledTask => {
      const s = byId.get(id)
      if (!s) throw new Error(`${label}: no scheduled task ${id}`)
      return s
    }
    const ordinary = document.tasks.filter((t) => t.status !== 'done' && t.estimateDays >= 1)
    for (const t of document.tasks) {
      const s = get(t.id)
      const where = `${label} task ${t.id}`
      expect(s.finishDate, where).toBe(workingDayDate(day0, s.finish))
      if (t.status === 'done') {
        expect(s.finish, where).toBe(-1)
        expect(has(s, 'start'), where).toBe(false)
        expect(has(s, 'capacityBinder'), where).toBe(false)
      } else {
        const start = s.start
        expect(start, where).toBeTypeOf('number')
        if (start === undefined) continue
        expect(s.finish, where).toBe(start + t.estimateDays - 1)
        const bound = 1 + Math.max(-1, ...t.predecessors.map((p) => get(p).finish))
        if (t.estimateDays === 0) {
          expect(start, where).toBe(bound)
          expect(has(s, 'capacityBinder'), where).toBe(false)
        } else {
          // the previous real task of the stream (largest start below this start) sets streamFree
          const before = ordinary
            .filter((o) => o.stream === t.stream && o.id !== t.id)
            .map((o) => get(o.id))
            .filter((o) => (o.start ?? Infinity) < start)
            .sort((x, y) => (y.start ?? 0) - (x.start ?? 0))
          const previous = before[0]
          if (previous === undefined) {
            expect(has(s, 'capacityBinder'), where).toBe(false)
            expect(start, where).toBe(bound)
          } else {
            expect(s.capacityBinder, where).toBe(previous.id)
            expect(start, where).toBe(Math.max(bound, previous.finish + 1))
          }
        }
      }
      if (t.targetDate !== undefined && t.status !== 'done') expect(s.slipDays, where).toBe(slipDays(t.targetDate, s.finishDate) + 0)
      if (t.targetDate === undefined) expect(has(s, 'slipDays'), where).toBe(false)
    }
    // capacity: the real tasks of a stream never overlap
    for (const stream of STREAMS) {
      const mine = ordinary.filter((t) => t.stream === stream).map((t) => get(t.id))
      mine.sort((x, y) => (x.start ?? 0) - (y.start ?? 0))
      for (let i = 1; i < mine.length; i++) {
        expect(mine[i]?.start, `${label} stream ${stream}`).toBeGreaterThan((mine[i - 1] as ScheduledTask).finish)
      }
    }
    const finish = Math.max(...forecast.tasks.map((s: ScheduledTask) => s.finish))
    expect(forecast.finish, label).toBe(finish)
    expect(forecast.finishDate, label).toBe(workingDayDate(day0, finish))
    if (document.release.targetDate === undefined) expect(has(forecast, 'slipDays'), label).toBe(false)
    else expect(forecast.slipDays, label).toBe(slipDays(document.release.targetDate, forecast.finishDate) + 0)
  }

  it('150 documents: every rule invariant holds and four reorderings give a byte-identical forecast', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const document = randomDocument(seed)
      const forecast = canon(schedule(document))
      checkInvariants(document, forecast, `seed ${seed}`)
      const baseline = JSON.stringify(schedule(document))
      const tasks = document.tasks
      const variants: Task[][] = [
        [...tasks].reverse(),
        [...tasks.slice(3), ...tasks.slice(0, 3)],
        [...tasks.filter((_, i) => i % 2 === 0), ...tasks.filter((_, i) => i % 2 === 1)].reverse(),
        [...tasks].reverse().map((t) => ({ ...t, predecessors: [...t.predecessors].reverse() })),
      ]
      variants.forEach((variant, k) => {
        const json = JSON.stringify(schedule({ ...document, tasks: variant, workstreams: [...document.workstreams].reverse() }))
        if (json !== baseline) throw new Error(`seed ${seed}: reordering ${k} changes the forecast`)
      })
    }
  }, 60_000)
})

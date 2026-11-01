/**
 * Independent QA acceptance tests for issue #6 "P1-2: Document validation".
 *
 * Black-box, written from ADR-002 (§2, §8, §9, "Data the scheduler sees"), src/domain/types.ts and the issue's
 * acceptance criteria only. They assert `ok`, `code`, `taskId`, `cycle` and the two messages the contract fixes
 * exactly (unknown predecessor, cycle). They never assert any other message or the order of the error list.
 *
 * Most "single fault" tests expect the error codes to be exactly the one injected, which also proves that a rule
 * does not raise spurious extra errors.
 */
import { describe, expect, it } from 'vitest'
import { isIsoDate, validateDocument, type ValidationError } from '../../src/domain/validate'

// ---------------------------------------------------------------- helpers

type Obj = Record<string, unknown>

/** A valid ordinary task; `over` replaces fields, `undefined` keeps the key present with an undefined value. */
function task(over: Obj = {}): Obj {
  return {
    id: 'T1',
    title: 'Task',
    stream: 'FW',
    ownerRole: 'owner',
    status: 'todo',
    estimateDays: 1,
    predecessors: [],
    ...over,
  }
}

/** A task with the key `key` removed (not just undefined). */
function taskWithout(key: string, over: Obj = {}): Obj {
  const t = task(over)
  delete t[key]
  return t
}

/** A document that is valid unless `over` replaces top-level fields. */
function doc(tasks: unknown[], over: Obj = {}): Obj {
  return {
    schemaVersion: 1,
    release: { startDate: '2026-01-05' },
    workstreams: ['FW', 'QA'],
    tasks,
    ...over,
  }
}

/** Task `id` with the given predecessors, otherwise valid. */
function node(id: string, predecessors: string[] = [], over: Obj = {}): Obj {
  return task({ id, predecessors, ...over })
}

function errorsOf(input: unknown): ValidationError[] {
  const result = validateDocument(input)
  if (result.ok) throw new Error('expected validation to fail, but it succeeded')
  return result.errors
}

/** Sorted error codes, one entry per error. */
function codesOf(input: unknown): string[] {
  return errorsOf(input)
    .map((e) => e.code)
    .sort()
}

function cycleErrors(input: unknown): ValidationError[] {
  return errorsOf(input).filter((e) => e.code === 'cycle')
}

/** All permutations of `items` (Heap-free recursive version; inputs here have at most 5 items). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()]
  const out: T[][] = []
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([item, ...p])
  })
  return out
}

/** Expect `input` to be rejected with exactly one error of `code`, on `taskId` when given. */
function expectSingle(input: unknown, code: string, taskId?: string): void {
  const errors = errorsOf(input)
  expect(errors.map((e) => e.code)).toEqual([code])
  if (taskId !== undefined) expect(errors[0]?.taskId).toBe(taskId)
}

// ---------------------------------------------------------------- valid documents

describe('valid documents', () => {
  it('accepts a minimal valid document and returns the very same object', () => {
    const input = doc([task()])
    const result = validateDocument(input)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document).toBe(input)
  })

  it('accepts a full valid document: four gates, targets, dependencies across streams, every status', () => {
    const input = doc(
      [
        node('FW-1', [], { stream: 'FW', status: 'done', estimateDays: 3, targetDate: '2026-01-09' }),
        node('FW-2', ['FW-1'], { stream: 'FW', status: 'in_progress', estimateDays: 250 }),
        node('G-FW', ['FW-2'], { stream: 'FW', estimateDays: 0, gate: 'fw-integrated', targetDate: '2026-02-27' }),
        node('G-SEC', ['FW-2'], { stream: 'QA', estimateDays: 0, gate: 'security-verified' }),
        node('G-APP', ['G-FW', 'G-SEC'], { stream: 'QA', estimateDays: 0, gate: 'app-integration' }),
        node('G-QA', ['G-APP'], { stream: 'QA', estimateDays: 0, gate: 'qa-complete' }),
      ],
      { release: { startDate: '2026-01-05', targetDate: '2026-03-31' } },
    )
    const result = validateDocument(input)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document).toBe(input)
  })

  it('accepts a diamond-shaped DAG (a shared predecessor is not a cycle)', () => {
    const input = doc([node('A'), node('B', ['A']), node('C', ['A']), node('D', ['B', 'C'])])
    expect(validateDocument(input).ok).toBe(true)
  })

  it('accepts a long chain', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `T${String(i).padStart(3, '0')}`)
    const input = doc(ids.map((id, i) => node(id, i === 0 ? [] : [ids[i - 1] as string])))
    expect(validateDocument(input).ok).toBe(true)
  })

  it('does not reject a task without a gate (ADR-002 §8: a missing gate is not a validation error)', () => {
    expect(validateDocument(doc([task({ id: 'A' }), task({ id: 'B' })])).ok).toBe(true)
  })

  it('does not reject a document with only some of the four gates defined', () => {
    const input = doc([node('G1', [], { gate: 'fw-integrated', estimateDays: 0 }), node('T')])
    expect(validateDocument(input).ok).toBe(true)
  })

  it('accepts empty title and empty ownerRole (§ contract: empty strings are allowed)', () => {
    expect(validateDocument(doc([task({ title: '', ownerRole: '' })])).ok).toBe(true)
  })

  it('accepts a weekend startDate (ADR-002 §1 moves day 0 to Monday, it is not a validation error)', () => {
    // 2026-01-03 is a Saturday, 2026-01-04 a Sunday.
    expect(validateDocument(doc([task()], { release: { startDate: '2026-01-03' } })).ok).toBe(true)
    expect(validateDocument(doc([task()], { release: { startDate: '2026-01-04' } })).ok).toBe(true)
  })

  it('accepts valid release and task targetDates, including a leap day', () => {
    const input = doc([task({ targetDate: '2028-02-29' })], { release: { startDate: '2026-01-05', targetDate: '2026-12-31' } })
    expect(validateDocument(input).ok).toBe(true)
  })

  it('does not mutate the input, whether it is accepted or rejected', () => {
    const good = doc([node('A'), node('B', ['A'])])
    const goodCopy = structuredClone(good)
    validateDocument(good)
    expect(good).toEqual(goodCopy)

    const bad = doc([node('A', ['B']), node('B', ['A']), task({ id: 'C', estimateDays: 1.5, stream: 'x' })])
    const badCopy = structuredClone(bad)
    validateDocument(bad)
    expect(bad).toEqual(badCopy)
  })
})

// ---------------------------------------------------------------- document level

describe('document level (invalid-document, invalid-schema-version, invalid-workstreams)', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'release'],
    ['a boolean', true],
  ])('rejects a non-object input (%s) as invalid-document', (_label, input) => {
    const result = validateDocument(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e: ValidationError) => e.code)).toContain('invalid-document')
  })

  it.each<[string, unknown]>([
    ['2', 2],
    ['0', 0],
    ['the string "1"', '1'],
    ['null', null],
    ['missing', undefined],
  ])('rejects schemaVersion %s as invalid-schema-version', (_label, version) => {
    const input = doc([task()], { schemaVersion: version })
    expectSingle(input, 'invalid-schema-version')
  })

  it('rejects a document without a schemaVersion key', () => {
    const input = doc([task()])
    delete input.schemaVersion
    expectSingle(input, 'invalid-schema-version')
  })

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['null', null],
    ['a string', 'FW'],
    ['an object', { FW: true }],
    ['an array with a number', ['FW', 1]],
    ['an array with null', ['FW', null]],
    ['an array of arrays', [['FW']]],
  ])('rejects workstreams that are %s as invalid-workstreams', (_label, workstreams) => {
    const input = doc([task()], { workstreams })
    const result = validateDocument(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e: ValidationError) => e.code)).toContain('invalid-workstreams')
  })

  it('treats an empty workstreams list as a valid string[] (every task stream is then unknown)', () => {
    expectSingle(doc([task()], { workstreams: [] }), 'unknown-stream', 'T1')
  })
})

// ---------------------------------------------------------------- dates

describe('dates (invalid-start-date, invalid-target-date)', () => {
  it.each<[string, unknown]>([
    ['missing', undefined],
    ['empty', ''],
    ['not a calendar day: 2026-02-30', '2026-02-30'],
    ['not a calendar day: 2026-02-29 (not a leap year)', '2026-02-29'],
    ['not a calendar day: 2026-04-31', '2026-04-31'],
    ['month 13', '2026-13-01'],
    ['month 00', '2026-00-10'],
    ['day 00', '2026-01-00'],
    ['not zero padded', '2026-1-5'],
    ['wrong order DD/MM/YYYY', '05/01/2026'],
    ['compact 20260105', '20260105'],
    ['a date-time', '2026-01-05T00:00:00Z'],
    ['surrounded by spaces', ' 2026-01-05 '],
    ['a number', 20260105],
    ['null', null],
    ['a Date object', new Date('2026-01-05')],
  ])('rejects a startDate that is %s as invalid-start-date', (_label, startDate) => {
    expectSingle(doc([task()], { release: { startDate } }), 'invalid-start-date')
  })

  it('rejects a release without startDate', () => {
    expectSingle(doc([task()], { release: {} }), 'invalid-start-date')
  })

  it('rejects a release targetDate that is present but invalid as invalid-target-date', () => {
    for (const targetDate of ['2026-02-30', 'soon', '2026-1-5', 20260105]) {
      expectSingle(doc([task()], { release: { startDate: '2026-01-05', targetDate } }), 'invalid-target-date')
    }
  })

  it('allows an absent release targetDate', () => {
    expect(validateDocument(doc([task()], { release: { startDate: '2026-01-05' } })).ok).toBe(true)
  })

  it('rejects a task targetDate that is present but invalid, naming the task', () => {
    for (const targetDate of ['2026-02-30', '2026-13-01', 'next week', '31/12/2026', 20260105]) {
      expectSingle(doc([task({ id: 'A', targetDate })]), 'invalid-target-date', 'A')
    }
  })

  it('reports an invalid startDate and an invalid release targetDate together', () => {
    const input = doc([task()], { release: { startDate: 'x', targetDate: 'y' } })
    expect(codesOf(input)).toEqual(['invalid-start-date', 'invalid-target-date'])
  })

  it('reports an invalid release targetDate and an invalid task targetDate as two errors', () => {
    const input = doc([task({ id: 'A', targetDate: 'bad' })], { release: { startDate: '2026-01-05', targetDate: 'bad' } })
    expect(codesOf(input)).toEqual(['invalid-target-date', 'invalid-target-date'])
  })
})

describe('isIsoDate', () => {
  it.each(['2026-01-05', '2026-12-31', '2024-02-29', '2000-02-29', '1999-01-01', '2026-02-28'])('accepts %s', (value) => {
    expect(isIsoDate(value)).toBe(true)
  })

  it.each<[string, unknown]>([
    ['2026-02-29 (not a leap year)', '2026-02-29'],
    ['2100-02-29 (century, not a leap year)', '2100-02-29'],
    ['2026-02-30', '2026-02-30'],
    ['2026-04-31', '2026-04-31'],
    ['2026-06-31', '2026-06-31'],
    ['2026-13-01', '2026-13-01'],
    ['2026-00-10', '2026-00-10'],
    ['2026-01-00', '2026-01-00'],
    ['2026-01-32', '2026-01-32'],
    ['2026-1-5', '2026-1-5'],
    ['26-01-05', '26-01-05'],
    ['5-digit year', '12026-01-05'],
    ['20260105', '20260105'],
    ['2026/01/05', '2026/01/05'],
    ['a date-time', '2026-01-05T00:00:00Z'],
    ['trailing space', '2026-01-05 '],
    ['leading space', ' 2026-01-05'],
    ['empty string', ''],
    ['a word', 'tomorrow'],
    ['a number', 20260105],
    ['null', null],
    ['undefined', undefined],
    ['a Date', new Date('2026-01-05')],
    ['an object', {}],
    ['an array', ['2026-01-05']],
    ['a boolean', true],
  ])('rejects %s', (_label, value) => {
    expect(isIsoDate(value)).toBe(false)
  })
})

// ---------------------------------------------------------------- id rules

describe('ids (missing-id, duplicate-id)', () => {
  it.each<[string, Obj]>([
    ['the key is missing', taskWithout('id')],
    ['id is undefined', task({ id: undefined })],
    ['id is an empty string', task({ id: '' })],
    ['id is a number', task({ id: 5 })],
    ['id is null', task({ id: null })],
    ['id is an object', task({ id: {} })],
  ])('rejects a task whose %s as missing-id', (_label, bad) => {
    expectSingle(doc([bad]), 'missing-id')
  })

  it('reports one missing-id per task that has no usable id, next to valid tasks', () => {
    const input = doc([taskWithout('id'), node('OK'), task({ id: '' })])
    expect(codesOf(input)).toEqual(['missing-id', 'missing-id'])
  })

  it('rejects a duplicated id as one duplicate-id', () => {
    expect(codesOf(doc([node('A'), node('A')]))).toEqual(['duplicate-id'])
  })

  it('reports an id used three times as one duplicate-id (one error per duplicated value)', () => {
    expect(codesOf(doc([node('A'), node('A'), node('A')]))).toEqual(['duplicate-id'])
  })

  it('reports each duplicated id value once', () => {
    expect(codesOf(doc([node('A'), node('A'), node('B'), node('B'), node('C')]))).toEqual(['duplicate-id', 'duplicate-id'])
  })

  it('treats ids as case-sensitive: A and a are different ids', () => {
    expect(validateDocument(doc([node('A'), node('a')])).ok).toBe(true)
  })
})

// ---------------------------------------------------------------- field rules

describe('task entries and text fields (invalid-task, invalid-title, invalid-owner-role)', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['a number', 42],
    ['a string', 'T1'],
    ['a boolean', true],
  ])('rejects a task entry that is %s as invalid-task, still reporting other tasks normally', (_label, bad) => {
    const input = doc([node('OK'), bad])
    const errors = errorsOf(input)
    expect(errors.map((e) => e.code)).toContain('invalid-task')
    // The valid task OK produces no error of its own.
    expect(errors.filter((e) => e.taskId === 'OK')).toEqual([])
  })

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['a number', 5],
    ['null', null],
    ['an object', {}],
    ['an array', ['t']],
  ])('rejects a title that is %s as invalid-title', (_label, title) => {
    expectSingle(doc([task({ id: 'A', title })]), 'invalid-title', 'A')
  })

  it('rejects a task with the title key removed as invalid-title', () => {
    expectSingle(doc([taskWithout('title', { id: 'A' })]), 'invalid-title', 'A')
  })

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['a number', 5],
    ['null', null],
    ['an object', {}],
    ['an array', ['r']],
  ])('rejects an ownerRole that is %s as invalid-owner-role', (_label, ownerRole) => {
    expectSingle(doc([task({ id: 'A', ownerRole })]), 'invalid-owner-role', 'A')
  })

  it('rejects a task with the ownerRole key removed as invalid-owner-role', () => {
    expectSingle(doc([taskWithout('ownerRole', { id: 'A' })]), 'invalid-owner-role', 'A')
  })
})

describe('stream and status (unknown-stream, unknown-status)', () => {
  it.each<[string, unknown]>([
    ['a stream that is not listed', 'Nope'],
    ['a different case: fw', 'fw'],
    ['an empty string', ''],
    ['a number', 5],
  ])('rejects %s as unknown-stream', (_label, stream) => {
    expectSingle(doc([task({ id: 'A', stream })]), 'unknown-stream', 'A')
  })

  it('rejects a task with no stream key as unknown-stream', () => {
    expectSingle(doc([taskWithout('stream', { id: 'A' })]), 'unknown-stream', 'A')
  })

  it('accepts every stream listed in workstreams', () => {
    const input = doc([node('A', [], { stream: 'FW' }), node('B', [], { stream: 'QA' })])
    expect(validateDocument(input).ok).toBe(true)
  })

  it.each<[string, unknown]>([
    ['blocked (derived, never stored)', 'blocked'],
    ['upper case DONE', 'DONE'],
    ['in-progress with a hyphen', 'in-progress'],
    ['an empty string', ''],
    ['a number', 1],
    ['null', null],
  ])('rejects status %s as unknown-status', (_label, status) => {
    expectSingle(doc([task({ id: 'A', status })]), 'unknown-status', 'A')
  })

  it('rejects a task with no status key as unknown-status', () => {
    expectSingle(doc([taskWithout('status', { id: 'A' })]), 'unknown-status', 'A')
  })

  it.each(['todo', 'in_progress', 'done'])('accepts status %s', (status) => {
    expect(validateDocument(doc([task({ status })])).ok).toBe(true)
  })
})

// ---------------------------------------------------------------- estimates (ADR-002 §2)

describe('estimateDays (invalid-estimate, ADR-002 §2)', () => {
  it.each<[string, unknown]>([
    ['fractional 1.5', 1.5],
    ['fractional 0.5', 0.5],
    ['negative -1', -1],
    ['negative fraction -0.5', -0.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero (only gates may be 0)', 0],
    ['above the maximum: 251', 251],
    ['far above the maximum: 1000', 1000],
    ['a numeric string', '3'],
    ['null', null],
    ['a boolean', true],
    ['an array', [3]],
  ])('rejects an ordinary task estimate that is %s', (_label, estimateDays) => {
    expectSingle(doc([task({ id: 'A', estimateDays })]), 'invalid-estimate', 'A')
  })

  it('rejects a task whose estimateDays is missing', () => {
    expectSingle(doc([task({ id: 'A', estimateDays: undefined })]), 'invalid-estimate', 'A')
    expectSingle(doc([taskWithout('estimateDays', { id: 'A' })]), 'invalid-estimate', 'A')
  })

  it.each([1, 2, 5, 249, 250])('accepts the ordinary task estimate %i', (estimateDays) => {
    expect(validateDocument(doc([task({ estimateDays })])).ok).toBe(true)
  })

  it.each([0, 1, 250])('accepts the estimate %i on a gate task', (estimateDays) => {
    expect(validateDocument(doc([task({ gate: 'fw-integrated', estimateDays })])).ok).toBe(true)
  })

  it.each<[string, unknown]>([
    ['negative -1', -1],
    ['fractional 0.5', 0.5],
    ['fractional 1.5', 1.5],
    ['NaN', Number.NaN],
    ['above the maximum: 251', 251],
    ['a string', '0'],
    ['null', null],
  ])('rejects a gate task estimate that is %s', (_label, estimateDays) => {
    expectSingle(doc([task({ id: 'G', gate: 'qa-complete', estimateDays })]), 'invalid-estimate', 'G')
  })

  it('allows the 0-day estimate for every one of the four gate values', () => {
    for (const gate of ['fw-integrated', 'security-verified', 'app-integration', 'qa-complete']) {
      expect(validateDocument(doc([task({ gate, estimateDays: 0 })])).ok).toBe(true)
    }
  })
})

// ---------------------------------------------------------------- predecessors (ADR-002 §9)

describe('predecessors (invalid-predecessors, unknown-predecessor, self-predecessor, repeated-predecessor)', () => {
  it.each<[string, unknown]>([
    ['missing', undefined],
    ['null', null],
    ['a string', 'A'],
    ['a number', 5],
    ['an object', { A: true }],
    ['an array with a number', ['A', 2]],
    ['an array of only numbers', [1]],
    ['an array with null', [null]],
    ['an array of arrays', [['A']]],
  ])('rejects predecessors that are %s as invalid-predecessors', (_label, predecessors) => {
    expectSingle(doc([node('A'), task({ id: 'B', predecessors })]), 'invalid-predecessors', 'B')
  })

  it('rejects a task with the predecessors key removed as invalid-predecessors', () => {
    expectSingle(doc([node('A'), taskWithout('predecessors', { id: 'B' })]), 'invalid-predecessors', 'B')
  })

  it('rejects an unknown predecessor with the exact message "unknown predecessor X on task Y"', () => {
    const errors = errorsOf(doc([node('A'), node('B', ['A', 'GHOST'])]))
    expect(errors).toHaveLength(1)
    const [error] = errors
    expect(error?.code).toBe('unknown-predecessor')
    expect(error?.message).toBe('unknown predecessor GHOST on task B')
    expect(error?.taskId).toBe('B')
  })

  it('reports each unknown predecessor of a task with its own exact message', () => {
    const errors = errorsOf(doc([node('A', ['X1', 'X2'])]))
    expect(errors.map((e) => e.code)).toEqual(['unknown-predecessor', 'unknown-predecessor'])
    expect(errors.map((e) => e.message).sort()).toEqual([
      'unknown predecessor X1 on task A',
      'unknown predecessor X2 on task A',
    ])
    expect(errors.every((e) => e.taskId === 'A')).toBe(true)
  })

  it('reports unknown predecessors on different tasks with the matching task in each message', () => {
    const errors = errorsOf(doc([node('A', ['Z']), node('B', ['Z'])]))
    expect(errors.map((e) => e.message).sort()).toEqual(['unknown predecessor Z on task A', 'unknown predecessor Z on task B'])
  })

  it('does not run into a cycle or crash when an unknown predecessor is the only problem', () => {
    expectSingle(doc([node('A', ['NOPE']), node('B', ['A'])]), 'unknown-predecessor', 'A')
  })

  it('rejects a task that lists itself as self-predecessor', () => {
    expectSingle(doc([node('A', ['A'])]), 'self-predecessor', 'A')
  })

  it('never reports a self-predecessor as a cycle', () => {
    const errors = errorsOf(doc([node('A', ['A']), node('B', ['A'])]))
    expect(errors.map((e) => e.code)).toEqual(['self-predecessor'])
    expect(errors.filter((e) => e.code === 'cycle')).toEqual([])
  })

  it('still reports a real cycle that passes through a task that also lists itself, without a one-element cycle', () => {
    // A -> {A (self), B}; B -> A. The self edge is not a cycle; A <-> B is.
    const errors = errorsOf(doc([node('A', ['A', 'B']), node('B', ['A'])]))
    expect(errors.filter((e) => e.code === 'self-predecessor').map((e) => e.taskId)).toEqual(['A'])
    const cycles = errors.filter((e) => e.code === 'cycle')
    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.cycle).toEqual(['A', 'B'])
  })

  it('rejects a predecessor listed twice as repeated-predecessor (once, on that task)', () => {
    expectSingle(doc([node('A'), node('B', ['A', 'A'])]), 'repeated-predecessor', 'B')
  })

  it('does not call a duplicate edge a cycle or any other error', () => {
    expect(codesOf(doc([node('A'), node('B', ['A', 'A']), node('C', ['B'])]))).toEqual(['repeated-predecessor'])
  })

  it('accepts the same predecessor on different tasks and several different predecessors on one task', () => {
    expect(validateDocument(doc([node('A'), node('B'), node('C', ['A', 'B']), node('D', ['A', 'B'])])).ok).toBe(true)
  })
})

// ---------------------------------------------------------------- gates (ADR-002 §8)

describe('gates (unknown-gate, duplicate-gate, ADR-002 §8)', () => {
  it.each<[string, unknown]>([
    ['an unlisted name', 'release-ready'],
    ['an empty string', ''],
    ['a different case: QA-COMPLETE', 'QA-COMPLETE'],
    ['a number', 5],
    ['an object', {}],
  ])('rejects a gate that is %s as unknown-gate', (_label, gate) => {
    // Estimate 1 so that the estimate rule cannot interfere whichever way a task with a bad gate is judged.
    expectSingle(doc([task({ id: 'A', gate, estimateDays: 1 })]), 'unknown-gate', 'A')
  })

  it.each(['fw-integrated', 'security-verified', 'app-integration', 'qa-complete'])('accepts the gate value %s', (gate) => {
    expect(validateDocument(doc([task({ gate, estimateDays: 0 })])).ok).toBe(true)
  })

  it('accepts all four gate values once each', () => {
    const input = doc([
      node('G1', [], { gate: 'fw-integrated', estimateDays: 0 }),
      node('G2', [], { gate: 'security-verified', estimateDays: 0 }),
      node('G3', [], { gate: 'app-integration', estimateDays: 0 }),
      node('G4', [], { gate: 'qa-complete', estimateDays: 0 }),
    ])
    expect(validateDocument(input).ok).toBe(true)
  })

  it('rejects the same gate value on two tasks as one duplicate-gate', () => {
    const input = doc([node('G1', [], { gate: 'qa-complete', estimateDays: 0 }), node('G2', [], { gate: 'qa-complete', estimateDays: 0 })])
    expect(codesOf(input)).toEqual(['duplicate-gate'])
  })

  it('reports a gate value on three tasks as one duplicate-gate (once per value)', () => {
    const input = doc([
      node('G1', [], { gate: 'fw-integrated', estimateDays: 0 }),
      node('G2', [], { gate: 'fw-integrated', estimateDays: 0 }),
      node('G3', [], { gate: 'fw-integrated', estimateDays: 0 }),
    ])
    expect(codesOf(input)).toEqual(['duplicate-gate'])
  })

  it('reports two different duplicated gate values as two duplicate-gate errors', () => {
    const input = doc([
      node('G1', [], { gate: 'fw-integrated', estimateDays: 0 }),
      node('G2', [], { gate: 'fw-integrated', estimateDays: 0 }),
      node('G3', [], { gate: 'qa-complete', estimateDays: 0 }),
      node('G4', [], { gate: 'qa-complete', estimateDays: 0 }),
      node('G5', [], { gate: 'app-integration', estimateDays: 0 }),
    ])
    expect(codesOf(input)).toEqual(['duplicate-gate', 'duplicate-gate'])
  })

  it('does not call two tasks with a different gate each, or one gate plus gate-less tasks, a duplicate', () => {
    const input = doc([node('G1', [], { gate: 'fw-integrated', estimateDays: 0 }), node('T1'), node('T2'), node('G2', [], { gate: 'security-verified' })])
    expect(validateDocument(input).ok).toBe(true)
  })
})

// ---------------------------------------------------------------- cycles (ADR-002 §9)

describe('cycles (ADR-002 §9: one deterministic cycle, DFS in ascending id order)', () => {
  it('reports the two-node example A <-> B as cycle ["A","B"] with the exact message', () => {
    // A has predecessor B and B has predecessor A, C is unrelated.
    // DFS: visit A (stack [A]); A's predecessor B (stack [A,B]); B's predecessor A is on the stack -> back-edge.
    // The stack slice from A is [A,B].
    const errors = errorsOf(doc([node('A', ['B']), node('B', ['A']), node('C')]))
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('cycle')
    expect(errors[0]?.cycle).toEqual(['A', 'B'])
    expect(errors[0]?.message).toBe('dependency cycle: A -> B -> A')
  })

  it('reports a 3-node cycle in DFS visiting order, derived by hand', () => {
    // Edges are task -> predecessor:  A -> C,  B -> A,  C -> B   (A has predecessor C, B has A, C has B).
    // DFS visits tasks in ascending id order, so it starts at A:
    //   visit A                 stack [A]
    //   A's predecessors: [C]   visit C       stack [A, C]
    //   C's predecessors: [B]   visit B       stack [A, C, B]
    //   B's predecessors: [A]   A is on the stack -> first back-edge.
    // The stack slice from A to the top, in visiting order, is [A, C, B].
    // (The reverse, [A, B, C], would be the order the tasks depend on one another instead of the visiting order.)
    const errors = errorsOf(doc([node('A', ['C']), node('B', ['A']), node('C', ['B'])]))
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('cycle')
    expect(errors[0]?.cycle).toEqual(['A', 'C', 'B'])
    expect(errors[0]?.message).toBe('dependency cycle: A -> C -> B -> A')
  })

  it('reports only the stack slice that forms the cycle, not the tail that leads to it', () => {
    // Edges task -> predecessor:  A -> B,  B -> C,  C -> D,  D -> B.
    // DFS from A: stack [A], [A,B], [A,B,C], [A,B,C,D]; D's predecessor B is on the stack at index 1.
    // The slice from B is [B, C, D]; A is only a tail and is not part of the cycle.
    const errors = errorsOf(doc([node('A', ['B']), node('B', ['C']), node('C', ['D']), node('D', ['B'])]))
    expect(errors).toHaveLength(1)
    expect(errors[0]?.cycle).toEqual(['B', 'C', 'D'])
    expect(errors[0]?.message).toBe('dependency cycle: B -> C -> D -> B')
  })

  it('does not treat an already finished task as a back-edge target', () => {
    // Edges task -> predecessor:  B -> A,  B -> C,  C -> B.  A has no predecessors.
    // DFS: A is visited and finished first (it is not on the stack later). Then B: stack [B];
    // B's predecessors in ascending order: A (finished, ignored), C (stack [B,C]);
    // C's predecessor B is on the stack -> cycle [B, C]. A must not appear.
    const errors = errorsOf(doc([node('A'), node('B', ['A', 'C']), node('C', ['B'])]))
    expect(errors).toHaveLength(1)
    expect(errors[0]?.cycle).toEqual(['B', 'C'])
    expect(errors[0]?.message).toBe('dependency cycle: B -> C -> B')
  })

  it('visits predecessor edges in ascending id order, whatever the order in the predecessors array', () => {
    // Edges task -> predecessor:  A -> {C, B} (listed C first),  B -> A,  C -> A.  Two cycles exist: A<->B and A<->C.
    // DFS from A visits predecessors ascending: B first (stack [A,B]); B's predecessor A is on the stack -> [A, B].
    // Following the array order instead would give [A, C].
    const errors = errorsOf(doc([node('A', ['C', 'B']), node('B', ['A']), node('C', ['A'])]))
    expect(errors).toHaveLength(1)
    expect(errors[0]?.cycle).toEqual(['A', 'B'])
  })

  it('reports exactly one cycle when two disjoint cycles exist, the one found first in ascending task order', () => {
    // C <-> D and A <-> B, tasks given as C, D, A, B. DFS starts at A (ascending) -> [A, B]; the C/D cycle is not reported.
    const errors = errorsOf(doc([node('C', ['D']), node('D', ['C']), node('A', ['B']), node('B', ['A'])]))
    const cycles = errors.filter((e) => e.code === 'cycle')
    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.cycle).toEqual(['A', 'B'])
    expect(errors).toHaveLength(1)
  })

  it('reports exactly one cycle when cycles overlap in one node', () => {
    // A <-> B and A <-> C overlap in A; only [A, B] is reported (see the edge-order derivation above).
    const cycles = cycleErrors(doc([node('A', ['B', 'C']), node('B', ['A']), node('C', ['A'])]))
    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.cycle).toEqual(['A', 'B'])
  })

  it('orders ids by code unit, not numerically or by locale (ADR-002 §5: ascending lexicographic code-unit order)', () => {
    // "T10" < "T2" and "B" < "a" in code-unit order, so the DFS starts at T10 / B.
    const numeric = errorsOf(doc([node('T2', ['T10']), node('T10', ['T2'])]))
    expect(numeric.filter((e) => e.code === 'cycle')[0]?.cycle).toEqual(['T10', 'T2'])
    const caseMixed = errorsOf(doc([node('a', ['B']), node('B', ['a'])]))
    expect(caseMixed.filter((e) => e.code === 'cycle')[0]?.cycle).toEqual(['B', 'a'])
  })

  it('does not report a cycle for an acyclic graph with a self-contained branch and shared nodes', () => {
    const input = doc([node('A'), node('B', ['A']), node('C', ['A', 'B']), node('D', ['B', 'C']), node('E', ['A', 'D'])])
    expect(validateDocument(input).ok).toBe(true)
  })

  it('gives the same single cycle for every ordering of the tasks and of each predecessor list (shuffle invariance)', () => {
    // The hand-derived 3-cycle: A -> C, B -> A, C -> B, expected [A, C, B].
    // D lists predecessors C and A (a tail), E is unrelated. All 120 task orders are tried, each with the predecessor
    // lists in both their given and their reversed order.
    const base: [string, string[]][] = [
      ['A', ['C']],
      ['B', ['A']],
      ['C', ['B']],
      ['D', ['C', 'A']],
      ['E', []],
    ]
    let runs = 0
    for (const order of permutations(base)) {
      for (const reverse of [false, true]) {
        const tasks = order.map(([id, preds]) => node(id, reverse ? preds.slice().reverse() : preds))
        const cycles = cycleErrors(doc(tasks))
        expect(cycles).toHaveLength(1)
        expect(cycles[0]?.cycle).toEqual(['A', 'C', 'B'])
        expect(cycles[0]?.message).toBe('dependency cycle: A -> C -> B -> A')
        runs += 1
      }
    }
    expect(runs).toBe(240)
  })

  it('reports the same ordered cycle when the task array is merely reversed (two nodes)', () => {
    const forward = cycleErrors(doc([node('A', ['B']), node('B', ['A'])]))
    const backward = cycleErrors(doc([node('B', ['A']), node('A', ['B'])]))
    expect(forward.map((e) => [e.code, e.message, e.cycle])).toEqual(backward.map((e) => [e.code, e.message, e.cycle]))
    expect(forward[0]?.cycle).toEqual(['A', 'B'])
  })

  it('reports a cycle together with other errors in the same document', () => {
    const input = doc([node('A', ['B'], { estimateDays: 1.5 }), node('B', ['A']), node('C', [], { stream: 'Nope' })])
    expect(codesOf(input)).toEqual(['cycle', 'invalid-estimate', 'unknown-stream'])
    expect(cycleErrors(input)[0]?.cycle).toEqual(['A', 'B'])
  })
})

// ---------------------------------------------------------------- everything together

describe('all errors are reported together', () => {
  it('reports every distinct problem of one document in a single result', () => {
    const input = doc(
      [
        // cycle A <-> B
        node('A', ['B']),
        node('B', ['A']),
        // C: bad title, owner role, stream, status, estimate and target date, and an unknown predecessor
        task({
          id: 'C',
          title: 3,
          ownerRole: 7,
          stream: 'Nope',
          status: 'blocked',
          estimateDays: 1.5,
          targetDate: '31/12/2026',
          predecessors: ['ZZ'],
        }),
        // D lists itself; D and E share a gate value
        node('D', ['D'], { gate: 'qa-complete', estimateDays: 0 }),
        // E repeats a predecessor
        node('E', ['A', 'A'], { gate: 'qa-complete', estimateDays: 0 }),
        // no usable id
        task({ id: '' }),
        // duplicated id G
        node('G'),
        node('G'),
        // unknown gate value
        node('H', [], { gate: 'nope', estimateDays: 3 }),
        // predecessors that are not a string[]
        task({ id: 'I', predecessors: 'A' }),
      ],
      { release: { startDate: '2026-02-30', targetDate: 'soon' } },
    )

    const errors = errorsOf(input)
    expect(errors.map((e) => e.code).sort()).toEqual(
      [
        'invalid-start-date',
        'invalid-target-date', // release.targetDate
        'cycle',
        'invalid-title', // C
        'invalid-owner-role', // C
        'unknown-stream', // C
        'unknown-status', // C
        'invalid-estimate', // C
        'invalid-target-date', // C
        'unknown-predecessor', // C -> ZZ
        'self-predecessor', // D
        'duplicate-gate', // D and E
        'repeated-predecessor', // E
        'missing-id',
        'duplicate-id', // G
        'unknown-gate', // H
        'invalid-predecessors', // I
      ].sort(),
    )

    // Spot-check what the contract pins exactly.
    expect(errors.find((e) => e.code === 'cycle')?.cycle).toEqual(['A', 'B'])
    expect(errors.find((e) => e.code === 'cycle')?.message).toBe('dependency cycle: A -> B -> A')
    const unknown = errors.find((e) => e.code === 'unknown-predecessor')
    expect(unknown?.message).toBe('unknown predecessor ZZ on task C')
    expect(unknown?.taskId).toBe('C')
    expect(errors.find((e) => e.code === 'self-predecessor')?.taskId).toBe('D')
    expect(errors.find((e) => e.code === 'repeated-predecessor')?.taskId).toBe('E')
    expect(errors.find((e) => e.code === 'invalid-title')?.taskId).toBe('C')
    expect(errors.find((e) => e.code === 'unknown-gate')?.taskId).toBe('H')
    expect(errors.find((e) => e.code === 'invalid-predecessors')?.taskId).toBe('I')
    // Every error has a readable message.
    for (const error of errors) {
      expect(typeof error.message).toBe('string')
      expect(error.message.length).toBeGreaterThan(0)
    }
  })

  it('returns ok:false with errors and no document when anything is wrong', () => {
    const result = validateDocument(doc([node('A', ['A'])]))
    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('document')
  })

  it('is deterministic: validating the same document twice gives equal results', () => {
    const input = doc([node('A', ['B']), node('B', ['A']), task({ id: 'C', estimateDays: -1 })])
    expect(validateDocument(input)).toEqual(validateDocument(input))
  })
})

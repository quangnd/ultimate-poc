import { describe, expect, it } from 'vitest'
import type { ReleaseDocument, Task } from '../../src/domain/types'
import { isIsoDate, validateDocument, type ValidationError } from '../../src/domain/validate'

// Plain JSON-like data: the validator receives `unknown`, so mutations here may break the types on purpose.
type Json = Record<string, any>

const task = (id: string, over: Json = {}): Json => ({
  id,
  title: `Task ${id}`,
  stream: 'FW',
  ownerRole: 'owner',
  status: 'todo',
  estimateDays: 2,
  predecessors: [],
  ...over,
})

const doc = (tasks: Json[] = [task('A'), task('B', { predecessors: ['A'] })], over: Json = {}): Json => ({
  schemaVersion: 1,
  release: { startDate: '2026-01-05' },
  workstreams: ['FW', 'QA'],
  tasks,
  ...over,
})

const errorsOf = (input: unknown): ValidationError[] => {
  const result = validateDocument(input)
  if (result.ok) throw new Error('expected a validation failure')
  return result.errors
}
const codesOf = (input: unknown) => errorsOf(input).map((e) => e.code)

describe('validateDocument: accepted documents', () => {
  it('returns the same input object, untouched, for a valid document', () => {
    const input = doc([task('A'), task('B', { predecessors: ['A'], targetDate: '2028-02-29', extra: 1 })], {
      release: { startDate: '2026-01-05', targetDate: '2026-03-31' },
      note: 'unknown extra fields are ignored',
    })
    const before = structuredClone(input)
    const result = validateDocument(input)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.document).toBe(input as unknown as ReleaseDocument)
    expect(input).toEqual(before)
  })

  it('accepts a 0-day gate, 250-day tasks, empty text and a document without gates', () => {
    const input = doc(
      [
        task('A', { estimateDays: 250, title: '', ownerRole: '' }),
        task('G', { estimateDays: 0, gate: 'qa-complete', predecessors: ['A'] }),
        task('H', { estimateDays: 250, gate: 'fw-integrated' }),
      ],
      { workstreams: ['FW', 'FW', ''] },
    )
    expect(validateDocument(input).ok).toBe(true)
  })
})

describe('isIsoDate', () => {
  it.each([
    ['2026-01-05', true],
    ['2028-02-29', true],
    ['2000-02-29', true],
    ['0004-02-29', true],
    ['2026-12-31', true],
    ['2026-02-30', false],
    ['2026-02-29', false],
    ['1900-02-29', false],
    ['2026-13-01', false],
    ['2026-00-10', false],
    ['2026-04-31', false],
    ['2026-01-00', false],
    ['2026-1-05', false],
    ['2026-01-05T00:00:00Z', false],
    ['2026-01-05\n', false],
    [' 2026-01-05', false],
    ['', false],
    [20260105, false],
    [null, false],
    [undefined, false],
  ])('%j -> %s', (value, expected) => {
    expect(isIsoDate(value)).toBe(expected)
  })
})

describe('validateDocument: document level', () => {
  it.each([null, undefined, 'x', 1, true, []])('rejects the non-object input %j with a single invalid-document', (input) => {
    expect(errorsOf(input)).toEqual([expect.objectContaining({ code: 'invalid-document' })])
  })

  it.each<[string, Json, string[]]>([
    ['schemaVersion 2', { schemaVersion: 2 }, ['invalid-schema-version']],
    ['schemaVersion "1"', { schemaVersion: '1' }, ['invalid-schema-version']],
    ['schemaVersion missing', { schemaVersion: undefined }, ['invalid-schema-version']],
    ['release not an object', { release: 'x' }, ['invalid-document']],
    ['release missing', { release: undefined }, ['invalid-document']],
    ['startDate missing', { release: {} }, ['invalid-start-date']],
    ['startDate 2026-02-30', { release: { startDate: '2026-02-30' } }, ['invalid-start-date']],
    ['startDate 2026-13-01', { release: { startDate: '2026-13-01' } }, ['invalid-start-date']],
    ['startDate not a string', { release: { startDate: 20260105 } }, ['invalid-start-date']],
    ['targetDate 2026-02-30', { release: { startDate: '2026-01-05', targetDate: '2026-02-30' } }, ['invalid-target-date']],
    ['targetDate null', { release: { startDate: '2026-01-05', targetDate: null } }, ['invalid-target-date']],
    ['both dates invalid', { release: { startDate: 'x', targetDate: 'y' } }, ['invalid-start-date', 'invalid-target-date']],
    ['workstreams not an array', { workstreams: 'FW' }, ['invalid-workstreams']],
    ['workstreams with a non-string', { workstreams: ['FW', 3] }, ['invalid-workstreams']],
    ['tasks not an array', { tasks: {} }, ['invalid-document']],
    ['tasks missing', { tasks: undefined }, ['invalid-document']],
  ])('%s -> %j', (_label, over, codes) => {
    expect(codesOf({ ...doc(), ...over })).toEqual(codes)
  })

  it('does not report unknown streams when workstreams itself is invalid', () => {
    expect(codesOf(doc([task('A')], { workstreams: undefined }))).toEqual(['invalid-workstreams'])
  })
})

describe('validateDocument: tasks', () => {
  it.each<[string, Json, string[]]>([
    ['empty id', { id: '' }, ['missing-id']],
    ['missing id', { id: undefined }, ['missing-id']],
    ['numeric id', { id: 7 }, ['missing-id']],
    ['title not a string', { title: 3 }, ['invalid-title']],
    ['ownerRole not a string', { ownerRole: undefined }, ['invalid-owner-role']],
    ['unknown stream', { stream: 'Ops' }, ['unknown-stream']],
    ['missing stream', { stream: undefined }, ['unknown-stream']],
    ['unknown status', { status: 'blocked' }, ['unknown-status']],
    ['invalid task targetDate', { targetDate: '2026-02-30' }, ['invalid-target-date']],
    ['predecessors not an array', { predecessors: 'A' }, ['invalid-predecessors']],
    ['predecessors with a non-string', { predecessors: [1] }, ['invalid-predecessors']],
    ['unknown gate', { gate: 'ship-it' }, ['unknown-gate']],
    ['null gate', { gate: null }, ['unknown-gate']],
  ])('%s -> %j', (_label, over, codes) => {
    const errors = errorsOf(doc([task('T', over)]))
    expect(errors.map((e) => e.code)).toEqual(codes)
    // Errors name the task when it has an id; a task without a valid id cannot be named.
    expect(errors[0]!.taskId).toBe(codes[0] === 'missing-id' ? undefined : 'T')
  })

  it('rejects a task element that is not an object, without a taskId', () => {
    const errors = errorsOf(doc([task('A'), null as unknown as Json, 'x' as unknown as Json]))
    expect(errors).toEqual([
      expect.objectContaining({ code: 'invalid-task' }),
      expect.objectContaining({ code: 'invalid-task' }),
    ])
    expect(errors.every((e) => e.taskId === undefined)).toBe(true)
  })

  it('reports one duplicate-id per id value, with the taskId', () => {
    const errors = errorsOf(doc([task('A'), task('B'), task('A'), task('B'), task('A'), task('C')]))
    expect(errors.map((e) => [e.code, e.taskId])).toEqual([
      ['duplicate-id', 'A'],
      ['duplicate-id', 'B'],
    ])
  })
})

describe('validateDocument: estimateDays (ADR-002 §2)', () => {
  const estimate = (value: unknown, gate?: string) =>
    validateDocument(doc([task('T', { estimateDays: value, ...(gate ? { gate } : {}) })])).ok

  it.each([1.5, -1, Number.NaN, Infinity, '3', null, undefined, 0, 251, 250.5])('rejects %j on an ordinary task', (value) => {
    expect(estimate(value)).toBe(false)
  })
  it.each([1, 2, 250])('accepts %j on an ordinary task', (value) => {
    expect(estimate(value)).toBe(true)
  })
  it.each([0, 1, 250])('accepts %j on a gate task', (value) => {
    expect(estimate(value, 'qa-complete')).toBe(true)
  })
  it.each([-1, 0.5, Number.NaN, '0', 251])('rejects %j on a gate task', (value) => {
    expect(estimate(value, 'qa-complete')).toBe(false)
  })

  it('names the task in the error', () => {
    expect(errorsOf(doc([task('T', { estimateDays: 1.5 })]))).toEqual([
      expect.objectContaining({ code: 'invalid-estimate', taskId: 'T' }),
    ])
  })

  it('treats a task with an unknown gate as an ordinary task for the estimate', () => {
    expect(codesOf(doc([task('T', { estimateDays: 0, gate: 'nope' })]))).toEqual(['invalid-estimate', 'unknown-gate'])
  })
})

describe('validateDocument: predecessors (ADR-002 §9)', () => {
  it('reports an unknown predecessor with the exact message', () => {
    expect(errorsOf(doc([task('Y', { predecessors: ['X'] })]))).toEqual([
      { code: 'unknown-predecessor', message: 'unknown predecessor X on task Y', taskId: 'Y' },
    ])
  })

  it('reports a self-link as self-predecessor only, never as a cycle', () => {
    expect(errorsOf(doc([task('A', { predecessors: ['A'] })]))).toEqual([
      expect.objectContaining({ code: 'self-predecessor', taskId: 'A' }),
    ])
  })

  it('reports a repeated predecessor once per repeated id', () => {
    const errors = errorsOf(doc([task('A'), task('B'), task('C', { predecessors: ['B', 'A', 'B', 'A', 'B'] })]))
    expect(errors.map((e) => [e.code, e.taskId])).toEqual([
      ['repeated-predecessor', 'C'],
      ['repeated-predecessor', 'C'],
    ])
  })
})

describe('validateDocument: gates (ADR-002 §8)', () => {
  it('reports a duplicate gate once per gate value; a missing gate is not an error', () => {
    const errors = errorsOf(
      doc([
        task('A', { gate: 'qa-complete' }),
        task('B', { gate: 'qa-complete' }),
        task('C', { gate: 'qa-complete' }),
        task('D', { gate: 'fw-integrated' }),
        task('E', { gate: 'fw-integrated' }),
        task('F', { gate: 'app-integration' }),
      ]),
    )
    expect(errors.map((e) => e.code)).toEqual(['duplicate-gate', 'duplicate-gate'])
    expect(errors.map((e) => e.message).join('|')).toMatch(/qa-complete.*fw-integrated|fw-integrated.*qa-complete/)
  })
})

describe('validateDocument: cycles (ADR-002 §9)', () => {
  const threeCycle = () => [
    task('A', { predecessors: ['C'] }),
    task('B', { predecessors: ['A'] }),
    task('C', { predecessors: ['B'] }),
  ]

  it('reports the exact ordered cycle for A <- C <- B <- A', () => {
    // Edges task -> predecessor: A->C, C->B, B->A; the DFS from A walks A, C, B and closes on A.
    expect(errorsOf(doc(threeCycle()))).toEqual([
      { code: 'cycle', message: 'dependency cycle: A -> C -> B -> A', taskId: 'A', cycle: ['A', 'C', 'B'] },
    ])
  })

  it('reports the two-node cycle A <-> B as ["A","B"]', () => {
    expect(errorsOf(doc([task('B', { predecessors: ['A'] }), task('A', { predecessors: ['B'] })]))).toEqual([
      { code: 'cycle', message: 'dependency cycle: A -> B -> A', taskId: 'A', cycle: ['A', 'B'] },
    ])
  })

  it('gives the same cycle for every task order', () => {
    const [a, b, c] = threeCycle()
    const orders = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]] as Json[][]
    for (const tasks of orders) {
      expect(errorsOf(doc(tasks))).toEqual([expect.objectContaining({ code: 'cycle', cycle: ['A', 'C', 'B'] })])
    }
  })

  it('reports only the slice from the re-entered node, not the path leading to it', () => {
    // A -> B -> C -> B: the cycle is [B, C]; A only leads into it.
    const tasks = [task('A', { predecessors: ['B'] }), task('B', { predecessors: ['C'] }), task('C', { predecessors: ['B'] })]
    expect(errorsOf(doc(tasks))).toEqual([expect.objectContaining({ cycle: ['B', 'C'], taskId: 'B' })])
  })

  it('reports one cycle only, and visits predecessors in ascending id order', () => {
    // A -> [B, C]; B -> A; C -> A. Visiting B first closes [A, B]; the C cycle is not reported.
    const tasks = [
      task('A', { predecessors: ['C', 'B'] }),
      task('B', { predecessors: ['A'] }),
      task('C', { predecessors: ['A'] }),
      task('X', { predecessors: ['Y'] }),
      task('Y', { predecessors: ['X'] }),
    ]
    expect(errorsOf(doc(tasks))).toEqual([expect.objectContaining({ cycle: ['A', 'B'] })])
  })

  it('does not report a cycle for an acyclic diamond or for unknown ids', () => {
    const tasks = [
      task('A'),
      task('B', { predecessors: ['A'] }),
      task('C', { predecessors: ['A'] }),
      task('D', { predecessors: ['B', 'C', 'Z'] }),
    ]
    expect(codesOf(doc(tasks))).toEqual(['unknown-predecessor'])
  })

  it.each<[string, Json[], string[]]>([
    ['a duplicate id', [...threeCycle(), task('B', { predecessors: ['A'] })], ['duplicate-id']],
    ['a missing id', [...threeCycle(), task('', {})], ['missing-id']],
    ['a non-object task', [...threeCycle(), 42 as unknown as Json], ['invalid-task']],
  ])('skips the cycle search when there is %s', (_label, tasks, codes) => {
    expect(codesOf(doc(tasks))).toEqual(codes)
  })
})

describe('validateDocument: all errors together', () => {
  it('collects every error, ordered document, per task in input order, duplicate-id, duplicate-gate', () => {
    const input = doc(
      [
        task('A', { stream: 'Ops', estimateDays: 1.5, gate: 'qa-complete' }),
        task('B', { status: 'blocked', predecessors: ['B', 'Q', 'A', 'A'], targetDate: '2026-02-30' }),
        task('A', { estimateDays: 0, gate: 'qa-complete' }),
        null as unknown as Json,
        task('', { title: 1, ownerRole: 2 }),
      ],
      { schemaVersion: 2, release: { startDate: '2026-02-30', targetDate: 'soon' }, workstreams: ['FW', 7] },
    )
    expect(errorsOf(input).map((e) => [e.code, e.taskId])).toEqual([
      ['invalid-schema-version', undefined],
      ['invalid-start-date', undefined],
      ['invalid-target-date', undefined],
      ['invalid-workstreams', undefined],
      ['unknown-stream', 'A'],
      ['invalid-estimate', 'A'],
      ['unknown-status', 'B'],
      ['invalid-target-date', 'B'],
      ['unknown-predecessor', 'B'],
      ['self-predecessor', 'B'],
      ['repeated-predecessor', 'B'],
      ['invalid-task', undefined],
      ['missing-id', undefined],
      ['invalid-title', undefined],
      ['invalid-owner-role', undefined],
      ['duplicate-id', 'A'],
      ['duplicate-gate', undefined],
    ])
  })
})

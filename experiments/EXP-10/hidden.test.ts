/** EXP-10 hidden acceptance suite (coordinator #16926). Never placed in an arm's tree while it builds. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { diffReleases } from '../../src/domain/diff'
import type { ReleaseDocument, Task } from '../../src/domain/types'
import { validateDocument } from '../../src/domain/validate'

const sample = (): ReleaseDocument => {
  const r = validateDocument(JSON.parse(readFileSync('fixtures/release.json', 'utf8')))
  if (!r.ok) throw new Error('fixture must be valid')
  return structuredClone(r.document)
}
const valid = (doc: ReleaseDocument): ReleaseDocument => {
  const r = validateDocument(doc)
  if (!r.ok) throw new Error(`test document invalid: ${JSON.stringify(r.errors)}`)
  return doc
}
const task = (doc: ReleaseDocument, id: string): Task => doc.tasks.find((t) => t.id === id)!
const edit = (fn: (doc: ReleaseDocument) => void): ReleaseDocument => {
  const doc = sample()
  fn(doc)
  return valid(doc)
}
const empty = { added: [], removed: [] }

describe('EXP-10 hidden: diffReleases', () => {
  it('H01 identity: the same object is unchanged with empty lists', () => {
    const d = sample()
    const r = diffReleases(d, d)
    expect(r.unchanged).toBe(true)
    expect(r.release).toEqual([])
    expect(r.workstreams).toEqual(empty)
    expect(r.tasks).toEqual({ added: [], removed: [], changed: [] })
    expect(r.links).toEqual(empty)
    expect(r.readiness).toEqual({ before: false, after: false, gates: [] })
    expect(r.forecast).toEqual({
      beforeFinishDate: '2027-02-10',
      afterFinishDate: '2027-02-10',
      deltaWorkingDays: 0,
      beforeSlipDays: -2,
      afterSlipDays: -2,
    })
  })

  it('H02 identity: a structured clone is unchanged', () => {
    const d = sample()
    const r = diffReleases(d, structuredClone(d))
    expect(r.unchanged).toBe(true)
    expect(r.tasks.changed).toEqual([])
    expect(r.forecast.deltaWorkingDays).toBe(0)
  })

  it('H03 firmware delay: FW-03 5 -> 8 is one field change and +3 working days', () => {
    const after = edit((d) => void (task(d, 'FW-03').estimateDays = 8))
    const r = diffReleases(sample(), after)
    expect(r.unchanged).toBe(false)
    expect(r.tasks).toEqual({ added: [], removed: [], changed: [{ id: 'FW-03', changes: [{ field: 'estimateDays', before: 5, after: 8 }] }] })
    expect(r.links).toEqual(empty)
    expect(r.forecast).toEqual({
      beforeFinishDate: '2027-02-10',
      afterFinishDate: '2027-02-15',
      deltaWorkingDays: 3,
      beforeSlipDays: -2,
      afterSlipDays: 1,
    })
  })

  it('H04 an earlier finish gives a negative delta', () => {
    const before = edit((d) => void (task(d, 'FW-03').estimateDays = 8))
    const r = diffReleases(before, sample())
    expect(r.forecast.deltaWorkingDays).toBe(-3)
    expect(r.forecast.beforeFinishDate).toBe('2027-02-15')
    expect(r.forecast.afterFinishDate).toBe('2027-02-10')
  })

  it('H05 several changed fields are listed in TASK_FIELDS order', () => {
    const after = edit((d) => {
      const t = task(d, 'SEC-02')
      t.status = 'done'
      t.ownerRole = 'security-lead'
      t.title = 'Hold secure-boot key ceremony'
    })
    expect(diffReleases(sample(), after).tasks.changed).toEqual([
      {
        id: 'SEC-02',
        changes: [
          { field: 'title', before: 'Plan secure-boot key ceremony', after: 'Hold secure-boot key ceremony' },
          { field: 'ownerRole', before: 'security-engineer', after: 'security-lead' },
          { field: 'status', before: 'in_progress', after: 'done' },
        ],
      },
    ])
  })

  it('H06 absent optional fields are null: target added and removed', () => {
    const after = edit((d) => {
      task(d, 'FW-04').targetDate = '2027-01-20'
      delete task(d, 'FW-02').targetDate
    })
    expect(diffReleases(sample(), after).tasks.changed).toEqual([
      { id: 'FW-02', changes: [{ field: 'targetDate', before: '2027-01-08', after: null }] },
      { id: 'FW-04', changes: [{ field: 'targetDate', before: null, after: '2027-01-20' }] },
    ])
  })

  it('H07 removing a gate: gate -> null and the gate becomes missing', () => {
    const after = edit((d) => {
      const t = task(d, 'FW-06')
      delete t.gate
      t.estimateDays = 1
    })
    const r = diffReleases(sample(), after)
    expect(r.tasks.changed).toEqual([
      {
        id: 'FW-06',
        changes: [
          { field: 'estimateDays', before: 0, after: 1 },
          { field: 'gate', before: 'fw-integrated', after: null },
        ],
      },
    ])
    expect(r.readiness.gates).toEqual([{ gate: 'fw-integrated', before: 'open', after: 'missing' }])
  })

  it('H08 a predecessor-only change is a link change, not a task change', () => {
    const after = edit((d) => {
      task(d, 'APP-04').predecessors = ['APP-02', 'SPS-02']
      task(d, 'SPS-04').predecessors = ['SPS-03']
    })
    const r = diffReleases(sample(), after)
    expect(r.tasks).toEqual({ added: [], removed: [], changed: [] })
    expect(r.links).toEqual({ added: [{ from: 'SPS-02', to: 'APP-04' }], removed: [{ from: 'FW-04', to: 'SPS-04' }] })
    expect(r.unchanged).toBe(false)
  })

  it('H09 reordering predecessors is not a change', () => {
    const after = edit((d) => {
      task(d, 'SPS-04').predecessors = ['FW-04', 'SPS-03']
      task(d, 'QA-03').predecessors = ['SEC-05', 'APP-05', 'QA-02']
    })
    const r = diffReleases(sample(), after)
    expect(r.unchanged).toBe(true)
    expect(r.links).toEqual(empty)
  })

  it('H10 an added task: in added only, and its incoming and outgoing links are added', () => {
    const after = edit((d) => {
      d.tasks.push({ id: 'FW-07', title: 'Sign release image', stream: 'FW', ownerRole: 'fw-lead', status: 'todo', estimateDays: 1, predecessors: ['FW-05'] })
      task(d, 'FW-06').predecessors = ['FW-05', 'FW-07']
    })
    const r = diffReleases(sample(), after)
    expect(r.tasks).toEqual({ added: ['FW-07'], removed: [], changed: [] })
    expect(r.links).toEqual({ added: [{ from: 'FW-07', to: 'FW-06' }, { from: 'FW-05', to: 'FW-07' }], removed: [] })
  })

  it('H11 a removed task: in removed only, and its links are removed', () => {
    const after = edit((d) => {
      d.tasks = d.tasks.filter((t) => t.id !== 'APP-04')
      task(d, 'APP-05').predecessors = ['APP-03']
    })
    const r = diffReleases(sample(), after)
    expect(r.tasks).toEqual({ added: [], removed: ['APP-04'], changed: [] })
    expect(r.links).toEqual({ added: [], removed: [{ from: 'APP-02', to: 'APP-04' }, { from: 'APP-04', to: 'APP-05' }] })
  })

  it('H12 added and removed ids sort in code-unit order, not localeCompare', () => {
    const extra = (id: string): Task => ({ id, title: id, stream: 'FW', ownerRole: 'x', status: 'todo', estimateDays: 1, predecessors: [] })
    const after = edit((d) => void d.tasks.push(extra('a-1'), extra('B-1'), extra('Z-1')))
    expect(diffReleases(sample(), after).tasks.added).toEqual(['B-1', 'Z-1', 'a-1'])
    expect(diffReleases(after, sample()).tasks.removed).toEqual(['B-1', 'Z-1', 'a-1'])
  })

  it('H13 links sort by to, then from', () => {
    const after = edit((d) => {
      task(d, 'QA-03').predecessors.push('FW-01', 'APP-01')
      task(d, 'APP-05').predecessors.push('SEC-01')
    })
    expect(diffReleases(sample(), after).links.added).toEqual([
      { from: 'SEC-01', to: 'APP-05' },
      { from: 'APP-01', to: 'QA-03' },
      { from: 'FW-01', to: 'QA-03' },
    ])
  })

  it('H14 a later start date: startDate change and the delta counts working days across start dates', () => {
    const after = edit((d) => void (d.release.startDate = '2027-01-11'))
    const r = diffReleases(sample(), after)
    expect(r.release).toEqual([{ field: 'startDate', before: '2027-01-04', after: '2027-01-11' }])
    expect(r.unchanged).toBe(false)
    expect(r.forecast.afterFinishDate).toBe('2027-02-17')
    expect(r.forecast.deltaWorkingDays).toBe(5)
  })

  it('H15 target removed and start changed: startDate first, null target, null slip', () => {
    const after = edit((d) => {
      delete d.release.targetDate
      d.release.startDate = '2027-01-05'
    })
    const r = diffReleases(sample(), after)
    expect(r.release).toEqual([
      { field: 'startDate', before: '2027-01-04', after: '2027-01-05' },
      { field: 'targetDate', before: '2027-02-12', after: null },
    ])
    expect(r.forecast.beforeSlipDays).toBe(-2)
    expect(r.forecast.afterSlipDays).toBeNull()
    expect(r.forecast.deltaWorkingDays).toBe(1)
  })

  it('H16 target-only change moves the slip, not the finish', () => {
    const after = edit((d) => void (d.release.targetDate = '2027-02-05'))
    const r = diffReleases(sample(), after)
    expect(r.release).toEqual([{ field: 'targetDate', before: '2027-02-12', after: '2027-02-05' }])
    expect(r.forecast).toMatchObject({ deltaWorkingDays: 0, beforeSlipDays: -2, afterSlipDays: 3 })
  })

  it('H17 workstreams compare as sets, sorted; reordering alone is unchanged', () => {
    const reordered = edit((d) => void d.workstreams.reverse())
    expect(diffReleases(sample(), reordered).unchanged).toBe(true)
    const more = edit((d) => void (d.workstreams = ['QA', 'Ops', 'FW', 'SPS', 'Docs', 'Security', 'App']))
    const r = diffReleases(sample(), more)
    expect(r.workstreams).toEqual({ added: ['Docs', 'Ops'], removed: [] })
    expect(r.unchanged).toBe(false)
    expect(diffReleases(more, sample()).workstreams).toEqual({ added: [], removed: ['Docs', 'Ops'] })
  })

  it('H18 all done: readiness false -> true and every gate open -> done in GATES order', () => {
    const after = edit((d) => d.tasks.forEach((t) => (t.status = 'done')))
    const r = diffReleases(sample(), after)
    expect(r.readiness).toEqual({
      before: false,
      after: true,
      gates: [
        { gate: 'fw-integrated', before: 'open', after: 'done' },
        { gate: 'security-verified', before: 'open', after: 'done' },
        { gate: 'app-integration', before: 'open', after: 'done' },
        { gate: 'qa-complete', before: 'open', after: 'done' },
      ],
    })
  })

  it('H19 a gate moved to another task in the same state is not a gate change', () => {
    const after = edit((d) => {
      const q4 = task(d, 'QA-04')
      delete q4.gate
      q4.estimateDays = 1
      task(d, 'QA-03').gate = 'qa-complete'
    })
    const r = diffReleases(sample(), after)
    expect(r.readiness.gates).toEqual([])
    expect(r.tasks.changed.map((c) => c.id)).toEqual(['QA-03', 'QA-04'])
    expect(r.tasks.changed[0]!.changes).toEqual([{ field: 'gate', before: null, after: 'qa-complete' }])
  })

  it('H20 pure: inputs are not mutated and repeated calls agree', () => {
    const before = sample()
    const after = edit((d) => {
      task(d, 'FW-03').estimateDays = 8
      d.tasks = d.tasks.filter((t) => t.id !== 'APP-04')
      task(d, 'APP-05').predecessors = ['APP-03']
    })
    const snapB = JSON.stringify(before)
    const snapA = JSON.stringify(after)
    const r1 = diffReleases(before, after)
    const r2 = diffReleases(before, after)
    expect(JSON.stringify(before)).toBe(snapB)
    expect(JSON.stringify(after)).toBe(snapA)
    expect(r2).toEqual(r1)
  })

  it('H21 order-independent: shuffled tasks, predecessors and workstreams give a deep-equal result', () => {
    const mk = () =>
      edit((d) => {
        task(d, 'FW-03').estimateDays = 8
        task(d, 'SEC-02').status = 'done'
        d.tasks.push({ id: 'b-9', title: 'x', stream: 'App', ownerRole: 'y', status: 'todo', estimateDays: 2, predecessors: ['APP-01', 'FW-01'] })
        d.tasks = d.tasks.filter((t) => t.id !== 'APP-04')
        task(d, 'APP-05').predecessors = ['b-9', 'APP-03']
        d.workstreams.push('Docs')
      })
    const shuffle = (d: ReleaseDocument): ReleaseDocument => {
      const c = structuredClone(d)
      c.tasks.reverse()
      c.tasks.forEach((t) => t.predecessors.reverse())
      c.workstreams.reverse()
      return c
    }
    const before = sample()
    const after = mk()
    const expected = diffReleases(before, after)
    expect(diffReleases(shuffle(before), shuffle(after))).toEqual(expected)
    expect(expected.tasks.added).toEqual(['b-9'])
    expect(expected.links.added).toEqual([
      { from: 'b-9', to: 'APP-05' },
      { from: 'APP-01', to: 'b-9' },
      { from: 'FW-01', to: 'b-9' },
    ])
  })

  it('H22 a status-only change of a gate task flips that gate open -> done', () => {
    const after = edit((d) => void (task(d, 'FW-06').status = 'done'))
    const r = diffReleases(sample(), after)
    expect(r.tasks.changed).toEqual([{ id: 'FW-06', changes: [{ field: 'status', before: 'todo', after: 'done' }] }])
    expect(r.readiness.gates).toEqual([{ gate: 'fw-integrated', before: 'open', after: 'done' }])
    expect(r.readiness.after).toBe(false)
  })
})

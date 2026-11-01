import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GATES, STATUSES, type ReleaseDocument } from '../src/domain/types'

// Structural checks on the synthetic fixtures only. Validation and forecasts are tested with the domain code.

const load = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as ReleaseDocument
const main = load('release.json')
const variant = load('cycle-variant.json')

const STREAMS = ['FW', 'SPS', 'Security', 'App', 'QA']

const taskOf = (doc: ReleaseDocument, id: string) => {
  const found = doc.tasks.find((t) => t.id === id)
  if (!found) throw new Error(`no task ${id}`)
  return found
}
const gateTask = (doc: ReleaseDocument, gate: string) => {
  const found = doc.tasks.filter((t) => t.gate === gate)
  if (found.length !== 1) throw new Error(`gate ${gate} on ${found.length} tasks`)
  return found[0]!
}
const links = (doc: ReleaseDocument) => doc.tasks.flatMap((t) => t.predecessors.map((p) => `${p} -> ${t.id}`))

/** Ids of all direct and transitive predecessors of `id` (ids missing from the doc are ignored). */
function ancestors(doc: ReleaseDocument, id: string): Set<string> {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length > 0) {
    const next = stack.pop()
    const current = doc.tasks.find((t) => t.id === next)
    for (const p of current?.predecessors ?? []) {
      if (!seen.has(p)) {
        seen.add(p)
        stack.push(p)
      }
    }
  }
  return seen
}

/** Kahn's algorithm: true when some tasks can never be ordered. */
function hasCycle(doc: ReleaseDocument): boolean {
  const open = new Map(doc.tasks.map((t) => [t.id, new Set(t.predecessors)]))
  for (let progressed = true; progressed && open.size > 0; ) {
    progressed = false
    for (const [id, waiting] of open) {
      if (waiting.size === 0) {
        open.delete(id)
        for (const other of open.values()) other.delete(id)
        progressed = true
      }
    }
  }
  return open.size > 0
}

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
const dayOf = (s: string) => new Date(`${s}T00:00:00Z`)

describe.each([
  ['release.json', main],
  ['cycle-variant.json', variant],
])('%s structure', (_name, doc) => {
  it('has the document shape and no fields beyond the type', () => {
    expect(Object.keys(doc).sort()).toEqual(['release', 'schemaVersion', 'tasks', 'workstreams'])
    expect(doc.schemaVersion).toBe(1)
    expect(Object.keys(doc.release).every((k) => ['startDate', 'targetDate'].includes(k))).toBe(true)
    const allowed = ['id', 'title', 'stream', 'ownerRole', 'status', 'estimateDays', 'targetDate', 'predecessors', 'gate']
    for (const t of doc.tasks) {
      expect(Object.keys(t).every((k) => allowed.includes(k)), t.id).toBe(true)
      expect(t.title.length, t.id).toBeGreaterThan(0)
      expect(t.ownerRole.length, t.id).toBeGreaterThan(0)
    }
  })

  it('has the five streams, each used, and at least 20 tasks with unique ids', () => {
    expect(doc.workstreams).toEqual(expect.arrayContaining(STREAMS))
    expect(doc.tasks.length).toBeGreaterThanOrEqual(20)
    expect(new Set(doc.tasks.map((t) => t.id)).size).toBe(doc.tasks.length)
    for (const t of doc.tasks) expect(doc.workstreams, t.id).toContain(t.stream)
    for (const s of STREAMS) expect(doc.tasks.some((t) => t.stream === s), s).toBe(true)
  })

  it('has only existing, non-repeated predecessors and no self-links', () => {
    const ids = new Set(doc.tasks.map((t) => t.id))
    for (const t of doc.tasks) {
      expect(new Set(t.predecessors).size, t.id).toBe(t.predecessors.length)
      for (const p of t.predecessors) {
        expect(ids.has(p), `${t.id} -> ${p}`).toBe(true)
        expect(p, t.id).not.toBe(t.id)
      }
    }
  })

  it('puts each of the four gates on exactly one task', () => {
    for (const gate of GATES) expect(doc.tasks.filter((t) => t.gate === gate), gate).toHaveLength(1)
    expect(doc.tasks.filter((t) => t.gate !== undefined)).toHaveLength(GATES.length)
  })

  it('has integer estimates (gates 0..250, ordinary tasks 1..250) and valid statuses and dates', () => {
    for (const t of doc.tasks) {
      expect(Number.isInteger(t.estimateDays), t.id).toBe(true)
      expect(t.estimateDays, t.id).toBeLessThanOrEqual(250)
      expect(t.estimateDays, t.id).toBeGreaterThanOrEqual(t.gate ? 0 : 1)
      expect(STATUSES, t.id).toContain(t.status)
      if (t.targetDate !== undefined) expect(isIsoDate(t.targetDate), t.id).toBe(true)
    }
    expect(doc.tasks.some((t) => t.gate && t.estimateDays === 0)).toBe(true)
  })

  it('starts on a Monday in 2027 with a target a few weeks later', () => {
    const { startDate, targetDate } = doc.release
    expect(isIsoDate(startDate)).toBe(true)
    expect(startDate.startsWith('2027-')).toBe(true)
    expect(dayOf(startDate).getUTCDay()).toBe(1)
    expect(isIsoDate(targetDate ?? '')).toBe(true)
    const weeks = (dayOf(targetDate!).getTime() - dayOf(startDate).getTime()) / (7 * 24 * 3600 * 1000)
    expect(weeks).toBeGreaterThanOrEqual(3)
    expect(weeks).toBeLessThanOrEqual(12)
  })
})

describe('release.json', () => {
  it('is acyclic', () => {
    expect(hasCycle(main)).toBe(false)
  })

  it('mixes statuses, mostly todo, with some task target dates', () => {
    const count = (s: string) => main.tasks.filter((t) => t.status === s).length
    expect(count('done')).toBeGreaterThanOrEqual(2)
    expect(count('in_progress')).toBeGreaterThanOrEqual(2)
    expect(count('todo')).toBeGreaterThan(main.tasks.length / 2)
    expect(main.tasks.filter((t) => t.targetDate !== undefined).length).toBeGreaterThanOrEqual(3)
  })

  it('has no open predecessor of a done task', () => {
    for (const t of main.tasks.filter((x) => x.status === 'done')) {
      for (const p of t.predecessors) expect(taskOf(main, p).status, `${t.id} <- ${p}`).toBe('done')
    }
  })

  it('has two disjoint cross-stream chains, walked through their predecessors', () => {
    const chains = [
      ['FW-04', 'SPS-04', 'SEC-04', 'SEC-05'],
      ['FW-06', 'APP-03', 'APP-05', 'QA-03', 'QA-04'],
    ]
    for (const chain of chains) {
      expect(chain.length).toBeGreaterThanOrEqual(3)
      expect(new Set(chain.map((id) => taskOf(main, id).stream)).size).toBeGreaterThanOrEqual(2)
      for (let i = chain.length - 1; i > 0; i--) {
        expect(taskOf(main, chain[i]!).predecessors, `${chain[i - 1]} before ${chain[i]}`).toContain(chain[i - 1])
      }
    }
    expect(new Set(chains.flat()).size).toBe(chains.flat().length)
  })

  it('has the firmware-delay task FW-03 on the chain into the qa-complete gate', () => {
    const chain = ['FW-02', 'FW-03', 'FW-04', 'FW-05', 'SEC-03', 'SEC-04', 'SEC-05', 'QA-03', 'QA-04']
    for (let i = chain.length - 1; i > 0; i--) {
      expect(taskOf(main, chain[i]!).predecessors, `${chain[i - 1]} before ${chain[i]}`).toContain(chain[i - 1])
    }
    expect(chain.at(-1)).toBe(gateTask(main, 'qa-complete').id)
    expect(ancestors(main, gateTask(main, 'qa-complete').id).has('FW-03')).toBe(true)
    expect(taskOf(main, 'FW-03')).toMatchObject({ stream: 'FW', status: 'todo', estimateDays: 5 })
  })
})

describe('cycle-variant.json', () => {
  it('differs from release.json by exactly one added link', () => {
    const strip = (doc: ReleaseDocument) => doc.tasks.map(({ predecessors: _predecessors, ...rest }) => rest)
    expect({ ...variant, tasks: [] }).toEqual({ ...main, tasks: [] })
    expect(strip(variant)).toEqual(strip(main))
    const before = new Set(links(main))
    const after = new Set(links(variant))
    expect([...before].filter((l) => !after.has(l))).toEqual([])
    expect([...after].filter((l) => !before.has(l))).toHaveLength(1)
  })

  it('has an added link that closes a cycle', () => {
    const before = new Set(links(main))
    const added = links(variant).find((l) => !before.has(l))!
    const [pred, task] = added.split(' -> ') as [string, string]
    // the new predecessor already depended on the task, so task -> pred -> ... -> task is a loop
    expect(ancestors(main, pred).has(task)).toBe(true)
    expect(hasCycle(main)).toBe(false)
    expect(hasCycle(variant)).toBe(true)
  })
})

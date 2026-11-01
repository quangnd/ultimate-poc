import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateDocument } from '../../src/domain/validate'
import { buildDashboard, formatDate, slipText } from '../../src/web/view'

function fixture() {
  const result = validateDocument(JSON.parse(readFileSync('fixtures/release.json', 'utf8')))
  if (!result.ok) throw new Error('fixture must be valid')
  return result.document
}

describe('buildDashboard on the fixture', () => {
  const d = buildDashboard(fixture())

  it('shows the driving chain earliest first, and the tied gate it cannot show', () => {
    expect(d.chainForward).toEqual(['FW-02', 'FW-03', 'FW-04', 'FW-05', 'SEC-03', 'SEC-04', 'SEC-05', 'QA-03'])
    expect(d.chainTies).toEqual(['QA-04'])
  })

  it('groups tasks by stream in document stream order, in-progress first and done last', () => {
    expect(d.streams.map((s) => s.stream)).toEqual(['FW', 'SPS', 'Security', 'App', 'QA'])
    const fw = d.streams[0]!
    expect(fw.counts).toEqual({ todo: 4, in_progress: 1, done: 1 })
    expect(fw.rows.map((r) => r.task.id)).toEqual(['FW-02', 'FW-03', 'FW-04', 'FW-05', 'FW-06', 'FW-01'])
  })

  it('marks blocked, blocking and critical tasks from the readiness result', () => {
    const qa03 = d.tasks.get('QA-03')!
    expect(qa03.waitingOn).toEqual(['APP-05', 'QA-02', 'SEC-05'])
    expect(qa03.critical).toBe(true)
    expect(d.tasks.get('SPS-04')!).toMatchObject({ blocking: true, critical: false })
    expect(d.tasks.get('QA-04')!).toMatchObject({ blocking: false, critical: false })
  })
})

describe('formatting', () => {
  it('formats UTC calendar dates with the weekday', () => {
    expect(formatDate('2027-02-10')).toBe('Wed 10 Feb 2027')
  })

  it('states slip in working days, positive meaning late', () => {
    expect(slipText(1)).toBe('1 working day late')
    expect(slipText(-2)).toBe('2 working days early')
    expect(slipText(0)).toBe('on target')
  })
})

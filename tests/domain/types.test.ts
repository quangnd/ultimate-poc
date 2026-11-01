import { describe, expect, it } from 'vitest'
import { GATES, STATUSES, type ReleaseDocument } from '../../src/domain/types'

describe('domain types', () => {
  it('accepts a valid release document literal and exposes the status and gate values', () => {
    const doc = {
      schemaVersion: 1,
      release: { startDate: '2026-01-05', targetDate: '2026-02-27' },
      workstreams: ['FW', 'QA'],
      tasks: [
        {
          id: 'T1',
          title: 'Build firmware image',
          stream: 'FW',
          ownerRole: 'firmware-lead',
          status: 'in_progress',
          estimateDays: 3,
          predecessors: [],
        },
        {
          id: 'G1',
          title: 'Firmware integrated',
          stream: 'FW',
          ownerRole: 'release-manager',
          status: 'todo',
          estimateDays: 0,
          predecessors: ['T1'],
          gate: 'fw-integrated',
        },
      ],
    } satisfies ReleaseDocument

    expect(doc.tasks).toHaveLength(2)
    expect(GATES).toEqual(['fw-integrated', 'security-verified', 'app-integration', 'qa-complete'])
    expect(STATUSES).toEqual(['todo', 'in_progress', 'done'])
  })
})

/** Domain types for the release document (ADR-001 §3, ADR-002 "Data the scheduler sees"). */

/** Task lifecycle status (ADR-002 "Data the scheduler sees"). "Blocked" is derived, never stored (ADR-002 §7). */
export const STATUSES = ['todo', 'in_progress', 'done'] as const
export type Status = (typeof STATUSES)[number]

/** The four mandatory readiness gates: each value may appear on at most one task, and all four are required for READY (ADR-002 §8). */
export const GATES = ['fw-integrated', 'security-verified', 'app-integration', 'qa-complete'] as const
export type Gate = (typeof GATES)[number]

/** YYYY-MM-DD calendar date (UTC, no time). */
export type IsoDate = string

/** Release-level inputs; the domain never reads the clock, so `startDate` is data (ADR-002 §1). */
export interface Release {
  startDate: IsoDate
  /** Compared with the forecast finish, never a scheduling constraint (ADR-002 §6). */
  targetDate?: IsoDate
}

/** A unit of work and, when `gate` is set, a readiness gate (ADR-002 §8). */
export interface Task {
  /** Non-empty and unique within the document (ADR-002 §9). */
  id: string
  title: string
  /** One of `ReleaseDocument.workstreams`; each stream has one capacity unit (ADR-002 §4). */
  stream: string
  ownerRole: string
  status: Status
  /** integer working days; remaining work when not done (ADR-002 §2) */
  estimateDays: number
  /** Compared with the forecast finish, never a scheduling constraint (ADR-002 §6). */
  targetDate?: IsoDate
  /** finish-to-start predecessor task ids */
  predecessors: string[]
  gate?: Gate
}

/** ADR-001 §3 document; workstreams lists the allowed stream names */
export interface ReleaseDocument {
  schemaVersion: 1
  release: Release
  workstreams: string[]
  tasks: Task[]
}

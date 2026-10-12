import type { Attempt, Persisted, RecallState, Relation, RelationStatus, StudyItem } from '../types'

export interface CoachTask {
  id: string
  itemId: string
  kind: 'initial_recall' | 'due_review'
  status: 'queued' | 'in_progress' | 'completed'
  reason: string
  estimatedMinutes: number
  createdAt: number
  completedAt: number | null
}

/** A small optional extension; the original Persisted and Attempt contracts stay intact. */
export interface CoachState {
  date: string
  budgetMinutes: number
  reservedMinutes: number
  tasks: CoachTask[]
  closed: boolean
}

export type CoachPersisted = Persisted & { coachState?: CoachState }

export interface CoachInput {
  items: StudyItem[]
  attempts: Attempt[]
  relations: Relation[]
  relationOverrides: Record<string, RelationStatus>
  recall: RecallState | null
  includeAppendix2: boolean
}

export interface CoachCandidate {
  item: StudyItem
  latest?: Attempt
  dueAt?: number
  tier: number
  reason: string
  estimatedMinutes: number
}

export type CoachDecision =
  | { kind: 'resume'; task: CoachTask }
  | { kind: 'next'; task: CoachTask }
  | { kind: 'wait'; dueAt: number }
  | { kind: 'done'; reason: 'budget' | 'no_candidates' | 'closed' }


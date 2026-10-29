import type { Activity, StudyState } from '../study/types'
import type { KnowledgePoint, ReviewLog, Rating } from '../general/types'

export const MANAGEMENT = '体育管理学'
export const PLATFORM_KEY = '346-fusion-platform-v1'
export const FUSION_BACKUP_KEY = '346-fusion-backup-v1'
export const JOURNAL_KEY = '346-fusion-import-journal-v1'

export interface GeneralPoint extends KnowledgePoint {
  quotaChapterOverride?: string
  trainingBlocked?: boolean
  [key: string]: unknown
}
export interface GeneralData {
  points: GeneralPoint[]
  logs: GeneralReviewLog[]
  logsArchive: GeneralReviewLog[]
  subjects: string[]
  settings: Record<string, unknown>
  [key: string]: unknown
}
export interface GeneralReviewLog extends ReviewLog {
  preRevealDraft?: string
  checkedLabels?: string[]
  durationSeconds?: number
}
export interface SubjectPolicy {
  weight: number
  newCap: number
  chapterCap: number
}
export interface FusionSettings {
  minutes: number
  subjects: Record<string, SubjectPolicy>
}
export interface TrainingTask {
  supplement?: boolean
  activity?: Activity
  priority?: number
  chargedMinutes?: number
  id: string
  module: 'mrc' | 'general'
  itemId: string
  subject: string
  title: string
  chapterKey: string
  isNew: boolean
  reason: string
  estimatedMinutes: number
  status: 'in_progress' | 'completed'
  startedAt: number
  resultId?: string
  completedAt?: number
}
export interface FusionDay {
  examMinutes?: number
  date: string
  budgetMinutes: number
  closed: boolean
  tasks: TrainingTask[]
  selectedChapters: Record<string, string[]>
  /** Absent means automatic. A nonempty list restricts only today's recommendations. */
  subjects?: string[]
  /** A finite, explicitly chosen library practice; completion never refills it. */
  practice?: PracticeScope
}
export interface PracticeScope {
  module: 'mrc' | 'general'
  kind: 'item' | 'chapter'
  title: string
  itemIds: string[]
}
export interface GeneralSession {
  taskId: string
  itemId: string
  phase: 'draft' | 'compare' | 'done'
  draft: string
  frozenDraft: string | null
  checked: string[]
  rating: Rating | null
  resultId?: string
}
export interface FusionState {
  study?: StudyState
  platformVersion: 1
  unavailableTasks?: TrainingTask[]
  general: GeneralData
  settings: FusionSettings
  day: FusionDay
  active: TrainingTask | null
  session: GeneralSession | null
}
export interface Candidate extends Omit<TrainingTask, 'id' | 'status' | 'startedAt'> {
  dueAt: number
  tier: number
}
export type FusionDecision =
  | { kind: 'resume'; task: TrainingTask }
  | { kind: 'next'; candidate: Candidate }
  | { kind: 'wait'; dueAt: number; pending: number }
  | { kind: 'done'; reason: 'closed' | 'budget' | 'quota' | 'empty' | 'practice'; pending: number }

export type Panel = 'today' | 'mrc' | 'general' | 'library' | 'records' | 'settings' | 'scoped'

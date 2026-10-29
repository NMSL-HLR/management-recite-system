import type { ReviewPoint } from '../review/types'
export type Activity = 'recovery' | 'short' | 'full'
export interface StudyConfig {
  budgetKind: 'total' | 'professional'
  inputMinutes: number
  protectedMinutes: number
  bufferPercent: number
  newShare: number
  deadline: string
  retryMinutes: number
  maxDailyTests: number
  fullEveryDays: number
}
export interface ScopedSession {
  taskId: string
  itemId: string
  module: 'mrc' | 'general'
  activity: 'short' | 'full'
  scope: ReviewPoint[]
  allPointIds: string[]
  sourceFingerprint: string
  phase: 'draft' | 'compare' | 'done'
  draft: string
  frozenDraft: string | null
  hinted: boolean
  outcomes: Record<string, 'pass' | 'miss' | 'untested'>
  paper: boolean
  structure: boolean
  written: boolean
  startedAt: number
}
export interface ScopedRecord extends ScopedSession {
  id: string
  finishedAt: number
  delayed: boolean
  complete: boolean
  nextAt: number
}
export interface TimeEntry {
  subject: string
  activity: Activity | 'exam'
  seconds: number
  days: Record<string, number>
  paused: boolean
  lastTick: number | null
  confirmed: boolean
}
export interface StudyState {
  version: 1
  config: StudyConfig
  declarations: Record<string, number>
  sources?: Record<string, ReviewPoint[]>
  records: ScopedRecord[]
  session: ScopedSession | null
  time: Record<string, TimeEntry>
  exams: { id: string; startedAt: number; finishedAt?: number; reserved: number; charges?: Record<string, number>; snapshot: unknown }[]
}

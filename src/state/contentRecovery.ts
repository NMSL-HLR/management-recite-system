import { content } from '../content'
import type { CoachPersisted } from '../coach/types'
import { validCoachState } from '../coach/planner'
import type { MigrationEntry } from '../types'
import { inspectImport, type ImportPlan, type ImportError } from '../engine/transfer'

export const CONTENT_BACKUP_KEY = 'pku346-content-before-repair-v1'
/** Optional payload on the existing review list. Never rewrite an Attempt or manufacture evidence. */
export type RecoveryEntry = MigrationEntry & { recovery?: Record<string, unknown> }
export function mergeReviews(...lists: MigrationEntry[][]): RecoveryEntry[] {
  const rows = new Map<string, RecoveryEntry>()
  for (const list of lists) for (const row of list) {
    const key = JSON.stringify([row.attemptId, row.contentVersion])
    const previous = rows.get(key)
    rows.set(key, { ...previous, ...row, ...((previous?.recovery || (row as RecoveryEntry).recovery) ? { recovery: { ...previous?.recovery, ...(row as RecoveryEntry).recovery } } : {}) })
  }
  return [...rows.values()]
}

/** Reconcile identifiers only. Unmatched historical attempts remain byte-for-byte values in attempts. */
export function reconcileContent(state: CoachPersisted): CoachPersisted {
  const known = new Set(content.items.map(i => i.id))
  const rows: RecoveryEntry[] = []
  const add = (itemId: string, attemptId: string, note: string, recovery?: Record<string, unknown>) => rows.push({ itemId, attemptId, contentVersion: state.contentVersion, note, ...(recovery ? { recovery } : {}) })
  for (const a of state.attempts) if (!known.has(a.itemId) && !state.migrationReview.some(r => r.attemptId === a.id)) add(a.itemId, a.id, '题目暂不在当前教材中；完整作答仍保留在历史记录与备份中，不参与派题。')
  let recall = state.recall, exam = state.exam, coachState = state.coachState
  if (recall && !known.has(recall.itemId)) {
    add(recall.itemId, `recall:${recall.startedAt}:${recall.itemId}`, '题目已不可用，原草稿与提示记录已完整保存，可在此查看；今日训练可继续。', { recall, recallQueue: state.recallQueue })
    recall = null
  }
  if (exam && exam.itemIds.some(id => !known.has(id))) {
    add(exam.itemIds.find(id => !known.has(id))!, `exam:${exam.id}`, '考试含不可用题目，整场作答已保存到待查，不再作为正在进行的考试。', { exam })
    exam = null
  }
  if (validCoachState(coachState)) {
    const unavailable = coachState.tasks.filter(t => t.status !== 'completed' && !known.has(t.itemId))
    if (unavailable.length) {
      for (const task of unavailable) add(task.itemId, `coach:${task.id}`, '不可用任务已从今日安排移出，原任务保存在待查中。', { task })
      coachState = { ...coachState, tasks: coachState.tasks.filter(t => !unavailable.includes(t)), reservedMinutes: Math.max(0, coachState.reservedMinutes - unavailable.filter(t => t.status === 'in_progress').reduce((n, t) => n + t.estimatedMinutes, 0)) }
    }
  }
  const recallQueue = state.recallQueue.filter(id => known.has(id))
  const changed = rows.length || recall !== state.recall || exam !== state.exam || coachState !== state.coachState || recallQueue.length !== state.recallQueue.length || state.contentVersion !== content.meta.contentVersion || state.sourceHashes?.A !== content.meta.sourceHashes.A || state.sourceHashes?.B !== content.meta.sourceHashes.B
  if (!changed) return state
  return { ...state, recall, exam, coachState, recallQueue, migrationReview: mergeReviews(state.migrationReview, rows), contentVersion: content.meta.contentVersion, sourceHashes: { ...content.meta.sourceHashes } }
}

/** Preserve original engine matching rules, retaining its unmatched payload instead of dropping it. */
export function inspectPreservingImport(raw: string, current: CoachPersisted): ImportPlan | ImportError {
  const plan = inspectImport(raw, current, content.meta, new Set(content.items.map(i => i.id)))
  if (!plan.ok) return plan
  const incoming = JSON.parse(raw) as CoachPersisted
  const identities = new Map(current.attempts.map(a => [a.id, a.itemId]))
  for (const a of incoming.attempts) {
    if (identities.has(a.id) && identities.get(a.id) !== a.itemId) return { ok: false, error: '备份含相同记录 ID 的不同题目，已停止导入以保护两份记录。' }
    identities.set(a.id, a.itemId)
  }
  const byId = new Map(plan.next.attempts.map(a => [a.id, a]))
  for (const a of plan.unmatched) {
    if (byId.has(a.id) && byId.get(a.id)!.itemId !== a.itemId) return { ok: false, error: '备份含相同记录 ID 的不同题目，已停止导入以保护两份记录。' }
    byId.set(a.id, a)
  }
  const suspended: RecoveryEntry[] = []
  if (incoming.recall) suspended.push({ itemId: incoming.recall.itemId, attemptId: `recall:${incoming.recall.startedAt}:${incoming.recall.itemId}`, contentVersion: String(incoming.contentVersion || ''), note: '单模块合并不接管当前训练；备份中的完整草稿已保存在待查。', recovery: { recall: incoming.recall } })
  if (incoming.exam) suspended.push({ itemId: incoming.exam.itemIds?.[0] || '', attemptId: `exam:${incoming.exam.id}`, contentVersion: String(incoming.contentVersion || ''), note: '单模块备份中的整场考试已保存，可展开查看与导出。', recovery: { exam: incoming.exam } })
  const next = { ...plan.next, recall: current.recall, exam: current.exam, attempts: [...byId.values()], migrationReview: mergeReviews(plan.next.migrationReview, Array.isArray(incoming.migrationReview) ? incoming.migrationReview : [], suspended) }
  return { ...plan, next: reconcileContent(next) }
}

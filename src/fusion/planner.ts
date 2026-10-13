import { buildCandidates, nextWaitingDueAt, estimatedMinutes } from '../coach/candidates'
import { coachInput } from '../coach/recallAdapter'
import { localDate, validCoachState } from '../coach/planner'
import type { CoachPersisted } from '../coach/types'
import { content } from '../content'
import { isLegacyManagement, emptyGeneral } from '../general/data'
import { naturalTitleCompare } from '../general/naturalSort'
import type { Candidate, FusionDay, FusionDecision, FusionSettings, FusionState, GeneralPoint, SubjectPolicy, TrainingTask } from './types'
import { MANAGEMENT } from './types'

export const DEFAULT_POLICY: SubjectPolicy = { weight: 1, newCap: 3, chapterCap: 3 }
export function defaultFusion(now: number): FusionState {
  const settings: FusionSettings = { minutes: 60, subjects: {
    [MANAGEMENT]: { weight: 3, newCap: 2, chapterCap: 2 },
    '运动生理学': { weight: 2, newCap: 3, chapterCap: 3 },
    '体育概论': { weight: 1, newCap: 3, chapterCap: 3 },
  } }
  return { platformVersion: 1, general: emptyGeneral(), settings,
    day: { date: localDate(now), budgetMinutes: settings.minutes, closed: false, tasks: [], selectedChapters: {} }, active: null, session: null }
}
/** First launch upgrades the Alpha Lite day budget without re-rating its attempts. */
export function adoptAlphaDay(state: FusionState, mrc: CoachPersisted, now: number): FusionState {
  const old = mrc.coachState
  if (!validCoachState(old) || old.budgetMinutes < 15 || old.budgetMinutes > 600) return state
  const tasks: TrainingTask[] = []
  if (old.date === localDate(now)) for (const row of old.tasks) {
    const item = content.items.find(i => i.id === row.itemId)
    if (!item || row.status === 'queued') continue
    const attempt = row.status === 'completed' ? mrc.attempts.find(a => a.itemId === row.itemId && a.finishedAt === row.completedAt) : null
    const recall = row.status === 'in_progress' && mrc.recall?.itemId === row.itemId && mrc.recall.phase !== 'done' ? mrc.recall : null
    if (!attempt && !recall) continue
    tasks.push({ id: `fusion-alpha-${row.id}`, module: 'mrc', itemId: item.id, subject: MANAGEMENT, title: item.title,
      chapterKey: `mrc::${item.chapterId}`, isNew: row.kind === 'initial_recall', reason: row.reason, estimatedMinutes: row.estimatedMinutes,
      status: attempt ? 'completed' : 'in_progress', startedAt: attempt?.startedAt ?? recall!.startedAt,
      ...(attempt ? { resultId: attempt.id, completedAt: attempt.finishedAt } : {}) })
  }
  const active = tasks.find(t => t.status === 'in_progress') ?? null
  return { ...state, settings: { ...state.settings, minutes: old.budgetMinutes }, active,
    day: { ...state.day, budgetMinutes: old.budgetMinutes, tasks, closed: old.date === localDate(now) && old.closed } }
}
export function policyFor(state: FusionState, subject: string): SubjectPolicy {
  return Object.hasOwn(state.settings.subjects, subject) ? state.settings.subjects[subject] : DEFAULT_POLICY
}
export function spent(day: FusionDay): number {
  return day.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)
}
export function remaining(state: FusionState): number {
  return Math.max(0, state.day.budgetMinutes - spent(state.day))
}
export function rollDay(state: FusionState, now: number): FusionState {
  if (state.day.date === localDate(now)) return state
  const carry = state.active?.status === 'in_progress' ? [state.active] : []
  return { ...state, active: carry.length ? state.active : null, session: carry.length ? state.session : null,
    day: { date: localDate(now), budgetMinutes: state.settings.minutes, closed: false, tasks: carry, selectedChapters: {} } }
}
export function chapterKey(point: GeneralPoint): string {
  return `${point.subject}::${point.quotaChapterOverride?.trim() || point.title.match(/第\s*[一二两三四五六七八九十百零\d]+\s*章/)?.[0].replace(/\s/g, '') || `条目:${point.id}`}`
}
export function allCandidates(state: FusionState, mrc: CoachPersisted, now: number): Candidate[] {
  const management = buildCandidates(coachInput(mrc), now).map((c, index): Candidate => ({
    module: 'mrc', itemId: c.item.id, subject: MANAGEMENT, title: c.item.title, chapterKey: `mrc::${c.item.chapterId}`,
    isNew: !c.latest, reason: c.reason, estimatedMinutes: c.estimatedMinutes,
    dueAt: c.latest?.dueAt ?? now, tier: c.latest ? 0 : c.item.coreA ? 1 : 2 + index / 1000,
  }))
  const general = state.general.points.filter(p => !isLegacyManagement(p.subject) && p.dueDate <= now)
    .sort((a, b) => a.dueDate - b.dueDate || naturalTitleCompare(a.title, b.title))
    .map((p): Candidate => ({ module: 'general', itemId: p.id, subject: p.subject, title: p.title, chapterKey: chapterKey(p),
      isNew: p.totalReviews === 0, reason: p.totalReviews === 0 ? '这条知识点尚未训练，先闭卷输出，再核对原文。' : '复习时间已到，先检查能否独立回忆。',
      estimatedMinutes: p.content.length >= 600 || (p.checklist?.length ?? 0) >= 5 ? 15 : 10,
      dueAt: p.dueDate, tier: p.totalReviews === 0 ? 1 : 0 }))
  return [...management, ...general]
}
/** Lock each day's new chapter scope. Reviews always remain eligible within the hard time budget. */
export function lockChapters(state: FusionState, mrc: CoachPersisted, now: number): FusionState {
  const rolled = rollDay(state, now)
  const selected = { ...rolled.day.selectedChapters }
  const candidates = allCandidates(rolled, mrc, now).filter(c => c.isNew)
  for (const subject of new Set(candidates.map(c => c.subject))) {
    if (Object.hasOwn(selected, subject)) continue
    const keys = [...new Set(candidates.filter(c => c.subject === subject).map(c => c.chapterKey))]
    const cap = policyFor(rolled, subject).chapterCap
    selected[subject] = cap === 0 ? keys : keys.slice(0, cap)
  }
  return JSON.stringify(selected) === JSON.stringify(rolled.day.selectedChapters) ? rolled : { ...rolled, day: { ...rolled.day, selectedChapters: selected } }
}

export function reconcileMrc(state: FusionState, mrc: CoachPersisted, now: number): FusionState {
  // A successful module write can precede a failed platform write. Settle it in its original day first.
  if (state.active?.module === 'mrc' && state.active.status === 'in_progress') {
    const result = mrc.attempts.find(a => a.itemId === state.active!.itemId && a.startedAt === state.active!.startedAt)
    if (result) return rollDay(finishTask(state, result.id, result.finishedAt), now)
  }
  let next = rollDay(state, now)
  const recall = mrc.recall
  if (!recall || recall.phase === 'done') return next
  if (next.active?.module === 'mrc' && next.active.itemId === recall.itemId && next.active.startedAt === recall.startedAt) return next
  // A pre-existing MRC draft takes priority; never overwrite a different saved general session.
  if (next.active?.module === 'general' && next.active.status === 'in_progress') return next
  const item = content.items.find(i => i.id === recall.itemId)
  if (!item) return next
  const task: TrainingTask = { id: `fusion-resume-mrc-${recall.startedAt}-${item.id}`, module: 'mrc', itemId: item.id,
    subject: MANAGEMENT, title: item.title, chapterKey: `mrc::${item.chapterId}`, isNew: !mrc.attempts.some(a => a.itemId === item.id),
    reason: '继续上次未完成的管理学草稿与提示步骤。', estimatedMinutes: estimatedMinutes(item), status: 'in_progress', startedAt: recall.startedAt }
  next = { ...next, active: task, day: { ...next.day, tasks: [...next.day.tasks, task] } }
  return next
}
export function eligible(state: FusionState, candidate: Candidate): boolean {
  if (!candidate.isNew) return true
  const policy = policyFor(state, candidate.subject)
  const count = state.day.tasks.filter(t => t.subject === candidate.subject && t.isNew).length
  if (count >= policy.newCap) return false
  if (policy.chapterCap === 0) return true
  return (state.day.selectedChapters[candidate.subject] ?? []).includes(candidate.chapterKey)
}
export function decide(state: FusionState, mrc: CoachPersisted, now: number): FusionDecision {
  if (state.active?.status === 'in_progress') return { kind: 'resume', task: state.active }
  const candidates = allCandidates(state, mrc, now)
  const pending = candidates.filter(c => !c.isNew).length
  if (state.day.closed) return { kind: 'done', reason: 'closed', pending }
  if (remaining(state) < 5) return { kind: 'done', reason: 'budget', pending }
  const fits = candidates.filter(c => eligible(state, c) && c.estimatedMinutes <= remaining(state))
  const subjectLoad = (c: Candidate) => state.day.tasks.filter(t => t.subject === c.subject).reduce((s, t) => s + t.estimatedMinutes, 0) / policyFor(state, c.subject).weight
  fits.sort((a, b) => a.tier - b.tier || subjectLoad(a) - subjectLoad(b) || policyFor(state, b.subject).weight - policyFor(state, a.subject).weight || a.dueAt - b.dueAt)
  if (fits.length) return { kind: 'next', candidate: fits[0] }
  if (candidates.length) return { kind: 'done', reason: candidates.some(c => eligible(state, c)) ? 'budget' : 'quota', pending }
  const mrcDue = nextWaitingDueAt(coachInput(mrc), now)
  const future = state.general.points.filter(p => !isLegacyManagement(p.subject) && p.dueDate > now).map(p => p.dueDate)
  if (mrcDue !== null) future.push(mrcDue)
  if (future.length) return { kind: 'wait', dueAt: Math.min(...future), pending }
  return { kind: 'done', reason: 'empty', pending }
}
export function beginTask(state: FusionState, candidate: Candidate, now: number): FusionState {
  if (state.active?.status === 'in_progress') return state
  if (state.day.closed || !eligible(state, candidate) || candidate.estimatedMinutes > remaining(state)) return state
  const task: TrainingTask = { ...candidate, id: `fusion-${candidate.module}-${candidate.itemId}-${now}`, status: 'in_progress', startedAt: now }
  return { ...state, active: task, day: { ...state.day, tasks: [...state.day.tasks, task] },
    session: candidate.module === 'general' ? { taskId: task.id, itemId: task.itemId, phase: 'draft', draft: '', frozenDraft: null, checked: [], rating: null } : null }
}
export function finishTask(state: FusionState, resultId: string, now: number): FusionState {
  if (!state.active || state.active.status === 'completed') return state
  const task: TrainingTask = { ...state.active, status: 'completed', completedAt: now, resultId }
  return { ...state, active: task, day: { ...state.day, tasks: state.day.tasks.map(t => t.id === task.id ? task : t) } }
}

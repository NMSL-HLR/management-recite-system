import { buildCandidates, nextWaitingDueAt, estimatedMinutes, trainingItems, latestAttempts } from '../coach/candidates'
import { coachInput } from '../coach/recallAdapter'
import { localDate, validCoachState } from '../coach/planner'
import type { CoachPersisted } from '../coach/types'
import { content } from '../content'
import { isLegacyManagement, emptyGeneral } from '../general/data'
import { compareGeneralPoints } from '../general/textbook'
import type { Candidate, FusionDay, FusionDecision, FusionSettings, FusionState, GeneralPoint, PracticeScope, SubjectPolicy, TrainingTask } from './types'
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
export const RELEARNING_PAUSE_MS = 20 * 60_000
export function generalReadyAt(point: GeneralPoint): number {
  return point.state === 'relearning' && typeof point.lastReviewedAt === 'number'
    ? Math.max(point.dueDate, point.lastReviewedAt + RELEARNING_PAUSE_MS) : point.dueDate
}
export function allCandidates(state: FusionState, mrc: CoachPersisted, now: number): Candidate[] {
  const management = buildCandidates(coachInput(mrc), now).map((c, index): Candidate => ({
    module: 'mrc', itemId: c.item.id, subject: MANAGEMENT, title: c.item.title, chapterKey: `mrc::${c.item.chapterId}`,
    isNew: !c.latest, reason: c.reason, estimatedMinutes: c.estimatedMinutes,
    dueAt: c.latest?.dueAt ?? now, tier: c.latest ? 0 : c.item.coreA ? 1 : 2 + index / 1000,
  }))
  const general = state.general.points.filter(p => !isLegacyManagement(p.subject) && !p.trainingBlocked && generalReadyAt(p) <= now)
    .sort((a, b) => a.dueDate - b.dueDate || compareGeneralPoints(a, b))
    .map((p): Candidate => ({ module: 'general', itemId: p.id, subject: p.subject, title: p.title, chapterKey: chapterKey(p),
      isNew: p.totalReviews === 0, reason: p.totalReviews === 0 ? '这条知识点尚未训练，先闭卷输出，再核对原文。' : '复习时间已到，先检查能否独立回忆。',
      estimatedMinutes: p.content.length >= 600 || (p.checklist?.length ?? 0) >= 5 ? 15 : 10,
      dueAt: generalReadyAt(p), tier: p.totalReviews === 0 ? 1 : 0 }))
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

/** Keep a forensic copy of retired tasks; they no longer reserve today's training budget. */
export function retireUnavailableMrc(state: FusionState): FusionState {
  const retired = state.day.tasks.filter(t => t.module === 'mrc' && t.status === 'in_progress' && !content.items.some(i => i.id === t.itemId))
  if (!retired.length) return state
  return { ...state, active: state.active && retired.some(t => t.id === state.active!.id) ? null : state.active,
    day: { ...state.day, tasks: state.day.tasks.filter(t => !retired.includes(t)) },
    unavailableTasks: [...new Map([...(state.unavailableTasks ?? []), ...retired].map(t => [t.id, t])).values()] }
}

export function settleSavedMrc(state: FusionState, mrc: CoachPersisted): FusionState {
  if (state.active?.module === 'mrc' && state.active.status === 'in_progress') {
    const result = mrc.attempts.find(a => a.itemId === state.active!.itemId && a.startedAt === state.active!.startedAt)
    if (result) return finishTask(state, result.id, result.finishedAt)
  }
  return state
}

export function reconcileMrc(state: FusionState, mrc: CoachPersisted, now: number): FusionState {
  // Settle successful writes before retiring missing items or rolling into a new day.
  const settled = settleSavedMrc(state, mrc)
  if (settled !== state) return rollDay(settled, now)
  state = retireUnavailableMrc(state)
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
  const stale = next.day.tasks.filter(t => t.module === 'mrc' && t.status === 'in_progress')
  next = { ...next, active: task, day: { ...next.day, tasks: [...next.day.tasks.filter(t => !stale.includes(t)), task] }, ...(stale.length ? { unavailableTasks: [...new Map([...(next.unavailableTasks ?? []), ...stale].map(t => [t.id, t])).values()] } : {}) }
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
  const candidates = allCandidates(state, mrc, now).filter(c => subjectAllowed(state, c.subject))
  const pending = candidates.filter(c => !c.isNew).length
  if (state.day.closed) return { kind: 'done', reason: 'closed', pending }
  if (state.day.practice) {
    const practice = practiceCandidates(state, mrc, state.day.practice, now)
    if (!practice.length) return { kind: 'done', reason: 'practice', pending: 0 }
    const candidate = practice.find(c => c.estimatedMinutes <= remaining(state))
    return candidate ? { kind: 'next', candidate } : { kind: 'done', reason: 'budget', pending: practice.filter(c => !c.isNew).length }
  }
  if (remaining(state) < 5) return { kind: 'done', reason: 'budget', pending }
  const fits = candidates.filter(c => eligible(state, c) && c.estimatedMinutes <= remaining(state))
  const subjectLoad = (c: Candidate) => state.day.tasks.filter(t => t.subject === c.subject).reduce((s, t) => s + t.estimatedMinutes, 0) / policyFor(state, c.subject).weight
  fits.sort((a, b) => a.tier - b.tier || subjectLoad(a) - subjectLoad(b) || policyFor(state, b.subject).weight - policyFor(state, a.subject).weight || a.dueAt - b.dueAt)
  if (fits.length) return { kind: 'next', candidate: fits[0] }
  if (candidates.some(c => eligible(state, c))) return { kind: 'done', reason: 'budget', pending }
  const mrcDue = subjectAllowed(state, MANAGEMENT) ? nextWaitingDueAt(coachInput(mrc), now) : null
  const future = state.general.points.filter(p => !isLegacyManagement(p.subject) && !p.trainingBlocked && subjectAllowed(state, p.subject) && generalReadyAt(p) > now).map(generalReadyAt)
  if (mrcDue !== null) future.push(mrcDue)
  if (future.length) return { kind: 'wait', dueAt: Math.min(...future), pending }
  return { kind: 'done', reason: candidates.length ? 'quota' : 'empty', pending }
}
export function beginTask(state: FusionState, candidate: Candidate, now: number): FusionState {
  if (state.active?.status === 'in_progress') return state
  const explicit = state.day.practice?.module === candidate.module && state.day.practice.itemIds.includes(candidate.itemId)
  if (state.day.closed || (!explicit && (!subjectAllowed(state, candidate.subject) || !eligible(state, candidate))) || candidate.estimatedMinutes > remaining(state)) return state
  const task: TrainingTask = { ...candidate, id: `fusion-${candidate.module}-${candidate.itemId}-${now}`, status: 'in_progress', startedAt: now }
  return { ...state, active: task, day: { ...state.day, tasks: [...state.day.tasks, task] },
    session: candidate.module === 'general' ? { taskId: task.id, itemId: task.itemId, phase: 'draft', draft: '', frozenDraft: null, checked: [], rating: null } : null }
}
export function finishTask(state: FusionState, resultId: string, now: number): FusionState {
  if (!state.active || state.active.status === 'completed') return state
  const task: TrainingTask = { ...state.active, status: 'completed', completedAt: now, resultId }
  const practice = state.day.practice
  return { ...state, active: task, day: { ...state.day, tasks: state.day.tasks.map(t => t.id === task.id ? task : t),
    ...(practice ? { practice: { ...practice, itemIds: practice.module === task.module ? practice.itemIds.filter(id => id !== task.itemId) : practice.itemIds } } : {}) } }
}


export function subjectAllowed(state: FusionState, subject: string): boolean {
  return !state.day.subjects || state.day.subjects.includes(subject)
}
export function availableSubjects(state: FusionState): string[] {
  return [...new Set([MANAGEMENT, '运动生理学', '体育概论', ...state.general.points.filter(p => !isLegacyManagement(p.subject)).map(p => p.subject)])]
}
export function selectSubjects(state: FusionState, subjects: string[] | null): FusionState {
  const selected = subjects === null ? undefined : [...new Set(subjects)].filter(s => availableSubjects(state).includes(s))
  if (selected && !selected.length) return state
  const { subjects: _old, practice: _practice, ...day } = state.day
  return { ...state, day: { ...day, ...(selected ? { subjects: selected } : {}) } }
}
/** Explicit library selection uses original IDs and due dates, including early reviews on request. */
export function libraryCandidates(state: FusionState, mrc: CoachPersisted, now: number): Candidate[] {
  const latest = latestAttempts(mrc.attempts)
  const management = trainingItems({ ...coachInput(mrc), includeAppendix2: true }).map((item): Candidate => {
    const attempt = latest.get(item.id)
    return { module: 'mrc', itemId: item.id, title: item.title, subject: MANAGEMENT, chapterKey: `mrc::${item.chapterId}`,
      isNew: !attempt, dueAt: attempt?.dueAt ?? now, tier: attempt ? 0 : 1, estimatedMinutes: estimatedMinutes(item), reason: '' }
  })
  const general = state.general.points.filter(p => !p.trainingBlocked && !isLegacyManagement(p.subject)).map((p): Candidate => ({
    module: 'general', itemId: p.id, title: p.title, subject: p.subject, chapterKey: chapterKey(p), isNew: p.totalReviews === 0,
    dueAt: generalReadyAt(p), tier: p.totalReviews ? 0 : 1, estimatedMinutes: p.content.length >= 600 || (p.checklist?.length ?? 0) >= 5 ? 15 : 10, reason: '',
  }))
  return [...management, ...general].map(c => ({ ...c, reason: c.isNew ? '你自主选择的未训练题，先闭卷输出，再按原流程核对。' : c.dueAt > now ? '你主动提前练习这道题；保存后仍按原引擎安排下次复测。' : '你选择的范围内，这道题已到复测时间。' }))
}
export function practiceCandidates(state: FusionState, mrc: CoachPersisted, scope: PracticeScope, now: number): Candidate[] {
  const ids = new Set(scope.itemIds)
  return libraryCandidates(state, mrc, now).filter(c => c.module === scope.module && ids.has(c.itemId) && (scope.kind === 'item' || c.isNew || c.dueAt <= now))
    .sort((a, b) => Number(a.isNew) - Number(b.isNew) || a.dueAt - b.dueAt || scope.itemIds.indexOf(a.itemId) - scope.itemIds.indexOf(b.itemId))
}
export function preparePractice(state: FusionState, mrc: CoachPersisted, request: PracticeScope, now: number) {
  const candidates = practiceCandidates(state, mrc, request, now)
  const scope: PracticeScope = { ...request, itemIds: candidates.map(c => c.itemId) }
  const candidate = candidates.find(c => c.estimatedMinutes <= remaining(state)) ?? candidates[0]
  const extraMinutes = candidate ? Math.max(0, spent(state.day) + candidate.estimatedMinutes - state.day.budgetMinutes) : 0
  return { scope, candidate, extraMinutes, budgetMinutes: state.day.budgetMinutes + extraMinutes }
}
/** The caller must explicitly confirm the shown budget/reopen changes. No scheduling evidence is written. */
export function beginPractice(state: FusionState, mrc: CoachPersisted, request: PracticeScope, now: number): FusionState {
  if (state.active?.status === 'in_progress') return state
  const preview = preparePractice(state, mrc, request, now)
  if (!preview.candidate || preview.budgetMinutes > 600) return state
  return beginTask({ ...state, day: { ...state.day, closed: false, budgetMinutes: preview.budgetMinutes, practice: preview.scope } }, preview.candidate, now)
}

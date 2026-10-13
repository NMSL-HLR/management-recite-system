import { createPoint, DAY, schedule, startOfDay } from './scheduler'
import type { Rating, ReviewLog } from './types'
import type { GeneralData, GeneralPoint, GeneralReviewLog } from '../fusion/types'

export function isLegacyManagement(subject: string): boolean {
  return ['体育管理学', '体育管理', '管理学', '马工程', '张瑞林'].includes(subject.trim())
}
export function emptyGeneral(): GeneralData {
  return { points: [], logs: [], logsArchive: [], subjects: ['运动生理学', '体育概论', '体育管理学', '其他'], settings: {} }
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const object = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === 'object' && !Array.isArray(x))

/** Preserve V13 extension fields. Invalid rows stop import rather than disappearing. */
export function normalizeGeneral(input: unknown): GeneralData {
  if (!object(input) || !Array.isArray(input.points)) throw new Error('旧记忆引擎备份缺少 points 数组。')
  const ids = new Set<string>()
  const points = input.points.map((raw, index): GeneralPoint => {
    if (!object(raw) || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id)) throw new Error(`第 ${index + 1} 条知识点缺少唯一 id。`)
    ids.add(raw.id)
    if (typeof raw.subject !== 'string' || !raw.subject.trim() || typeof raw.title !== 'string' || typeof raw.content !== 'string') throw new Error(`知识点 ${raw.id} 缺少科目、标题或正文。`)
    for (const key of ['createdAt', 'dueDate', 'interval', 'repetitions', 'totalReviews', 'lapses']) {
      if (!finite(raw[key]) || raw[key] < 0) throw new Error(`知识点 ${raw.id} 的 ${key} 不合法。`)
    }
    if (!['new', 'learning', 'review', 'relearning'].includes(String(raw.state))) throw new Error(`知识点 ${raw.id} 的状态不合法。`)
    if (raw.lastReviewedAt !== undefined && (!finite(raw.lastReviewedAt) || raw.lastReviewedAt < 0)) throw new Error(`知识点 ${raw.id} 的复习时间不合法。`)
    const checklist = raw.checklist ?? []
    if (!Array.isArray(checklist) || checklist.some(x => typeof x !== 'string')) throw new Error(`知识点 ${raw.id} 的核对清单不合法。`)
    const leaks = raw.leaks ?? []
    if (!Array.isArray(leaks) || leaks.some(x => !object(x) || typeof x.label !== 'string' || !finite(x.due))) throw new Error(`知识点 ${raw.id} 的补漏清单不合法。`)
    const tags = raw.tags ?? []
    if (!Array.isArray(tags) || tags.some(x => typeof x !== 'string' && (!object(x) || typeof x.label !== 'string' || typeof x.color !== 'string'))) throw new Error(`知识点 ${raw.id} 的标签不合法。`)
    // Same EF-to-D compatibility rule as the supplied v7.3 store.
    const ef = finite(raw.ef) ? raw.ef : 2.5
    const difficulty = finite(raw.difficulty) ? raw.difficulty : Math.round((1 + ((3 - ef) / 1.7) * 9) * 100) / 100
    return { ...raw, tags: tags.map(x => typeof x === 'string' ? { label: x, color: 'bg-blue-500' } : x), checklist, leaks,
      difficulty: Math.min(10, Math.max(1, difficulty)), stability: finite(raw.stability) && raw.stability > 0 ? raw.stability : Math.max(0.4, Number(raw.interval) || 0.4) } as GeneralPoint
  })
  const validateLogs = (value: unknown): ReviewLog[] => {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error('复习日志应为数组。')
    const logIds = new Set<string>()
    for (const row of value) {
      if (!object(row) || typeof row.id !== 'string' || logIds.has(row.id) || typeof row.pointId !== 'string' || typeof row.subject !== 'string' || !finite(row.reviewedAt) || ![1, 2, 3, 4].includes(Number(row.rating)) || !finite(row.intervalBefore) || !finite(row.intervalAfter)) throw new Error('有复习日志格式不合法或 id 重复。')
      logIds.add(row.id)
    }
    return value as ReviewLog[]
  }
  return { ...input, points, logs: validateLogs(input.logs), logsArchive: validateLogs(input.logsArchive),
    subjects: Array.isArray(input.subjects) && input.subjects.every(x => typeof x === 'string') ? input.subjects : emptyGeneral().subjects,
    settings: object(input.settings) ? input.settings : {} }
}

export function addGeneralPoint(data: GeneralData, input: { subject: string; title: string; content: string; checklist: string[]; chapter: string }, now: number): GeneralData {
  if (isLegacyManagement(input.subject)) throw new Error('管理学训练请使用 MRC；旧管理学条目可通过备份保留。')
  if (!input.title.trim() || !input.content.trim()) throw new Error('请填写标题与正文。')
  const point = { ...createPoint({ ...input, title: input.title.trim(), content: input.content.trim(), tags: [] }, now),
    id: `kp_${now}_${crypto.randomUUID()}`, quotaChapterOverride: input.chapter.trim() }
  return { ...data, points: [...data.points, point], subjects: [...new Set([...data.subjects, input.subject])] }
}

/** Original v7.3 FSRS core; V13 retention settings are applied only to interval inversion. */
export function scheduleGeneral(point: GeneralPoint, rating: Rating, now: number, settings: Record<string, unknown>) {
  const patch = schedule(point, rating, now)
  const valid = (value: unknown, fallback: number, min: number, max: number) => finite(value) && value >= min && value <= max ? value : fallback
  const threshold = valid(settings.retentionChecklistThreshold, 5, 0, 50)
  const ordinary = valid(settings.standardTargetRetention ?? settings.standardRetention, 0.9, 0.8, 0.99)
  const intensive = valid(settings.intensiveTargetRetention ?? settings.largeChecklistRetention, 0.95, 0.8, 0.99)
  if (rating === 1) return patch
  const dr = (point.checklist?.length ?? 0) >= threshold ? intensive : ordinary
  const decay = -0.1542
  const factor = Math.pow(0.9, 1 / decay) - 1
  const interval = Math.min(365, Math.max(1, Math.round((patch.stability / factor) * (Math.pow(dr, 1 / decay) - 1))))
  return { ...patch, interval, dueDate: startOfDay(now) + interval * DAY }
}

export function reviewGeneral(data: GeneralData, pointId: string, rating: Rating, checked: string[], resultId: string, now: number, evidence?: { draft: string; startedAt: number }): GeneralData {
  if ([...data.logs, ...data.logsArchive].some(log => log.id === resultId)) return data
  const point = data.points.find(p => p.id === pointId)
  if (!point || isLegacyManagement(point.subject)) throw new Error('知识点不存在或属于旧管理学资料。')
  const patch = scheduleGeneral(point, rating, now, data.settings)
  const missed = (point.checklist ?? []).filter(label => !checked.includes(label))
  const leaks = [...(point.leaks ?? []).filter(x => !missed.includes(x.label) && !checked.includes(x.label)), ...missed.map(label => ({ label, due: startOfDay(now) + DAY }))]
  const log: GeneralReviewLog = { id: resultId, pointId, subject: point.subject, reviewedAt: now, rating,
    intervalBefore: point.interval, intervalAfter: patch.interval,
    previousState: { difficulty: point.difficulty, interval: point.interval, repetitions: point.repetitions, stability: point.stability,
      dueDate: point.dueDate, state: point.state, lastReviewedAt: point.lastReviewedAt, totalReviews: point.totalReviews, lapses: point.lapses,
      leaks: point.leaks ?? [], postponedUntil: point.postponedUntil },
    ...(evidence ? { preRevealDraft: evidence.draft, checkedLabels: checked, durationSeconds: Math.max(0, Math.round((now - evidence.startedAt) / 1000)) } : {}) }
  // Keep all historical logs; persistence failures never silently archive/drop evidence.
  return { ...data, points: data.points.map(p => p.id === pointId ? { ...p, ...patch, leaks, postponedUntil: undefined } : p), logs: [...data.logs, log] }
}

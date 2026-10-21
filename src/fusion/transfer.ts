import { reconcileContent, inspectPreservingImport } from '../state/contentRecovery'
import { content } from '../content'
import { validateMrcFields } from './validateMrc'
import { mergeTextbook } from '../general/textbook'
import { textbookChanges, type TextbookChange } from '../general/revisions'
import type { GeneralData, GeneralPoint } from './types'
import type { CoachPersisted } from '../coach/types'
import { defaultPersisted, defaultSettings } from '../state/defaults'
import { normalizeUiSettings } from '../state/uiSettings'
import { inspectImport } from '../engine/transfer'
import { DATA_KEY, type Kv } from '../engine/storage'
import { emptyGeneral, normalizeGeneral, isLegacyManagement } from '../general/data'
import { defaultFusion, retireUnavailableMrc, settleSavedMrc } from './planner'
import { FUSION_BACKUP_KEY, JOURNAL_KEY, PLATFORM_KEY, type FusionState } from './types'

const obj = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === 'object' && !Array.isArray(x))
const num = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max
export function validatePlatform(value: unknown, trustedGeneral?: GeneralData): FusionState {
  if (!obj(value) || value.platformVersion !== 1) throw new Error('不支持这份全科平台数据版本。')
  const { settings, day, active, session } = value
  if (!obj(settings) || !num(settings.minutes, 15, 600) || !obj(settings.subjects)) throw new Error('全科预算设置不合法。')
  for (const p of Object.values(settings.subjects)) {
    if (!obj(p) || !num(p.weight, 1, 10) || !num(p.newCap, 0, 50) || !Number.isInteger(p.newCap) || !num(p.chapterCap, 0, 20) || !Number.isInteger(p.chapterCap)) throw new Error('科目配额设置不合法。')
  }
  if (!obj(day) || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !num(day.budgetMinutes, 15, 600) || typeof day.closed !== 'boolean' || !Array.isArray(day.tasks) || day.tasks.length > 1000 || !obj(day.selectedChapters)) throw new Error('今日计划结构不合法。')
  if (day.subjects !== undefined && (!Array.isArray(day.subjects) || day.subjects.length < 1 || day.subjects.length > 100 || day.subjects.some(s => typeof s !== 'string' || !s.trim() || s.length > 200) || new Set(day.subjects).size !== day.subjects.length)) throw new Error('今日科目选择不合法。')
  if (day.practice !== undefined) {
    const p = day.practice
    if (!obj(p) || typeof p.module !== 'string' || !['mrc', 'general'].includes(p.module) || typeof p.kind !== 'string' || !['item', 'chapter'].includes(p.kind) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 1000 || !Array.isArray(p.itemIds) || p.itemIds.length > 1000 || (p.kind === 'item' && p.itemIds.length > 1) || p.itemIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(p.itemIds).size !== p.itemIds.length) throw new Error('自主练习范围不合法。')
  }
  for (const chapters of Object.values(day.selectedChapters)) {
    if (!Array.isArray(chapters) || chapters.some(x => typeof x !== 'string')) throw new Error('章节范围不合法。')
  }
  const validTask = (t: unknown) => obj(t) && typeof t.id === 'string' && typeof t.itemId === 'string' && typeof t.subject === 'string' && typeof t.title === 'string' && typeof t.chapterKey === 'string' && typeof t.reason === 'string' && typeof t.isNew === 'boolean' && typeof t.module === 'string' && ['mrc', 'general'].includes(t.module) && typeof t.status === 'string' && ['in_progress', 'completed'].includes(t.status) && num(t.estimatedMinutes, 5, 120) && num(t.startedAt) && (t.status !== 'completed' || (typeof t.resultId === 'string' && num(t.completedAt)))
  if (day.tasks.some(t => !validTask(t)) || new Set(day.tasks.map(t => t.id)).size !== day.tasks.length || (active !== null && !validTask(active))) throw new Error('训练任务不合法。')
  if (active !== null && !day.tasks.some(t => obj(active) && Object.keys(t).length === Object.keys(active).length && Object.entries(t).every(([key, v]) => active[key] === v))) throw new Error('当前任务与今日计划不一致。')
  if (day.tasks.filter(t => t.status === 'in_progress').length > 1 || (day.tasks.some(t => t.status === 'in_progress') && (!obj(active) || active.status !== 'in_progress'))) throw new Error('存在冲突的未完成任务。')
  if (value.unavailableTasks !== undefined && (!Array.isArray(value.unavailableTasks) || value.unavailableTasks.some(t => !validTask(t)))) throw new Error('待查任务结构不合法。')
  const general = value.general === trustedGeneral && trustedGeneral ? trustedGeneral : normalizeGeneral(value.general)
  if (session !== null) {
    if (!obj(session) || !obj(active) || active.module !== 'general' || session.taskId !== active.id || session.itemId !== active.itemId || (typeof session.phase !== 'string' || !['draft', 'compare', 'done'].includes(session.phase)) || typeof session.draft !== 'string' || (session.frozenDraft !== null && typeof session.frozenDraft !== 'string') || !Array.isArray(session.checked) || session.checked.some(x => typeof x !== 'string') || (session.rating !== null && (typeof session.rating !== 'number' || ![1, 2, 3, 4].includes(session.rating)))) throw new Error('通用训练草稿不合法。')
    if (!general.points.some(p => p.id === session.itemId && !isLegacyManagement(p.subject))) throw new Error('草稿对应的知识点不存在。')
    if ((active.status === 'completed') !== (session.phase === 'done')) throw new Error('草稿阶段与任务状态不一致。')
    if (session.phase !== 'draft' && typeof session.frozenDraft !== 'string') throw new Error('揭晓前草稿缺失。')
    if (session.phase === 'done' && ![...general.logs, ...general.logsArchive].some(l => l.id === session.resultId && l.id === active.resultId && l.pointId === active.itemId)) throw new Error('完成任务缺少原始复习日志。')
  } else if (obj(active) && active.module === 'general') throw new Error('通用任务缺少草稿。')
  return { ...value, general } as unknown as FusionState
}

export function validateMrcSnapshot(value: unknown, current: CoachPersisted): CoachPersisted {
  const plan = inspectImport(JSON.stringify(value), current, content.meta, new Set(content.items.map(i => i.id)))
  if (!plan.ok) throw new Error(plan.error)
  if (!obj(value)) throw new Error('管理学记录不合法。')
  if (plan.summary.crossSchema || (plan.summary.crossVersion && value.contentVersion !== '2026-10-11-v1')) throw new Error('这份备份的教材或数据结构版本不受支持，请单独导入管理学 JSON。')
  for (const key of ['notes', 'bookmarks', 'customKeywords', 'migrationReview', 'recallQueue']) if (!Array.isArray(value[key])) throw new Error(`管理学备份缺少 ${key}。`)
  for (const key of ['relationOverrides', 'keywordOverrides', 'settings', 'library']) if (!obj(value[key])) throw new Error(`管理学备份缺少 ${key}。`)
  const parsed = value as unknown as CoachPersisted
  for (const attempt of parsed.attempts) {
    if (!num(attempt.startedAt) || !num(attempt.finishedAt) || !num(attempt.durationSeconds) || !Array.isArray(attempt.checkedPointIds) || !Array.isArray(attempt.missingPointIds) || !Array.isArray(attempt.termErrors) || !Array.isArray(attempt.redlineErrors) || !Array.isArray(attempt.hintSequence) || !num(attempt.selfConfidence, 1, 5) || (attempt.dueAt !== undefined && !num(attempt.dueAt))) throw new Error('管理学训练记录不完整。')
  }
  if (parsed.recall !== null) {
    const r = parsed.recall
    if (!obj(r) || !['draft', 'b_skeleton', 'headings', 'keywords', 'compare', 'restate', 'done'].includes(r.phase) || !num(r.startedAt) || typeof r.draft !== 'string' || typeof r.restatement !== 'string' || typeof r.termErrorDraft !== 'string' || typeof r.userNote !== 'string' || !Array.isArray(r.checkedPointIds) || !Array.isArray(r.redlineErrorIds) || !Array.isArray(r.hintSequence) || !['none', 'heading', 'keyword', 'full_answer'].includes(r.highestHintUsed)) throw new Error('管理学草稿不完整。')
    if (r.frozenDraft !== null && (!obj(r.frozenDraft) || typeof r.frozenDraft.text !== 'string' || !num(r.frozenDraft.createdAt))) throw new Error('管理学冻结草稿不合法。')
  }
  if (parsed.exam !== null) {
    const e = parsed.exam
    if (!obj(e) || typeof e.id !== 'string' || !Array.isArray(e.itemIds) || e.itemIds.some(id => typeof id !== 'string') || !num(e.index) || !num(e.startedAt) || !obj(e.answers) || (e.limitSeconds !== null && !num(e.limitSeconds, 1))) throw new Error('闭卷考试状态不合法。')
  }
  validateMrcFields(parsed)
  return reconcileContent({ ...defaultPersisted(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings, ...normalizeUiSettings(parsed.settings),
    gaps: { ...defaultSettings().gaps, ...parsed.settings.gaps }, day: { ...defaultSettings().day, ...parsed.settings.day } } })
}

export interface FusionImportPlan { platform: FusionState; mrc: CoachPersisted; kind: '旧记忆引擎' | '管理学 JSON' | '全科整包' | '教材资料'; summary: string; textbook?: { packId: string; points: GeneralPoint[]; changes: TextbookChange[] } }
export function inspectFusionImport(raw: string, platform: FusionState, mrc: CoachPersisted): FusionImportPlan {
  const data: unknown = JSON.parse(raw)
  if (!obj(data)) throw new Error('文件不是有效的备份对象。')
  if (data.format === '346-textbook') {
    if (data.packVersion !== 1 || typeof data.packId !== 'string' || !data.packId) throw new Error('教材资料版本或标识不合法。')
    if (!Array.isArray(data.points) || (data.referencePoints !== undefined && !Array.isArray(data.referencePoints))) throw new Error('教材题目应为数组。')
    const incoming = normalizeGeneral({ ...data, points: [...data.points, ...(Array.isArray(data.referencePoints) ? data.referencePoints : [])] })
    // Older builds preserve the textbook format field in later personal exports.
    // Those exports must use history merge, not the content-only path that ignores logs.
    if (incoming.logs.length || incoming.logsArchive.length || incoming.points.some(p => p.totalReviews > 0 || p.lastReviewedAt !== undefined)) {
      return inspectFusionImport(JSON.stringify({ ...incoming, format: '346-legacy-progress' }), platform, mrc)
    }
    const changes = textbookChanges(platform.general, incoming.points, data.packId, platform.active?.status === 'in_progress' ? platform.active.itemId : undefined)
    const general = mergeTextbook(platform.general, incoming.points, data.packId)
    const added = general.points.length - platform.general.points.length
    return { platform: { ...platform, general }, mrc, kind: '教材资料', textbook: { packId: data.packId, points: incoming.points, changes }, summary: `共 ${incoming.points.length} 题，新增 ${added} 题，已有 ${incoming.points.length - added} 题默认保留；${changes.length} 题有教材差异，可逐题选择修订（会替换所选题的正文与核对清单，保留学习记录）。包含待补充题 ${incoming.points.filter(p => p.trainingBlocked).length} 道，仅供查询。不会覆盖已有作答、评分、复测时间、当前草稿或今日预算。` }
  }
  if (data.format === '346-fusion') {
    if (data.platformVersion !== 1) throw new Error('整包备份版本比程序新或无法识别。')
    const nextMrc = validateMrcSnapshot(data.mrc, mrc)
    const next = retireUnavailableMrc(settleSavedMrc(validatePlatform(data.platform), nextMrc))
    if (next.active?.module === 'mrc' && next.active.status === 'in_progress' && (!nextMrc.recall || nextMrc.recall.phase === 'done' || nextMrc.recall.itemId !== next.active.itemId || nextMrc.recall.startedAt !== next.active.startedAt)) throw new Error('管理学当前任务与备份草稿不一致。')
    if (next.active?.module === 'general' && next.active.status === 'in_progress' && nextMrc.recall && nextMrc.recall.phase !== 'done') throw new Error('备份存在两个同时进行的训练，请先分别恢复。')
    return { platform: next, mrc: nextMrc, kind: '全科整包', summary: `恢复整包：${next.general.points.length} 条旧引擎知识点、${nextMrc.attempts.length} 条管理学训练，以及预算和未完成草稿。旧教材记录保留；不在当前教材的题目、草稿及考试归入管理学待查，不计入新题成绩。将替换当前两份模块数据；导入前自动备份。` }
  }
  if (platform.active?.status === 'in_progress' || (mrc.recall && mrc.recall.phase !== 'done')) throw new Error('请先完成当前训练，再合并旧备份；当前草稿已保留。完整整包恢复可替换草稿。')
  if (Array.isArray(data.points)) {
    const incoming = normalizeGeneral(data)
    const merge = <T extends { id: string }>(old: T[], fresh: T[]) => [...new Map([...old, ...fresh].map(x => [x.id, x])).values()]
    const incomingIds = new Set([...incoming.logs, ...incoming.logsArchive].map(l => l.id))
    const general = { ...platform.general, ...incoming,
      settings: { ...platform.general.settings, ...incoming.settings },
      points: merge(platform.general.points, incoming.points), logs: merge(platform.general.logs.filter(l => !incomingIds.has(l.id)), incoming.logs), logsArchive: merge(platform.general.logsArchive.filter(l => !incomingIds.has(l.id)), incoming.logsArchive),
      subjects: [...new Set([...platform.general.subjects, ...incoming.subjects])] }
    const overlap = incoming.points.filter(p => platform.general.points.some(o => o.id === p.id)).length
    const legacy = incoming.points.filter(p => isLegacyManagement(p.subject)).length
    return { platform: { ...platform, general, active: null, session: null }, mrc, kind: '旧记忆引擎',
      summary: `导入 ${incoming.points.length} 条知识点、${incoming.logs.length} 条日志。同 id 覆盖 ${overlap} 条，其余合并；${legacy} 条旧管理学仅保留查询，不与 MRC 重复派题。旧扩展字段保留，今日预算不重置。` }
  }
  const plan = inspectPreservingImport(raw, mrc)
  if (!plan.ok) throw new Error(plan.error)
  return { platform, mrc: validateMrcSnapshot(plan.next, mrc), kind: '管理学 JSON', summary: `按原导入规则合并：新增 ${plan.summary.added} 条、替换 ${plan.summary.replaced} 条、待查 ${plan.summary.unmatched} 条。${plan.summary.message}` }
}
export function makeEnvelope(platform: FusionState, mrc: CoachPersisted) {
  return { format: '346-fusion', platformVersion: 1, exportedAt: new Date().toISOString(), platform, mrc }
}

/** Journaled two-key transaction; committed journal survives a failed remove and replays both new values. */
export function writeBundle(kv: Kv, platform: FusionState, mrc: CoachPersisted, backup = true): { ok: boolean; error?: string; needsRecovery?: boolean } {
  let journalWritten = false
  let previous: Record<string, string | null> = {}
  try {
    validatePlatform(platform)
    validateMrcFields(mrc)
    previous = { [PLATFORM_KEY]: kv.getItem(PLATFORM_KEY), [DATA_KEY]: kv.getItem(DATA_KEY) }
    if (backup) kv.setItem(FUSION_BACKUP_KEY, JSON.stringify(previous))
    const next = { [PLATFORM_KEY]: JSON.stringify(platform), [DATA_KEY]: JSON.stringify(mrc) }
    kv.setItem(JOURNAL_KEY, JSON.stringify({ phase: 'pending', previous, next }))
    journalWritten = true
    for (const [key, value] of Object.entries(next)) kv.setItem(key, value)
    kv.setItem(JOURNAL_KEY, JSON.stringify({ phase: 'committed', previous, next }))
    try { kv.removeItem(JOURNAL_KEY) } catch { return { ok: true, needsRecovery: true } }
    return { ok: true }
  } catch (error) {
    if (journalWritten) {
      try {
        for (const [key, value] of Object.entries(previous)) value === null ? kv.removeItem(key) : kv.setItem(key, value)
        kv.removeItem(JOURNAL_KEY)
      } catch { return { ok: false, error: '写入与恢复均失败。已保留恢复日志，请释放存储空间后重新打开程序。' } }
    }
    return { ok: false, error: `导入未完成，当前数据已保留：${error instanceof Error ? error.message : String(error)}` }
  }
}
export function recoverImport(kv: Kv): string | null {
  try {
    const raw = kv.getItem(JOURNAL_KEY)
    if (!raw) return null
    const journal = JSON.parse(raw)
    if (!obj(journal) || !['pending', 'committed'].includes(String(journal.phase)) || !obj(journal.previous) || !obj(journal.next)) throw new Error('恢复日志不合法')
    const values = journal.phase === 'committed' ? journal.next : journal.previous
    for (const key of [PLATFORM_KEY, DATA_KEY]) {
      if (values[key] !== null && typeof values[key] !== 'string') throw new Error('恢复值不合法')
    }
    for (const key of [PLATFORM_KEY, DATA_KEY]) {
      const value = values[key]
      value === null ? kv.removeItem(key) : kv.setItem(key, value as string)
    }
    kv.removeItem(JOURNAL_KEY)
    return journal.phase === 'committed' ? '已恢复上次完成的整包导入。' : '上次导入中断，已恢复到导入前。'
  } catch (error) { return `导入恢复失败，请勿继续训练：${error instanceof Error ? error.message : String(error)}` }
}
export function loadPlatform(kv: Kv, now: number): { state: FusionState; blocked: boolean; warning: string | null } {
  try {
    const raw = kv.getItem(PLATFORM_KEY)
    if (raw) return { state: validatePlatform(JSON.parse(raw)), blocked: false, warning: null }
    const initial = defaultFusion(now)
    // Read existing legacy keys without modifying them. Files in another browser/origin require explicit JSON import.
    const points = kv.getItem('ms346_points_v1')
    if (points) {
      const get = (key: string, fallback: unknown) => { const value = kv.getItem(key); return value ? JSON.parse(value) : fallback }
      initial.general = normalizeGeneral({ ...emptyGeneral(), points: JSON.parse(points), logs: get('ms346_logs_v1', []), logsArchive: get('ms346_logs_archive_v1', []),
        subjects: get('ms346_subjects_v1', emptyGeneral().subjects), settings: get('ms346_settings_v1', {}),
        subjectColors: get('ms346_subject_colors_v1', {}), confusionSets: get('ms346_confusion_sets_v1', []), dailyQueueCache: get('ms346_management_day_cache_v1', null) })
    }
    return { state: initial, blocked: false, warning: points ? '已读取本浏览器中的旧记忆引擎记录，原存储未修改。旧管理学条目保留查询。' : null }
  } catch (error) { return { state: defaultFusion(now), blocked: true, warning: `本地全科记录无法读取，已保护原内容。${error instanceof Error ? error.message : ''}` } }
}

import type { CoachPersisted } from '../coach/types'
import { defaultSettings } from '../state/defaults'

const obj = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const num = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const member = (v: unknown, values: string[]) => typeof v === 'string' && values.includes(v)
const hints = ['none', 'heading', 'keyword', 'full_answer']
const draft = (v: unknown) => obj(v) && typeof v.text === 'string' && num(v.createdAt)

/** Validate UI-consumed fields at the fusion boundary; keep the original import/learning engines intact. */
export function validateMrcFields(p: CoachPersisted, previous?: CoachPersisted) {
  if (!obj(p) || !['attempts', 'notes', 'bookmarks', 'recallQueue', 'customKeywords', 'migrationReview'].every(k => Array.isArray(p[k])) || !['settings', 'library', 'relationOverrides', 'keywordOverrides'].every(k => obj(p[k]))) throw new Error('管理学记录结构不完整。')
  if (p.notes.some(n => !obj(n) || typeof n.itemId !== 'string' || typeof n.text !== 'string' || !num(n.updatedAt)) || !strings(p.bookmarks) || !strings(p.recallQueue) || p.customKeywords.some(k => !obj(k) || typeof k.itemId !== 'string' || typeof k.text !== 'string') || p.migrationReview.some(r => !obj(r) || ['itemId', 'attemptId', 'contentVersion', 'note'].some(k => typeof r[k] !== 'string'))) throw new Error('管理学笔记、书签或待查记录不合法。')
  const statuses = ['candidate', 'confirmed', 'confirmed-by-source', 'rejected']
  if ([...Object.values(p.relationOverrides), ...Object.values(p.keywordOverrides)].some(s => !member(s, statuses))) throw new Error('管理学关联审核状态不合法。')
  const lib = p.library as unknown as Record<string, unknown>
  if (!member(lib.source, ['A', 'B', 'all']) || !member(lib.mode, ['all', 'skeleton', 'short', 'no-expansion']) || ['chapterId', 'itemId', 'query', 'pageAnchor'].some(k => typeof lib[k] !== 'string')) throw new Error('管理学资料库状态不合法。')
  const defaults = defaultSettings()
  const settings = { ...defaults, ...p.settings, gaps: { ...defaults.gaps, ...p.settings.gaps }, day: { ...defaults.day, ...p.settings.day } }
  if (Object.values(settings.gaps).some(v => !num(v, Number.MIN_VALUE)) || Object.entries(settings.day).some(([k, v]) => typeof defaults.day[k as keyof typeof defaults.day] === 'boolean' ? typeof v !== 'boolean' : !num(v)) || !member(settings.theme, ['light', 'dark']) || typeof settings.showTimer !== 'boolean') throw new Error('管理学复测或每日设置不合法。')
  for (const a of p.attempts === previous?.attempts ? [] : p.attempts) {
    if (!obj(a) || typeof a.id !== 'string' || typeof a.itemId !== 'string' || !num(a.startedAt) || !num(a.finishedAt) || !num(a.durationSeconds) || !num(a.selfConfidence, 1) || a.selfConfidence > 5 || !Number.isInteger(a.selfConfidence) || (a.dueAt !== undefined && !num(a.dueAt)) || !member(a.highestHintUsed, hints) || !member(a.evidenceState, ['independent', 'minor_omission', 'cue_dependent', 'relearned']) || !Array.isArray(a.hintSequence)) throw new Error('管理学训练记录不合法。')
    if (![a.checkedPointIds, a.missingPointIds, a.termErrors, a.redlineErrors].every(strings) || a.hintSequence.some(h => !member(h, hints)) || typeof a.sportsExampleMissing !== 'boolean' || !member(a.reviewKind, ['initial', 'delay']) || (a.userNote !== undefined && typeof a.userNote !== 'string') || (a.restatementText !== undefined && typeof a.restatementText !== 'string') || (a.postRevealNoHintPassed !== undefined && typeof a.postRevealNoHintPassed !== 'boolean') || (a.preRevealDraft !== undefined && !draft(a.preRevealDraft))) throw new Error('管理学训练证据字段不合法。')
  }
  const r = p.recall
  if (r && (!obj(r) || !member(r.phase, ['draft', 'b_skeleton', 'headings', 'keywords', 'compare', 'restate', 'done']) || typeof r.itemId !== 'string' || !num(r.startedAt) || ['draft', 'restatement', 'termErrorDraft', 'userNote'].some(k => typeof r[k] !== 'string') || !Array.isArray(r.hintSequence) || (r.frozenDraft !== null && !draft(r.frozenDraft)))) throw new Error('管理学草稿结构不合法。')
  if (r && (!member(r.highestHintUsed, hints) || !strings(r.checkedPointIds) || !strings(r.redlineErrorIds) || r.hintSequence.some(h => !member(h, hints)) || typeof r.keywordSkipped !== 'boolean' || (r.postRevealNoHintPassed !== undefined && typeof r.postRevealNoHintPassed !== 'boolean') || (r.selfConfidence !== undefined && (!num(r.selfConfidence, 1) || r.selfConfidence > 5 || !Number.isInteger(r.selfConfidence))) || (r.phase === 'done' && (!r.result || !p.attempts.some(a => a.id === r.result!.id && a.itemId === r.itemId && JSON.stringify(a) === JSON.stringify(r.result)))))) throw new Error('管理学草稿证据不合法。')
  const e = p.exam
  if (e && (!obj(e) || !strings(e.itemIds) || !num(e.startedAt) || !num(e.index) || !obj(e.answers) || (e.limitSeconds !== null && !num(e.limitSeconds, 1)))) throw new Error('闭卷考试结构不合法。')
  if (e && (typeof e.title !== 'string' || !Number.isInteger(e.index) || e.index > Math.max(0, e.itemIds.length - 1) || (e.questionStartedAt !== undefined && !num(e.questionStartedAt)) || Object.values(e.answers).some(a => !obj(a) || typeof a.text !== 'string' || typeof a.revealed !== 'boolean' || (a.durationSeconds !== undefined && !num(a.durationSeconds))))) throw new Error('闭卷考试答案不合法。')
}

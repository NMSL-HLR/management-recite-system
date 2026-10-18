import { describe, expect, it } from 'vitest'
import { content } from '../src/content'
import { defaultPersisted } from '../src/state/defaults'
import { createPoint, DAY } from '../src/general/scheduler'
import { reviewGeneral } from '../src/general/data'
import { beginPractice, beginTask, decide, defaultFusion, finishTask, libraryCandidates, lockChapters, preparePractice, remaining, rollDay, selectSubjects, spent } from '../src/fusion/planner'
import { validatePlatform, makeEnvelope, inspectFusionImport } from '../src/fusion/transfer'
import { isPromptOnlyConfirmedBItem } from '../src/engine/priority'
import type { FusionState, PracticeScope } from '../src/fusion/types'

const now = new Date(2026, 9, 18, 10).getTime(), mrc = defaultPersisted()
function fixture() {
  const s = defaultFusion(now)
  s.general.points = ['one', 'two', 'later', 'reference'].map(id => ({ ...createPoint({ subject: '运动生理学', title: id, content: '原教材内容', tags: [], checklist: ['概念'] }, now), id, quotaChapterOverride: '第一章', ...(id === 'later' ? { totalReviews: 2, dueDate: now + DAY } : {}), ...(id === 'reference' ? { trainingBlocked: true } : {}) }))
  s.general.points.push({ ...createPoint({ subject: '体育概论', title: 'other', content: '原文', tags: [], checklist: [] }, now), id: 'other' })
  return lockChapters(s, mrc, now)
}
const chapter: PracticeScope = { module: 'general', kind: 'chapter', title: '第一章', itemIds: ['one', 'two', 'later', 'reference'] }
function complete(s: FusionState, t = now + 100) {
  const id = `r-${s.active!.id}`
  const general = reviewGeneral(s.general, s.active!.itemId, 3, ['概念'], id, t)
  return finishTask({ ...s, general, session: { ...s.session!, phase: 'done', frozenDraft: '概念', checked: ['概念'], rating: 3, resultId: id } }, id, t)
}
describe('daily subject choice', () => {
  it('filters both new tasks and future waits, retaining other subjects without changing due dates', () => {
    let s = selectSubjects(fixture(), ['体育概论'])
    const before = structuredClone(s.general)
    let d = decide(s, mrc, now)
    expect(d.kind).toBe('next'); if (d.kind === 'next') expect(d.candidate.subject).toBe('体育概论')
    s.general.points.find(p => p.id === 'other')!.dueDate = now + DAY * 2
    s.general.points.find(p => p.id === 'other')!.totalReviews = 1
    d = decide(s, mrc, now)
    expect(d).toEqual({ kind: 'wait', dueAt: now + DAY * 2, pending: 0 })
    expect(s.general.points.filter(p => p.subject === '运动生理学')).toEqual(before.points.filter(p => p.subject === '运动生理学'))
  })
  it('does not fall back to another subject when selected subject is empty', () => {
    const s = selectSubjects(fixture(), ['体育概论']); s.general.points = s.general.points.filter(p => p.subject !== '体育概论')
    expect(decide(s, mrc, now)).toEqual({ kind: 'done', reason: 'empty', pending: 0 })
  })
  it('retains unfinished draft and budget across selection changes and next day', () => {
    let s = beginPractice(fixture(), mrc, chapter, now)
    s.session!.draft = '未完成原稿'
    const task = s.active, session = s.session, minutes = spent(s.day)
    s = selectSubjects(s, ['体育概论'])
    expect(s.day.practice).toBeUndefined(); expect(s.active).toBe(task); expect(s.session).toBe(session)
    expect(decide(s, mrc, now)).toEqual({ kind: 'resume', task })
    expect(spent(s.day)).toBe(minutes)
    const tomorrow = rollDay(s, now + DAY)
    expect(tomorrow.day.subjects).toBeUndefined(); expect(tomorrow.active).toBe(task); expect(tomorrow.session!.draft).toBe('未完成原稿')
  })
  it('rejects an empty selection, deduplicates choices and can restore automatic mode', () => {
    const s = fixture()
    expect(selectSubjects(s, [])).toBe(s)
    expect(selectSubjects(s, ['missing'])).toBe(s)
    expect(selectSubjects(s, ['体育概论', '体育概论']).day.subjects).toEqual(['体育概论'])
    expect(selectSubjects(selectSubjects(s, ['体育概论']), null).day.subjects).toBeUndefined()
  })
})
describe('finite library practice using original records', () => {
  it('prioritizes due reviews, excludes references and future reviews from chapter selection', () => {
    const s = fixture(); s.general.points[1].totalReviews = 1; s.general.points[1].dueDate = now - DAY
    const p = preparePractice(s, mrc, chapter, now)
    expect(p.scope.itemIds).toEqual(['two', 'one']); expect(p.candidate!.itemId).toBe('two')
  })
  it('keeps automatic new quotas intact while permitting explicit chapter choice', () => {
    const s = fixture(); s.settings.subjects['运动生理学'].newCap = 0; s.day.selectedChapters['运动生理学'] = []
    const candidate = libraryCandidates(s, mrc, now).find(c => c.itemId === 'one')!
    expect(beginTask(s, candidate, now)).toBe(s)
    const next = beginPractice(s, mrc, chapter, now)
    expect(next.active!.itemId).toBe('one'); expect(next.settings).toEqual(s.settings)
    expect(next.general).toBe(s.general); expect(spent(next.day)).toBe(10)
  })
  it('finishes a bounded chapter once and never spills into other subjects or repeats it', () => {
    let s = beginPractice(fixture(), mrc, chapter, now)
    s = complete(s)
    expect(s.day.practice!.itemIds).toEqual(['two'])
    const d = decide(s, mrc, now + 200)
    expect(d.kind).toBe('next'); if (d.kind !== 'next') throw Error('expected next')
    expect(d.candidate.itemId).toBe('two')
    s = complete(beginTask(s, d.candidate, now + 200), now + 300)
    expect(decide(s, mrc, now + 400)).toEqual({ kind: 'done', reason: 'practice', pending: 0 })
    expect(s.general.logs).toHaveLength(2); expect(spent(s.day)).toBe(20)
    expect(validatePlatform(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
  it('permits an explicitly requested early review without changing its due date at start', () => {
    const s = fixture(), scope: PracticeScope = { ...chapter, kind: 'item', itemIds: ['later'] }
    const p = preparePractice(s, mrc, scope, now)
    expect(p.candidate!.reason).toContain('提前练习')
    const next = beginPractice(s, mrc, scope, now)
    expect(next.active!.itemId).toBe('later'); expect(next.general).toEqual(s.general)
    expect(complete(next).general.logs).toHaveLength(1)
  })
  it('requires explicit budget extension after the first task and keeps tomorrow unchanged', () => {
    const original = fixture(); original.day.budgetMinutes = 15
    const s = complete(beginPractice(original, mrc, chapter, now))
    const d = decide(s, mrc, now + 200)
    expect(d.kind).toBe('done'); if (d.kind === 'done') expect(d.reason).toBe('budget')
    const preview = preparePractice(s, mrc, s.day.practice!, now + 200)
    expect(preview.extraMinutes).toBe(5); expect(preview.budgetMinutes).toBe(20)
    expect(s.day.budgetMinutes).toBe(15)
    const extended = beginPractice(s, mrc, s.day.practice!, now + 200)
    expect(extended.day.budgetMinutes).toBe(20); expect(extended.settings.minutes).toBe(60)
    expect(remaining(extended)).toBe(0); expect(extended.day.tasks).toHaveLength(2)
  })
  it('covers previously overspent budgets and respects the 600-minute maximum', () => {
    let s = complete(beginPractice(fixture(), mrc, chapter, now))
    s.day.tasks[0].estimatedMinutes = 30; s.day.budgetMinutes = 15; s.day.closed = true
    const p = preparePractice(s, mrc, s.day.practice!, now + 200)
    expect(p.extraMinutes).toBe(25); expect(p.budgetMinutes).toBe(40)
    expect(beginPractice(s, mrc, s.day.practice!, now + 200).day.closed).toBe(false)
    s.day.tasks = Array.from({ length: 6 }, (_, i) => ({ ...s.day.tasks[0], id: `spent-${i}`, estimatedMinutes: 100 }))
    s.day.budgetMinutes = 600
    expect(beginPractice(s, mrc, chapter, now + 200)).toBe(s)
  })
  it('cannot overwrite active work or start prompt-only B and reference material', () => {
    const s = beginPractice(fixture(), mrc, chapter, now)
    expect(beginPractice(s, mrc, { ...chapter, itemIds: ['two'] }, now + 100)).toBe(s)
    const ids = libraryCandidates(s, mrc, now).filter(c => c.module === 'mrc').map(c => c.itemId)
    for (const item of content.items.filter(i => i.kind === 'reference' || isPromptOnlyConfirmedBItem(i, content.relations, mrc.relationOverrides))) expect(ids).not.toContain(item.id)
  })
  it('uses the same envelope for old data, scope, active draft and completed state', () => {
    const old = fixture(); expect(validatePlatform(JSON.parse(JSON.stringify(old)))).toEqual(old)
    let s = selectSubjects(old, ['体育概论'])
    s = beginPractice(s, mrc, chapter, now); s.session!.draft = '导出原稿'
    const restored = inspectFusionImport(JSON.stringify(makeEnvelope(s, mrc)), defaultFusion(now), mrc).platform
    expect(restored.day.subjects).toEqual(['体育概论']); expect(restored.day.practice).toEqual(s.day.practice)
    expect(restored.session!.draft).toBe('导出原稿'); expect(restored.day.tasks).toHaveLength(1)
    expect(rollDay(complete(s), now + DAY).day.practice).toBeUndefined()
  })
  it('rejects malformed scope/selection fields before import', () => {
    for (const subjects of [[], ['体育概论', '体育概论'], [12], '体育概论']) expect(() => validatePlatform({ ...fixture(), day: { ...fixture().day, subjects } })).toThrow()
    for (const practice of [{ ...chapter, module: ['general'] }, { ...chapter, kind: ['chapter'] }, { ...chapter, kind: 'random' }, { ...chapter, itemIds: [1] }, { ...chapter, kind: 'item', itemIds: ['one', 'two'] }]) expect(() => validatePlatform({ ...fixture(), day: { ...fixture().day, practice } })).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { content } from '../src/content'
import { defaultPersisted } from '../src/state/defaults'
import { reconcileContent, inspectPreservingImport, type RecoveryEntry } from '../src/state/contentRecovery'
import { startRecall, commitAttempt } from '../src/engine/recall'
import { validateMrcFields } from '../src/fusion/validateMrc'
import { inspectFusionImport, makeEnvelope, validatePlatform } from '../src/fusion/transfer'
import { defaultFusion, reconcileMrc, allCandidates, beginTask, decide, generalReadyAt, RELEARNING_PAUSE_MS } from '../src/fusion/planner'
import { ensurePlan } from '../src/coach/planner'
import { prepareCoachState } from '../src/coach/recallAdapter'
import type { CoachPersisted } from '../src/coach/types'
import { createPoint } from '../src/general/scheduler'
import { reviewGeneral } from '../src/general/data'

const now = Date.now(), item = content.items.find(i => i.coreA)!
function history() {
  const state = defaultPersisted()
  const attempt = commitAttempt({ ...startRecall(item.id, now), phase: 'restate', postRevealNoHintPassed: true }, item, now + 100, state.settings.gaps, [])
  return { ...attempt, itemId: 'removed-item', preRevealDraft: { text: '完整历史草稿', createdAt: now }, restatementText: '历史复述', userNote: '历史批注' }
}

describe('lossless content reconciliation', () => {
  it('retains the complete unmatched attempt; only adds a review index and is idempotent', () => {
    const old = { ...defaultPersisted(), attempts: [history()], sourceHashes: { A: 'old', B: 'old' } }
    const fixed = reconcileContent(old)
    expect(fixed.attempts).toBe(old.attempts)
    expect(fixed.attempts[0]).toEqual(history())
    expect(fixed.migrationReview).toHaveLength(1)
    expect(reconcileContent(fixed)).toBe(fixed)
    expect(old.sourceHashes.A).toBe('old')
  })
  it('archives the entire invalid recall and exam before clearing their active slots', () => {
    const recall = { ...startRecall('missing', now), draft: '不可丢的草稿', restatement: '复述', userNote: '私有注记' }
    const exam = { id: 'old-exam', title: '旧考试', itemIds: [item.id, 'missing'], index: 0, startedAt: now, limitSeconds: null, answers: { missing: { text: '完整考试答案', revealed: false } } }
    const fixed = reconcileContent({ ...defaultPersisted(), recall, recallQueue: ['missing'], exam })
    expect(fixed.recall).toBeNull(); expect(fixed.exam).toBeNull()
    const rows = fixed.migrationReview as RecoveryEntry[]
    expect(rows.find(r => r.recovery?.recall)?.recovery?.recall).toBe(recall)
    expect(rows.find(r => r.recovery?.exam)?.recovery?.exam).toBe(exam)
    expect(fixed.recallQueue).toEqual([])
  })
  it('keeps unmatched incoming attempts and archived payloads through both import formats', () => {
    const current = defaultPersisted(), old = { ...current, attempts: [history()], recall: { ...startRecall('missing', now), draft: '导入草稿' } }
    const plan = inspectPreservingImport(JSON.stringify(old), current)
    expect(plan.ok).toBe(true); if (!plan.ok) throw Error(plan.error)
    expect(plan.next.attempts).toEqual(old.attempts)
    expect(JSON.stringify(plan.next.migrationReview)).toContain('导入草稿')
    const roundtrip = inspectFusionImport(JSON.stringify(makeEnvelope(defaultFusion(now), plan.next)), defaultFusion(now), current)
    expect(roundtrip.mrc.attempts).toEqual(old.attempts)
    expect(roundtrip.mrc.migrationReview).toEqual(plan.next.migrationReview)
    const twice = inspectPreservingImport(JSON.stringify(plan.next), plan.next)
    expect(twice.ok && twice.next.migrationReview).toEqual(plan.next.migrationReview)
  })
  it('rejects a conflicting attempt ID instead of overwriting another question', () => {
    const a = history(), current = { ...defaultPersisted(), attempts: [{ ...a, itemId: item.id }] }
    expect(inspectPreservingImport(JSON.stringify({ ...defaultPersisted(), attempts: [a] }), current).ok).toBe(false)
    expect(inspectPreservingImport(JSON.stringify(current), { ...defaultPersisted(), attempts: [a] }).ok).toBe(false)
  })
  it('preserves the local exam while archiving an incoming exam during a module merge', () => {
    const current = { ...defaultPersisted(), exam: { id: 'local-exam', title: '本地闭卷', itemIds: [item.id], index: 0, startedAt: now, limitSeconds: null, answers: { [item.id]: { text: '未交卷作答', revealed: false } } } }
    const incoming = { ...defaultPersisted(), exam: { ...current.exam, id: 'incoming-exam' } }
    const plan = inspectFusionImport(JSON.stringify(incoming), defaultFusion(now), current)
    expect(plan.mrc.exam).toEqual(current.exam)
    expect((plan.mrc.migrationReview as RecoveryEntry[]).find(r => r.recovery?.exam)?.recovery?.exam).toEqual(incoming.exam)
  })
  it('retains stale coach task details and releases its reservation once', () => {
    const task = { id: 'old-task', itemId: 'missing', kind: 'initial_recall' as const, status: 'in_progress' as const, reason: '旧题', estimatedMinutes: 15, createdAt: now, completedAt: null }
    const state: CoachPersisted = { ...defaultPersisted(), coachState: { ...ensurePlan(undefined, now), tasks: [task], reservedMinutes: 15 } }
    const fixed = reconcileContent(state)
    expect(fixed.coachState?.reservedMinutes).toBe(0)
    expect((fixed.migrationReview[0] as RecoveryEntry).recovery?.task).toEqual(task)
    expect(reconcileContent(fixed)).toBe(fixed)
  })
})

describe('training recovery boundaries', () => {
  it('settles an already-saved attempt before retiring its missing question, including full restore', () => {
    const mrc = { ...defaultPersisted(), attempts: [history()] }
    const p = defaultFusion(now), c = allCandidates(p, mrc, now)[0]
    const started = beginTask({ ...p, day: { ...p.day, selectedChapters: { [c.subject]: [c.chapterKey] } } }, c, now)
    const task = { ...started.active!, itemId: 'removed-item' }
    const pending = { ...started, active: task, day: { ...started.day, tasks: [task] } }
    for (const fixed of [reconcileMrc(pending, mrc, now + 200), inspectFusionImport(JSON.stringify(makeEnvelope(pending, mrc)), p, defaultPersisted()).platform]) {
      expect(fixed.active?.status).toBe('completed')
      expect(fixed.active?.resultId).toBe(mrc.attempts[0].id)
      expect(fixed.day.tasks).toHaveLength(1)
      expect(fixed.unavailableTasks).toBeUndefined()
      expect(validatePlatform(fixed)).toEqual(fixed)
    }
  })
  it('retires unavailable active MRC tasks and resumes normal selection', () => {
    const mrc = defaultPersisted(), p = defaultFusion(now), c = allCandidates(p, mrc, now)[0]
    const started = beginTask({ ...p, day: { ...p.day, selectedChapters: { [c.subject]: [c.chapterKey] } } }, c, now)
    const task = { ...started.active!, itemId: 'removed' }
    const fixed = reconcileMrc({ ...started, active: task, day: { ...started.day, tasks: [task] } }, mrc, now)
    expect(fixed.active).toBeNull(); expect(fixed.day.tasks).toEqual([])
    expect(fixed.unavailableTasks).toEqual([task]); expect(validatePlatform(fixed)).toEqual(fixed)
    expect(decide(fixed, mrc, now).kind).not.toBe('resume')
  })
  it('replaces a stale MRC task with the real recall without creating two active tasks', () => {
    const mrc = { ...defaultPersisted(), recall: startRecall(item.id, now) }
    const started = reconcileMrc(defaultFusion(now), mrc, now)
    const other = content.items.find(i => i.coreA && i.id !== item.id)!
    const fixed = reconcileMrc(started, { ...mrc, recall: startRecall(other.id, now + 1) }, now + 1)
    expect(fixed.day.tasks.filter(t => t.status === 'in_progress')).toHaveLength(1)
    expect(fixed.unavailableTasks).toEqual([started.active]); expect(validatePlatform(fixed)).toEqual(fixed)
  })
  it('deducts a stale legacy coach reservation without changing completed work', () => {
    const task = { id: 'stale', itemId: item.id, kind: 'initial_recall' as const, status: 'in_progress' as const, reason: '', estimatedMinutes: 15, createdAt: now, completedAt: null }
    const state = { ...defaultPersisted(), coachState: { ...ensurePlan(undefined, now), tasks: [task], reservedMinutes: 30 } }
    expect(prepareCoachState(state, now).coachState?.reservedMinutes).toBe(15)
  })
  it.each([9, 0, 1.5])('rejects invalid recall confidence %s before import or writing', value => {
    const m = { ...defaultPersisted(), recall: startRecall(item.id, now) }; Object.assign(m.recall, { selfConfidence: value })
    expect(() => validateMrcFields(m)).toThrow()
    expect(() => inspectFusionImport(JSON.stringify(makeEnvelope(defaultFusion(now), m)), defaultFusion(now), defaultPersisted())).toThrow()
  })
  it('rejects an unknown hint level at the local write boundary', () => {
    const m = { ...defaultPersisted(), recall: startRecall(item.id, now) }
    Object.assign(m.recall, { highestHintUsed: 'invalid' })
    expect(() => validateMrcFields(m)).toThrow()
  })
  it('defers only the forgotten question, preserving the exact original FSRS dueDate', () => {
    const p = defaultFusion(now), raw = createPoint({ subject: '运动生理学', title: '概念', content: '原文', tags: [], checklist: [] }, now)
    p.general.points = [{ ...raw }]
    const result = reviewGeneral(p.general, raw.id, 1, [], 'log', now)
    const point = result.points[0]
    expect(point.dueDate).toBeLessThanOrEqual(now)
    expect(generalReadyAt(point)).toBe(now + RELEARNING_PAUSE_MS)
    const state = { ...p, general: result }
    expect(allCandidates(state, defaultPersisted(), now).some(c => c.itemId === point.id)).toBe(false)
    expect(allCandidates(state, defaultPersisted(), now + RELEARNING_PAUSE_MS).some(c => c.itemId === point.id)).toBe(true)
  })
})

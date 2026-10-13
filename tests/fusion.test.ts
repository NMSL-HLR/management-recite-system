import { describe, expect, it } from 'vitest'
import { content } from '../src/content'
import { defaultPersisted } from '../src/state/defaults'
import { createPoint, schedule, DAY } from '../src/general/scheduler'
import { normalizeGeneral, reviewGeneral, scheduleGeneral } from '../src/general/data'
import { adoptAlphaDay, allCandidates, beginTask, decide, defaultFusion, finishTask, lockChapters, reconcileMrc, remaining, rollDay, spent } from '../src/fusion/planner'
import { inspectFusionImport, loadPlatform, makeEnvelope, recoverImport, validatePlatform, writeBundle } from '../src/fusion/transfer'
import { DATA_KEY, memoryKv, type Kv } from '../src/engine/storage'
import { JOURNAL_KEY, PLATFORM_KEY, type FusionState, type GeneralPoint, type Candidate } from '../src/fusion/types'
import { commitAttempt, startRecall } from '../src/engine/recall'
import type { Rating } from '../src/general/types'
const now = new Date(2026, 9, 13, 10).getTime()
const mrc = () => defaultPersisted()
function point(id: string, subject = '运动生理学', title = '第一章 生理学'): GeneralPoint {
  return { ...createPoint({ subject, title, content: '教材原文：概念、机制与应用。', tags: [], checklist: ['概念', '机制'] }, now), id }
}
function platform(points: GeneralPoint[] = []) {
  const s = defaultFusion(now); s.general.points = points; return lockChapters(s, mrc(), now)
}
function generalCandidate(s: FusionState, id: string): Candidate {
  return allCandidates(s, mrc(), now).find(c => c.module === 'general' && c.itemId === id)!
}

describe('fusion coach boundaries', () => {
  it('preserves Alpha Lite daily budget and completed work on first upgrade', () => {
    const a = mrc(); const item = content.items.find(i => i.coreA)!
    const result = commitAttempt({ ...startRecall(item.id, now), phase: 'restate' }, item, now + 100, a.settings.gaps, [])
    a.attempts = [result]
    const coach = { ...a, coachState: { date: defaultFusion(now).day.date, budgetMinutes: 15, reservedMinutes: 15, closed: true,
      tasks: [{ id: 'old-task', itemId: item.id, kind: 'initial_recall' as const, status: 'completed' as const, reason: '原任务', estimatedMinutes: 15, createdAt: now, completedAt: result.finishedAt }] } }
    const s = adoptAlphaDay(defaultFusion(now), coach, now + 100)
    expect(s.day.closed).toBe(true); expect(remaining(s)).toBe(0); expect(s.day.tasks[0].resultId).toBe(result.id)
    expect(a.attempts[0]).toBe(result)
  })
  it('recommends the first A core item for a new user', () => {
    const d = decide(platform(), mrc(), now)
    expect(d.kind).toBe('next'); if (d.kind === 'next') expect(d.candidate.itemId).toBe(content.items.find(i => i.coreA)!.id)
  })
  it('keeps reference/legacy management out of the automatic pool', () => {
    const s = platform([point('legacy', '体育管理学'), point('phys')])
    expect(allCandidates(s, mrc(), now).some(c => c.itemId === 'legacy')).toBe(false)
    expect(allCandidates(s, mrc(), now).some(c => c.itemId === 'phys')).toBe(true)
    expect(allCandidates(s, mrc(), now).some(c => content.items.find(i => i.id === c.itemId)?.kind === 'reference')).toBe(false)
  })
  it('does not automatically repeat a future general or MRC item', () => {
    const p = { ...point('p'), dueDate: now + DAY, totalReviews: 1 }
    const s = platform([p]); const a = mrc(); const item = content.items.find(i => i.coreA)!
    a.attempts = [commitAttempt({ ...startRecall(item.id, now - 1000), phase: 'restate', postRevealNoHintPassed: true }, item, now, a.settings.gaps, [])]
    expect(allCandidates(s, a, now).some(c => c.itemId === p.id || c.itemId === item.id)).toBe(false)
  })
  it('prefers due reviews to new tasks and then balances subjects', () => {
    const p = { ...point('p'), totalReviews: 2, state: 'review' as const, dueDate: now - DAY }
    const d = decide(platform([p]), mrc(), now)
    expect(d.kind).toBe('next'); if (d.kind === 'next') expect(d.candidate.itemId).toBe('p')
    let s = platform([point('p')]); const c = allCandidates(s, mrc(), now).find(c => c.module === 'mrc')!
    s = finishTask(beginTask(s, c, now), 'a', now + 10)
    const next = decide(s, mrc(), now + 10)
    expect(next.kind).toBe('next'); if (next.kind === 'next') expect(next.candidate.subject).toBe('运动生理学')
  })
  it('locks daily new chapter scope without refilling after completion', () => {
    let s = platform([point('one', '运动生理学', '第一章 A'), point('two', '运动生理学', '第二章 B')])
    s.settings.subjects['运动生理学'].chapterCap = 1; s.day.selectedChapters = {}; s = lockChapters(s, mrc(), now)
    const selected = structuredClone(s.day.selectedChapters)
    s = finishTask(beginTask(s, generalCandidate(s, 'one'), now), 'log', now + 10)
    s.general.points = s.general.points.filter(p => p.id !== 'one')
    expect(lockChapters(s, mrc(), now + 10).day.selectedChapters).toEqual(selected)
    expect(beginTask(s, generalCandidate(s, 'two'), now + 20)).toBe(s)
  })
  it('counts started new tasks cumulatively, not just current queue length', () => {
    let s = platform([point('one'), point('two')]); s.settings.subjects['运动生理学'].newCap = 1
    s = finishTask(beginTask(s, generalCandidate(s, 'one'), now), 'log', now + 10)
    expect(beginTask(s, generalCandidate(s, 'two'), now + 20)).toBe(s)
    expect(s.day.tasks).toHaveLength(1)
  })
  it('overdue tasks cannot exceed the hard budget or closed day', () => {
    let s = platform([point('p')]); s.day.budgetMinutes = 15
    const c = generalCandidate(s, 'p'); s = finishTask(beginTask(s, c, now), 'log', now + 10)
    expect(remaining(s)).toBe(5)
    const overdue = { ...c, isNew: false, dueAt: now - 100 * DAY }
    expect(beginTask(s, overdue, now + 20)).toBe(s)
    s.day.closed = true; s.day.budgetMinutes = 60
    expect(beginTask(s, overdue, now + 20)).toBe(s)
    expect(decide(s, mrc(), now).kind).toBe('done')
  })
  it('charges once for resume and carries unfinished work to a new day', () => {
    let s = platform([point('p')]); s = beginTask(s, generalCandidate(s, 'p'), now)
    const id = s.active!.id; expect(beginTask(s, generalCandidate(s, 'p'), now + 100)).toBe(s)
    s = rollDay(s, now + DAY)
    expect(s.active!.id).toBe(id); expect(spent(s.day)).toBe(10); expect(s.session!.phase).toBe('draft')
    expect(rollDay(s, now + DAY)).toBe(s)
  })
  it('resumes original unfinished Recall even with exhausted/closed budget', () => {
    const a = mrc(); const item = content.items.find(i => i.coreA)!
    a.recall = { ...startRecall(item.id, now - 100), draft: '旧稿' }
    let s = platform(); s.day.closed = true
    s = reconcileMrc(s, a, now)
    expect(decide(s, a, now).kind).toBe('resume'); expect(s.active!.itemId).toBe(item.id)
    expect(reconcileMrc(s, a, now)).toBe(s); expect(a.recall.draft).toBe('旧稿')
  })
  it('reconciles original Attempt without changing evidence or dueAt', () => {
    const a = mrc(); const item = content.items.find(i => i.coreA)!
    a.recall = startRecall(item.id, now)
    const s = reconcileMrc(platform(), a, now)
    const result = commitAttempt({ ...a.recall, phase: 'restate', highestHintUsed: 'heading', postRevealNoHintPassed: true }, item, now + 500, a.settings.gaps, [])
    a.attempts = [result]; a.recall = { ...a.recall, phase: 'done', result }
    const saved = structuredClone(result); const next = reconcileMrc(s, a, now + 500)
    expect(next.active!.status).toBe('completed'); expect(result).toEqual(saved)
    expect(result.evidenceState).toBe('cue_dependent'); expect(result.dueAt! - result.finishedAt).toBe(45 * 60000)
    const reopenedTomorrow = reconcileMrc(s, a, now + DAY)
    expect(reopenedTomorrow.active).toBeNull(); expect(spent(reopenedTomorrow.day)).toBe(0)
  })
  it('completed active/session clear on next day and remain valid', () => {
    let s = platform([point('p')]); s = beginTask(s, generalCandidate(s, 'p'), now)
    const id = `review-${s.active!.id}`
    s.general = reviewGeneral(s.general, 'p', 3, ['概念', '机制'], id, now + 100)
    s.session = { ...s.session!, phase: 'done', frozenDraft: '稿', rating: 3, resultId: id }
    s = finishTask(s, id, now + 100)
    expect(validatePlatform(s)).toEqual(s)
    const next = rollDay(s, now + DAY)
    expect(next.active).toBeNull(); expect(next.session).toBeNull(); expect(validatePlatform(next)).toEqual(next)
  })
  it('waits for future reviews and keeps an explicit day close across time changes', () => {
    const a = mrc(); const item = content.items.find(i => i.coreA)!
    const template = commitAttempt({ ...startRecall(item.id, now), phase: 'restate' }, item, now, a.settings.gaps, [])
    a.attempts = content.items.filter(i => i.kind !== 'reference').map((i, n) => ({ ...template, id: `history-${n}`, itemId: i.id, dueAt: now + 45 * 60000 }))
    const s = platform([{ ...point('p'), totalReviews: 1, dueDate: now + DAY }])
    expect(decide(s, a, now)).toEqual({ kind: 'wait', dueAt: now + 45 * 60000, pending: 0 })
    s.day.closed = true
    expect(decide(s, a, now + 60 * 60000).kind).toBe('done')
  })
  it('bounds same-day FSRS relearning even when the original scheduler says due immediately', () => {
    const a = mrc(); const item = content.items.find(i => i.coreA)!
    const template = commitAttempt({ ...startRecall(item.id, now), phase: 'restate' }, item, now, a.settings.gaps, [])
    a.attempts = content.items.filter(i => i.kind !== 'reference').map((i, n) => ({ ...template, id: `history-${n}`, itemId: i.id, dueAt: now + DAY }))
    let s = platform([point('p')]); let runs = 0
    for (let n = 0; n < 100; n++) {
      const d = decide(s, a, now + n * 1000)
      if (d.kind !== 'next') break
      s = beginTask(s, d.candidate, now + n * 1000)
      const resultId = `r-${n}`
      s.general = reviewGeneral(s.general, 'p', 1, [], resultId, now + n * 1000)
      s.session = { ...s.session!, phase: 'done', frozenDraft: '', rating: 1, resultId }
      s = finishTask(s, resultId, now + n * 1000); runs++
    }
    expect(runs).toBe(6); expect(remaining(s)).toBe(0); expect(decide(s, a, now + 100000).kind).toBe('done')
    expect(validatePlatform(s)).toEqual(s)
  })
})

describe('legacy FSRS/data compatibility', () => {
  it('keeps v13 extension fields and migrates old tags/EF without changing id', () => {
    const p = { ...point('old'), tags: ['重点'], difficulty: undefined, ef: 1.8, managementChapters: { maGongcheng: ['第一章'] } }
    const data = normalizeGeneral({ points: [p], logs: [], extraV13: { keep: true } })
    expect(data.points[0].id).toBe('old'); expect(data.points[0].tags[0].label).toBe('重点')
    expect(data.points[0].difficulty).toBe(7.35)
    expect(data.points[0].managementChapters).toEqual(p.managementChapters); expect(data.extraV13).toEqual({ keep: true })
  })
  it('retains extracted FSRS results for default retention settings', () => {
    for (const rating of [1, 2, 3, 4] as Rating[]) for (const elapsed of [0, 0.5, 3]) {
      const p = point('p')
      if (elapsed) Object.assign(p, { totalReviews: 2, lastReviewedAt: now - elapsed * DAY, stability: 4, difficulty: 6 })
      expect(scheduleGeneral(p, rating, now, {})).toEqual(schedule(p, rating, now))
    }
  })
  it('uses the exact legacy fallbacks and two-decimal difficulty migration', () => {
    const raw = { ...point('p'), difficulty: undefined, stability: undefined, interval: 3 }
    const p = normalizeGeneral({ points: [raw] }).points[0]
    expect(p.difficulty).toBe(3.65); expect(p.stability).toBe(3)
  })
  it('preserves V13 retention choice without changing learned S/D', () => {
    const p = point('p'); const defaults = schedule(p, 3, now)
    const adapted = scheduleGeneral(p, 3, now, { standardTargetRetention: 0.99 })
    expect(adapted.stability).toBe(defaults.stability); expect(adapted.difficulty).toBe(defaults.difficulty)
    expect(adapted.interval).toBeLessThanOrEqual(defaults.interval)
  })
  it('saves original rating with missing checkpoints and never double commits', () => {
    const s = platform([point('p')]); const data = reviewGeneral(s.general, 'p', 2, ['概念'], 'result', now)
    expect(data.logs).toHaveLength(1); expect(data.points[0].leaks).toEqual([{ label: '机制', due: new Date(2026, 9, 14).getTime() }])
    expect(reviewGeneral(data, 'p', 2, [], 'result', now)).toBe(data)
    const recovered = reviewGeneral(data, 'p', 3, ['概念', '机制'], 'next', now + DAY, { draft: '概念与机制', startedAt: now + DAY - 10000 })
    expect(recovered.points[0].leaks).toEqual([])
    expect(recovered.logs[1].preRevealDraft).toBe('概念与机制'); expect(recovered.logs[1].durationSeconds).toBe(10)
  })
  it('keeps unresolved leak deadlines across days and adds only newly missed labels', () => {
    const s = platform([point('p')])
    const first = reviewGeneral(s.general, 'p', 2, ['概念'], 'first', now)
    const due = first.points[0].leaks![0].due
    const second = reviewGeneral(first, 'p', 2, [], 'second', now + 2 * DAY)
    expect(second.points[0].leaks).toEqual([{ label: '机制', due }, { label: '概念', due: new Date(2026, 9, 16).getTime() }])
    expect(second.logs[1].previousState!.leaks).toEqual(first.points[0].leaks)
    expect(first.points[0].leaks).toEqual([{ label: '机制', due }])
    expect(reviewGeneral(second, 'p', 2, [], 'second', now + 3 * DAY)).toBe(second)
    const resolved = reviewGeneral(second, 'p', 3, ['机制'], 'third', now + 3 * DAY)
    expect(resolved.points[0].leaks).toEqual([{ label: '概念', due: new Date(2026, 9, 16).getTime() }])
  })
  it('deduplicates imported leaks using the earliest deadline without dropping other unresolved labels', () => {
    const p = point('p')
    p.checklist = ['概念', '机制', '机制']
    p.leaks = [{ label: '机制', due: now + DAY }, { label: '机制', due: now - DAY }, { label: '旧核对项', due: now }, { label: '概念', due: now }]
    const result = reviewGeneral(platform([p]).general, 'p', 2, ['概念'], 'dedup', now)
    expect(result.points[0].leaks).toEqual([{ label: '机制', due: now - DAY }, { label: '旧核对项', due: now }])
    expect(result.logs[0].previousState!.leaks).toEqual(p.leaks)
  })
  it('refuses malformed/duplicate points rather than silently deleting them', () => {
    expect(() => normalizeGeneral({ points: [point('p'), point('p')] })).toThrow()
    expect(() => normalizeGeneral({ points: [{ ...point('p'), dueDate: 'tomorrow' }] })).toThrow()
  })
  it('reads legacy browser keys without modifying them', () => {
    const kv = memoryKv(); const old = JSON.stringify([point('p')]); kv.setItem('ms346_points_v1', old)
    const got = loadPlatform(kv, now)
    expect(got.blocked).toBe(false); expect(got.state.general.points).toHaveLength(1)
    expect(kv.getItem('ms346_points_v1')).toBe(old)
  })
  it('protects corrupted or newer platform records', () => {
    const kv = memoryKv(); kv.setItem(PLATFORM_KEY, JSON.stringify({ platformVersion: 99 }))
    expect(loadPlatform(kv, now).blocked).toBe(true); expect(kv.getItem(PLATFORM_KEY)).toBe('{"platformVersion":99}')
  })
})

describe('fusion backup transactions', () => {
  it('previews legacy merge, preserves unique ids and isolates management', () => {
    const s = platform([point('existing')]); const a = mrc()
    const raw = JSON.stringify({ points: [point('new'), point('legacy', '体育管理学')], logs: [], confusionSets: [{ id: 'cs', name: '决策过程' }] })
    const plan = inspectFusionImport(raw, s, a)
    expect(s.general.points).toHaveLength(1); expect(plan.platform.general.points).toHaveLength(3)
    expect(plan.platform.general.confusionSets).toEqual([{ id: 'cs', name: '决策过程' }]); expect(plan.mrc).toBe(a)
  })
  it('uses the original MRC import to merge evidence', () => {
    const a = mrc(); const item = content.items.find(i => i.coreA)!
    a.attempts = [commitAttempt({ ...startRecall(item.id, now), phase: 'restate' }, item, now + 1, a.settings.gaps, [])]
    const plan = inspectFusionImport(JSON.stringify(a), platform(), mrc())
    expect(plan.mrc.attempts).toEqual(a.attempts); expect(plan.mrc.schemaVersion).toBe(a.schemaVersion)
  })
  it('roundtrips unfinished general draft, scopes and budget in a full envelope', () => {
    let s = platform([point('p')]); s = beginTask(s, generalCandidate(s, 'p'), now); s.session!.draft = '暂停的稿'
    const plan = inspectFusionImport(JSON.stringify(makeEnvelope(s, mrc())), platform(), mrc())
    expect(plan.platform).toEqual(s); expect(plan.platform.session!.draft).toBe('暂停的稿')
    expect(plan.mrc.sourceHashes).toEqual(content.meta.sourceHashes)
  })
  it('roundtrips unfinished MRC frozen draft without resetting it', () => {
    const a = mrc(); const item = content.items.find(i => i.coreA)!
    a.recall = { ...startRecall(item.id, now), draft: '管理学未完成', highestHintUsed: 'heading' }
    const s = reconcileMrc(platform(), a, now)
    const plan = inspectFusionImport(JSON.stringify(makeEnvelope(s, a)), platform(), mrc())
    expect(plan.mrc.recall).toEqual(a.recall); expect(plan.platform.active).toEqual(s.active)
  })
  it('blocks old merge during unfinished training and rejects mismatched full sessions', () => {
    let s = platform([point('p')]); s = beginTask(s, generalCandidate(s, 'p'), now)
    expect(() => inspectFusionImport(JSON.stringify({ points: [] }), s, mrc())).toThrow('当前训练')
    const broken = structuredClone(s); broken.session!.itemId = 'missing'
    expect(() => inspectFusionImport(JSON.stringify(makeEnvelope(broken, mrc())), platform(), mrc())).toThrow()
  })
  it('atomically writes both stores, and backs up both old raw values', () => {
    const kv = memoryKv(); kv.setItem(DATA_KEY, 'old-mrc'); kv.setItem(PLATFORM_KEY, 'old-platform')
    expect(writeBundle(kv, platform(), mrc()).ok).toBe(true)
    expect(JSON.parse(kv.getItem(DATA_KEY)!).sourceHashes).toEqual(content.meta.sourceHashes)
    expect(JSON.parse(kv.getItem(PLATFORM_KEY)!).platformVersion).toBe(1)
    expect(kv.getItem(JOURNAL_KEY)).toBeNull()
  })
  it('rolls back first store if second-store write fails once', () => {
    const base = memoryKv(); base.setItem(DATA_KEY, 'old-mrc'); base.setItem(PLATFORM_KEY, 'old-platform')
    let fail = true
    const kv: Kv = { ...base, setItem: (key, value) => { if (key === DATA_KEY && fail) { fail = false; throw new Error('quota') } base.setItem(key, value) } }
    expect(writeBundle(kv, platform(), mrc()).ok).toBe(false)
    expect(base.getItem(DATA_KEY)).toBe('old-mrc'); expect(base.getItem(PLATFORM_KEY)).toBe('old-platform')
  })
  it('recovers pending journal to old pair and committed journal to new pair', () => {
    for (const phase of ['pending', 'committed']) {
      const kv = memoryKv(); const previous = { [DATA_KEY]: 'old-mrc', [PLATFORM_KEY]: null }; const next = { [DATA_KEY]: 'new-mrc', [PLATFORM_KEY]: 'new-platform' }
      kv.setItem(JOURNAL_KEY, JSON.stringify({ phase, previous, next }))
      expect(recoverImport(kv)).toContain('恢复')
      expect(kv.getItem(DATA_KEY)).toBe(phase === 'pending' ? 'old-mrc' : 'new-mrc')
      expect(kv.getItem(PLATFORM_KEY)).toBe(phase === 'pending' ? null : 'new-platform')
    }
  })
  it('makes no changes if pre-import backup cannot be written', () => {
    const base = memoryKv(); base.setItem(DATA_KEY, 'old'); const kv: Kv = { ...base, setItem: () => { throw new Error('full') } }
    expect(writeBundle(kv, platform(), mrc()).ok).toBe(false); expect(base.getItem(DATA_KEY)).toBe('old')
    expect(base.getItem(JOURNAL_KEY)).toBeNull()
  })
})

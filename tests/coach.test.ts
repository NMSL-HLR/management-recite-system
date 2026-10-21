import { describe, expect, it } from 'vitest'
import legacy from '../src/data/generated/content.json'
import type { ContentBundle } from '../src/types'
import { content } from '../src/content'
import { buildCandidates } from '../src/coach/candidates'
import { decideNext } from '../src/coach/decision'
import { ensurePlan, remainingMinutes } from '../src/coach/planner'
import { coachInput, commitCoachRecall, continueCoach, prepareCoachState, startChosenRecall, startCoachRecall } from '../src/coach/recallAdapter'
import { commitAttempt, requestHint, startRecall, submitDraft, toRestate } from '../src/engine/recall'
import { isPromptOnlyConfirmedBItem } from '../src/engine/priority'
import { DEFAULT_GAPS } from '../src/engine/schedule'
import { defaultPersisted } from '../src/state/defaults'
import type { CoachPersisted } from '../src/coach/types'
import type { Attempt, StudyItem } from '../src/types'

const now = new Date(2026, 9, 12, 10).getTime()
const core = content.items.filter((item) => item.coreA)

function newState(): CoachPersisted {
  return prepareCoachState(defaultPersisted(), now)
}

function recorded(item: StudyItem, finishedAt: number, dueAt: number): Attempt {
  let recall = submitDraft({ ...startRecall(item.id, finishedAt - 60_000), draft: '原有草稿' }, finishedAt - 30_000)
  recall = { ...recall, checkedPointIds: item.checkPoints.filter((p) => p.role !== 'expansion').map((p) => p.id) }
  return { ...commitAttempt(recall, item, finishedAt, DEFAULT_GAPS, []), dueAt }
}

function readyToCommit(state: CoachPersisted): CoachPersisted {
  const item = content.items.find((row) => row.id === state.recall!.itemId)!
  let recall = submitDraft({ ...state.recall!, draft: '定义、过程、体育管理案例' }, now + 1000)
  recall = toRestate({ ...recall, checkedPointIds: item.checkPoints.filter((p) => p.role !== 'expansion').map((p) => p.id) })
  return { ...state, recall: { ...recall, postRevealNoHintPassed: true, restatement: '撤提示后完整复述', selfConfidence: 4 } }
}

describe('Alpha Lite Coach', () => {
  it('recommends the first A core question to a new user without creating evidence', () => {
    const state = newState()
    const decision = decideNext(coachInput(state), state.coachState!, now)
    expect(decision.kind).toBe('next')
    if (decision.kind !== 'next') throw new Error('Expected next task')
    expect(decision.task.itemId).toBe(core[0].id)
    expect(decision.task.kind).toBe('initial_recall')
    expect(state.attempts).toEqual([])
  })

  it('puts due reviews ahead of unseen core questions without changing dueAt', () => {
    const attempt = recorded(core[10], now - 60_000, now - 1)
    const state = { ...newState(), attempts: [attempt] }
    const candidates = buildCandidates(coachInput(state), now)
    expect(candidates[0].item.id).toBe(core[10].id)
    expect(candidates[0].dueAt).toBe(now - 1)
    expect(state.attempts[0]).toEqual(attempt)
  })

  it('filters references, confirmed prompt-only B and not-yet-due repeated questions', () => {
    const old = legacy as ContentBundle
    const relation = old.relations.find((row) => (row.role === 'skeleton' || row.role === 'topic') &&
      !old.items.find((item) => item.id === row.bItemId)?.fullTextForLookup)!
    const state = { ...newState(), attempts: [recorded(old.items.find(i => i.coreA)!, now - 1000, now + 60_000)], relationOverrides: { [relation.id]: 'confirmed' as const } }
    const input = { ...coachInput(state), items: old.items, relations: old.relations }
    const candidates = buildCandidates(input, now)
    expect(candidates.some((row) => row.item.id === old.items.find(i => i.coreA)!.id)).toBe(false)
    expect(candidates.some((row) => row.item.kind === 'reference')).toBe(false)
    expect(candidates.some((row) => isPromptOnlyConfirmedBItem(row.item, input.relations, input.relationOverrides))).toBe(false)
    expect(old.items.some((item) => isPromptOnlyConfirmedBItem(item, input.relations, input.relationOverrides))).toBe(true)
    expect(candidates.some((row) => row.item.fullTextForLookup)).toBe(true)
  })

  it('resumes a V2 unfinished Recall ahead of due tasks, even with an exhausted budget', () => {
    const oldRecall = { ...startRecall(core[5].id, now - 10_000), draft: '必须保留的 V2 草稿' }
    const state = prepareCoachState({ ...defaultPersisted(), recall: oldRecall, attempts: [recorded(core[0], now - 2000, now - 1)] }, now)
    state.coachState = { ...state.coachState!, budgetMinutes: 0, closed: true }
    const decision = decideNext(coachInput(state), state.coachState, now)
    expect(decision.kind).toBe('resume')
    const resumed = startCoachRecall(state, now)
    expect(resumed.recall).toEqual(oldRecall)
    expect(startChosenRecall(resumed, core[0].id, now).recall).toEqual(oldRecall)
  })

  it('uses the original engine result unchanged and completes exactly one Coach task', () => {
    const state = readyToCommit(startCoachRecall(newState(), now))
    const item = content.items.find((row) => row.id === state.recall!.itemId)!
    const expected = commitAttempt(state.recall!, item, now + 5000, state.settings.gaps, state.attempts)
    const committed = commitCoachRecall(state, now + 5000)
    expect(committed.attempts).toEqual([expected])
    expect(committed.coachState!.tasks[0].status).toBe('completed')
    expect(committed.recall?.phase).toBe('done')
    expect(commitCoachRecall(committed, now + 6000)).toBe(committed)
    const next = continueCoach(committed, now + 6000)
    expect(next.recall?.itemId).not.toBe(item.id)
    expect(next.attempts).toEqual([expected])
  })

  it('retains cue-dependent evidence and the original 45-minute scheduling rule', () => {
    let state = startCoachRecall(newState(), now)
    state = { ...state, recall: requestHint(state.recall!, { confirmedSkeletonIds: ['confirmed'], confirmedRedlineIds: [], candidateRelationIds: [], keywords: [], hasHeadings: true }, now + 1000) }
    state = readyToCommit(state)
    const result = commitCoachRecall(state, now + 5000).attempts[0]
    expect(result.evidenceState).toBe('cue_dependent')
    expect(result.dueAt).toBe(now + 5000 + 45 * 60_000)
  })

  it('stops after the daily budget is consumed and does not append tasks on repeated continuation', () => {
    let state = newState()
    state.coachState = { ...state.coachState!, budgetMinutes: 15 }
    state = commitCoachRecall(readyToCommit(startCoachRecall(state, now)), now + 5000)
    expect(remainingMinutes(state.coachState!)).toBe(0)
    expect(decideNext(coachInput(state), state.coachState!, now + 6000)).toEqual({ kind: 'done', reason: 'budget' })
    for (let i = 0; i < 10; i++) state = continueCoach(state, now + 6000 + i)
    expect(state.coachState!.tasks).toHaveLength(1)
    expect(state.attempts).toHaveLength(1)
    expect(state.recall).toBeNull()
    expect(state.coachState!.closed).toBe(true)
  })

  it('shows a future wait without prematurely retesting, then offers the task when due', () => {
    const state = newState()
    const attempt = recorded(core[0], now - 1000, now + 45 * 60_000)
    const input = { ...coachInput(state), items: [core[0]], attempts: [attempt] }
    expect(decideNext(input, state.coachState!, now)).toEqual({ kind: 'wait', dueAt: attempt.dueAt })
    const due = decideNext(input, state.coachState!, attempt.dueAt!)
    expect(due.kind).toBe('next')
    if (due.kind === 'next') expect(due.task.kind).toBe('due_review')
  })

  it('round-trips the minimal optional state and keeps a draft, task ID and reservation on refresh', () => {
    let state = startCoachRecall(newState(), now)
    state = { ...state, recall: { ...state.recall!, draft: '刷新后必须保留' } }
    const loaded = prepareCoachState(JSON.parse(JSON.stringify(state)), now + 2000)
    expect(loaded.recall).toEqual(state.recall)
    expect(loaded.coachState).toEqual(state.coachState)
    expect(startCoachRecall(loaded, now + 3000).coachState).toEqual(state.coachState)
  })

  it('leaves all old V2 learning fields and evidence untouched when adding Coach state', () => {
    const old = { ...defaultPersisted(), attempts: [recorded(core[0], now - 1000, now + 60_000)] }
    const result = prepareCoachState(old, now)
    const { coachState: extension, ...original } = result
    expect(extension).toBeDefined()
    expect(original).toEqual(old)
    expect(old).not.toHaveProperty('coachState')
  })

  it('rolls the finite plan to the next local day while carrying the same unfinished draft', () => {
    const state = startCoachRecall(newState(), now)
    const tomorrow = now + 24 * 60 * 60_000
    const loaded = prepareCoachState(state, tomorrow)
    expect(loaded.recall).toEqual(state.recall)
    expect(loaded.coachState!.date).not.toBe(state.coachState!.date)
    expect(loaded.coachState!.reservedMinutes).toBe(15)
    expect(loaded.coachState!.tasks).toHaveLength(1)
  })

  it('recovers safely from an invalid optional Coach extension without altering attempts', () => {
    const previous = newState()
    const broken = JSON.parse(JSON.stringify(previous))
    broken.coachState.tasks = null
    const recovered = prepareCoachState(broken, now)
    expect(recovered.attempts).toEqual(previous.attempts)
    expect(recovered.coachState).toEqual(ensurePlan(undefined, now))
  })
})

import { content } from '../content'
import { commitAttempt, startRecall } from '../engine/recall'
import { estimatedMinutes } from './candidates'
import { decideNext, resumeTask } from './decision'
import { beginTask, ensurePlan, finishTask, remainingMinutes } from './planner'
import type { CoachInput, CoachPersisted, CoachTask } from './types'

export function coachInput(state: CoachPersisted): CoachInput {
  return {
    items: content.items,
    attempts: state.attempts,
    relations: content.relations,
    relationOverrides: state.relationOverrides,
    recall: state.recall,
    includeAppendix2: state.settings.day.includeAppendix2,
  }
}

export function prepareCoachState(state: CoachPersisted, now: number): CoachPersisted {
  let plan = ensurePlan(state.coachState, now)
  const task = resumeTask(coachInput(state), plan)
  if (task) plan = beginTask(plan, task)
  // Old imports may have cleared Recall without settling its Coach reservation.
  // Stale Coach tasks must not become a second source of unfinished training.
  const stale = plan.tasks.filter(row => row.status === 'in_progress' && row.itemId !== state.recall?.itemId)
  plan = { ...plan, tasks: plan.tasks.filter(row => !stale.includes(row)), reservedMinutes: Math.max(0, plan.reservedMinutes - stale.reduce((n, row) => n + row.estimatedMinutes, 0)) }
  return { ...state, coachState: plan }
}

export function startCoachRecall(state: CoachPersisted, now: number): CoachPersisted {
  const prepared = prepareCoachState(state, now)
  const plan = prepared.coachState!
  const decision = decideNext(coachInput(prepared), plan, now)
  if (decision.kind === 'resume') return { ...prepared, view: 'recall' }
  if (decision.kind !== 'next') return { ...prepared, view: 'today', coachState: decision.kind === 'done' ? { ...plan, closed: true } : plan }
  return {
    ...prepared,
    view: 'recall',
    recall: startRecall(decision.task.itemId, now),
    recallQueue: [decision.task.itemId],
    coachState: beginTask(plan, decision.task),
  }
}

/** Existing explicit item links remain available, but cannot overwrite a draft or bypass the daily cap. */
export function startChosenRecall(state: CoachPersisted, itemId: string, now: number): CoachPersisted {
  if (state.recall && state.recall.phase !== 'done') return startCoachRecall(state, now)
  const prepared = prepareCoachState(state, now)
  const plan = prepared.coachState!
  const item = content.items.find((row) => row.id === itemId)
  if (!item || plan.closed || estimatedMinutes(item) > remainingMinutes(plan)) return { ...prepared, view: 'today' }
  const hasAttempt = state.attempts.some((attempt) => attempt.itemId === itemId)
  const task: CoachTask = {
    id: `coach-chosen-${plan.date}-${now}-${itemId}`,
    itemId,
    kind: hasAttempt ? 'due_review' : 'initial_recall',
    status: 'queued',
    reason: '你主动选择了这道题。训练仍按原提示链和证据规则记录。',
    estimatedMinutes: estimatedMinutes(item),
    createdAt: now,
    completedAt: null,
  }
  return { ...prepared, view: 'recall', recall: startRecall(itemId, now), recallQueue: [itemId], coachState: beginTask(plan, task) }
}

export function commitCoachRecall(state: CoachPersisted, now: number): CoachPersisted {
  const recall = state.recall
  if (!recall || recall.phase !== 'restate' || recall.postRevealNoHintPassed === undefined) return state
  const item = content.items.find((row) => row.id === recall.itemId)
  if (!item) return state
  const prepared = prepareCoachState(state, now)
  // Evidence and dueAt are produced by the unmodified V2 engine.
  const attempt = commitAttempt(recall, item, now, state.settings.gaps, state.attempts)
  if (state.attempts.some((row) => row.id === attempt.id)) return state
  return {
    ...prepared,
    attempts: [...state.attempts, attempt],
    recall: { ...recall, phase: 'done', result: attempt },
    coachState: finishTask(prepared.coachState!, recall, now),
  }
}

export function continueCoach(state: CoachPersisted, now: number): CoachPersisted {
  // A result screen may be left open: continuation recomputes eligibility with the current time.
  if (state.recall && state.recall.phase !== 'done') return startCoachRecall(state, now)
  return startCoachRecall({ ...state, recall: null, recallQueue: [] }, now)
}


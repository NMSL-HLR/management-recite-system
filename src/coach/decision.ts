import { buildCandidates, estimatedMinutes, latestAttempts, nextWaitingDueAt } from './candidates'
import { remainingMinutes } from './planner'
import { selectCandidate, taskFromCandidate } from './selector'
import type { CoachDecision, CoachInput, CoachState, CoachTask } from './types'

export function resumeTask(input: CoachInput, plan: CoachState): CoachTask | null {
  const recall = input.recall
  if (!recall || recall.phase === 'done') return null
  const item = input.items.find((row) => row.id === recall.itemId)
  if (!item) return null
  const saved = plan.tasks.find((task) => task.itemId === item.id && task.status === 'in_progress')
  return saved ?? {
    id: `coach-resume-${recall.startedAt}-${item.id}`,
    itemId: item.id,
    kind: latestAttempts(input.attempts).has(item.id) ? 'due_review' : 'initial_recall',
    status: 'in_progress',
    reason: '上次训练尚未完成，继续原草稿和提示步骤。',
    estimatedMinutes: estimatedMinutes(item),
    createdAt: recall.startedAt,
    completedAt: null,
  }
}

export function decideNext(input: CoachInput, plan: CoachState, now: number): CoachDecision {
  const unfinished = resumeTask(input, plan)
  if (unfinished) return { kind: 'resume', task: unfinished }
  if (plan.closed) return { kind: 'done', reason: 'closed' }
  const remaining = remainingMinutes(plan)
  if (remaining <= 0 || plan.tasks.length >= Math.floor(plan.budgetMinutes / 5)) return { kind: 'done', reason: 'budget' }
  const candidates = buildCandidates(input, now)
  const candidate = selectCandidate(candidates, remaining)
  if (candidate) return { kind: 'next', task: taskFromCandidate(candidate, plan.date, now) }
  if (candidates.length) return { kind: 'done', reason: 'budget' }
  const dueAt = nextWaitingDueAt(input, now)
  if (dueAt !== null) return { kind: 'wait', dueAt }
  return { kind: 'done', reason: 'no_candidates' }
}


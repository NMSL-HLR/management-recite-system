import type { CoachCandidate, CoachTask } from './types'

export function selectCandidate(candidates: CoachCandidate[], remainingMinutes: number): CoachCandidate | null {
  return candidates.find((candidate) => candidate.estimatedMinutes <= remainingMinutes) ?? null
}

export function taskFromCandidate(candidate: CoachCandidate, date: string, now: number): CoachTask {
  return {
    id: `coach-${date}-${candidate.item.id}-${candidate.latest?.id ?? 'initial'}`,
    itemId: candidate.item.id,
    kind: candidate.latest ? 'due_review' : 'initial_recall',
    status: 'queued',
    reason: candidate.reason,
    estimatedMinutes: candidate.estimatedMinutes,
    createdAt: now,
    completedAt: null,
  }
}


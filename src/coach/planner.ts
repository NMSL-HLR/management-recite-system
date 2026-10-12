import type { RecallState } from '../types'
import type { CoachState, CoachTask } from './types'

export const DEFAULT_COACH_MINUTES = 60

export function localDate(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function validCoachState(value: unknown): value is CoachState {
  if (!value || typeof value !== 'object') return false
  const state = value as CoachState
  return typeof state.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.date) &&
    Number.isFinite(state.budgetMinutes) && state.budgetMinutes >= 0 && state.budgetMinutes <= 600 &&
    Number.isFinite(state.reservedMinutes) && state.reservedMinutes >= 0 &&
    typeof state.closed === 'boolean' && Array.isArray(state.tasks) && state.tasks.length <= 120 &&
    state.tasks.every((task) => task && typeof task.id === 'string' && typeof task.itemId === 'string' &&
      ['initial_recall', 'due_review'].includes(task.kind) &&
      ['queued', 'in_progress', 'completed'].includes(task.status) && typeof task.reason === 'string' &&
      Number.isFinite(task.estimatedMinutes) && task.estimatedMinutes >= 5 &&
      Number.isFinite(task.createdAt) && (task.completedAt === null || Number.isFinite(task.completedAt)))
}

export function ensurePlan(previous: CoachState | undefined, now: number): CoachState {
  const date = localDate(now)
  if (validCoachState(previous) && previous.date === date) return previous
  const carry = validCoachState(previous) ? previous.tasks.filter((task) => task.status === 'in_progress').slice(0, 1) : []
  return {
    date,
    budgetMinutes: validCoachState(previous) ? previous.budgetMinutes : DEFAULT_COACH_MINUTES,
    reservedMinutes: carry.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    tasks: carry,
    closed: false,
  }
}

export function remainingMinutes(plan: CoachState): number {
  return Math.max(0, plan.budgetMinutes - plan.reservedMinutes)
}

export function beginTask(plan: CoachState, task: CoachTask): CoachState {
  const existing = plan.tasks.find((row) => row.id === task.id)
  if (existing?.status === 'in_progress') return plan
  return {
    ...plan,
    reservedMinutes: plan.reservedMinutes + task.estimatedMinutes,
    tasks: [...plan.tasks.filter((row) => row.id !== task.id), { ...task, status: 'in_progress' }],
  }
}

export function finishTask(plan: CoachState, recall: RecallState, now: number): CoachState {
  return {
    ...plan,
    tasks: plan.tasks.map((task) => task.itemId === recall.itemId && task.status === 'in_progress'
      ? { ...task, status: 'completed', completedAt: now } : task),
  }
}


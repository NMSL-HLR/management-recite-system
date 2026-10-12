import { isPromptOnlyConfirmedBItem, rankItems } from '../engine/priority'
import type { Attempt, StudyItem } from '../types'
import type { CoachCandidate, CoachInput } from './types'

export function estimatedMinutes(item: StudyItem): number {
  if (item.kind === 'redline') return 5
  if (item.coreA || item.appendixFullAnswer || item.kind === 'full_answer') return 15
  return 10
}

export function latestAttempts(attempts: Attempt[]): Map<string, Attempt> {
  const latest = new Map<string, Attempt>()
  for (const attempt of attempts) {
    const previous = latest.get(attempt.itemId)
    if (!previous || attempt.finishedAt >= previous.finishedAt) latest.set(attempt.itemId, attempt)
  }
  return latest
}

export function trainingItems(input: CoachInput): StudyItem[] {
  return input.items.filter((item) =>
    item.kind !== 'reference' &&
    (input.includeAppendix2 || !item.appendixFullAnswer) &&
    !isPromptOnlyConfirmedBItem(item, input.relations, input.relationOverrides),
  )
}

function dueReason(latest: Attempt): string {
  if (latest.highestHintUsed === 'full_answer') return '上次需要完整原文，当前复测时间已到。'
  if (latest.highestHintUsed === 'keyword') return '上次使用了关键词提示，当前复测时间已到。'
  if (latest.highestHintUsed === 'heading') return '上次使用了骨架或小标题提示，当前复测时间已到。'
  if (latest.evidenceState === 'relearned') return '上次无提示作答仍有较多遗漏，当前复测时间已到。'
  if (latest.evidenceState === 'minor_omission') return '上次无提示作答有少量遗漏，当前复测时间已到。'
  return '上次已独立提取，当前到了间隔复测时间。'
}

export function buildCandidates(input: CoachInput, now: number): CoachCandidate[] {
  const latest = latestAttempts(input.attempts)
  const eligible = trainingItems(input).filter((item) => {
    const attempt = latest.get(item.id)
    // An existing record is eligible only when its actual saved dueAt has arrived.
    return !attempt || (typeof attempt.dueAt === 'number' && Number.isFinite(attempt.dueAt) && attempt.dueAt <= now)
  })
  return rankItems(eligible, input.attempts, now, input.relations, input.relationOverrides).map((row) => {
    const attempt = latest.get(row.item.id)
    return {
      item: row.item,
      latest: attempt,
      dueAt: row.dueAt,
      tier: row.tier,
      reason: attempt ? dueReason(attempt) : row.item.coreA
        ? '这道 A 册核心题还没有训练记录，先闭卷写出你能想起的骨架。'
        : `${row.reasons[0]}。先无提示提取，再按需恢复。`,
      estimatedMinutes: estimatedMinutes(row.item),
    }
  })
}

export function nextWaitingDueAt(input: CoachInput, now: number): number | null {
  const latest = latestAttempts(input.attempts)
  const dates = trainingItems(input).flatMap((item) => {
    const dueAt = latest.get(item.id)?.dueAt
    return typeof dueAt === 'number' && Number.isFinite(dueAt) && dueAt > now ? [dueAt] : []
  })
  return dates.length ? Math.min(...dates) : null
}


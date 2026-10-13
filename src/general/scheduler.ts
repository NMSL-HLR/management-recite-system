import type { KnowledgePoint, Rating } from './types'

/**
 * 记忆调度引擎 —— FSRS-6（Free Spaced Repetition Scheduler v6）
 *
 * 现代间隔重复算法，Anki 25.x 默认调度器。核心为 DSR 三变量记忆模型：
 *   D (Difficulty)    难度 1~10，调节稳定性增长速度
 *   S (Stability)     稳定性：保持率 R 衰减到 90% 所需的天数
 *   R (Retrievability) 当前可提取率，随时间按幂律连续衰减
 *
 * 公式与 21 个默认参数来自 open-spaced-repetition/awesome-fsrs 官方 Wiki，
 * 默认参数在约 7 亿条真实复习记录上训练，单人用户直接使用即可。
 *
 * 调度思路：设定目标保持率 DR（默认 90%，章节大条目 95%），
 * 反解遗忘曲线 R(t)=DR 对应的时间 t 作为下次间隔。
 */

// FSRS-6 官方默认参数（open-spaced-repetition/awesome-fsrs Wiki "The Algorithm"）
const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
] as const

export const DAY = 24 * 60 * 60 * 1000

// 遗忘曲线形状常数：保证 R(S, S) = 90%
const DECAY = -W[20]
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 幂律遗忘曲线：距上次复习 t 天后的预计保持率 (0~1) */
export function retrievability(tDays: number, stability: number): number {
  if (stability <= 0) return 0
  return Math.pow(1 + (FACTOR * tDays) / stability, DECAY)
}

/** 由目标保持率 DR 反解间隔天数（DR=0.9 时恰等于 S） */
function nextIntervalDays(stability: number, dr: number): number {
  return (stability / FACTOR) * (Math.pow(dr, 1 / DECAY) - 1)
}

/**
 * 目标保持率：章节大条目（要点清单 ≥5 项）复合结构衰减更快，
 * 提高到 95%（等价于复习更勤）；普通条目 90%
 */
export function targetRetentionFor(p: KnowledgePoint): number {
  return (p.checklist?.length ?? 0) >= 5 ? 0.95 : 0.9
}

/** 由要点完整度自动映射评分（章节复习时用） */
export function completenessToRating(completeness: number): Rating {
  if (completeness > 0.95) return 4
  if (completeness >= 0.8) return 3
  if (completeness >= 0.5) return 2
  return 1
}

/** 同科目打散：在保持到期优先的前提下，避免相邻两项同科目（交错效应，Rohrer） */
export function interleaveQueue(list: KnowledgePoint[]): KnowledgePoint[] {
  const rest = [...list]
  const out: KnowledgePoint[] = []
  while (rest.length > 0) {
    const prev = out[out.length - 1]
    const i = prev ? rest.findIndex((p) => p.subject !== prev.subject) : 0
    out.push(rest.splice(i >= 0 ? i : 0, 1)[0])
  }
  return out
}

/** 初始难度 D0：首次评分决定起点 */
function initialDifficulty(rating: Rating): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10)
}

/** 复习后难度更新：线性阻尼 + 均值回归（消除"难度地狱"） */
function nextDifficulty(d: number, rating: Rating): number {
  const delta = -W[6] * (rating - 3)
  const d2 = d + (delta * (10 - d)) / 9
  const d3 = W[7] * initialDifficulty(4) + (1 - W[7]) * d2
  return clamp(d3, 1, 10)
}

/** 成功回忆后的稳定性增长：难度越高/稳定越高增长越慢，越是濒临遗忘时答对增长越大 */
function stabilityAfterRecall(d: number, s: number, r: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? W[15] : 1
  const easyBonus = rating === 4 ? W[16] : 1
  const inc =
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus
  return s * (1 + inc)
}

/** 遗忘后的稳定性衰减（post-lapse） */
function stabilityAfterLapse(d: number, s: number, r: number): number {
  const sf =
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r))
  return Math.min(sf, s)
}

/** 当天内重复复习的短期稳定性公式 */
function stabilitySameDay(s: number, rating: Rating): number {
  const inc = Math.exp(W[17] * (rating - 3 + W[18])) * Math.pow(s, -W[19])
  // 评分≥3 时稳定性不允许下降
  return rating >= 3 ? s * Math.max(inc, 1) : s * inc
}

/** 创建新知识点：录入当天即安排首次学习 */
export function createPoint(
  data: Pick<KnowledgePoint, 'subject' | 'title' | 'content' | 'tags' | 'checklist'>,
  now = Date.now(),
): KnowledgePoint {
  return {
    id: `kp_${now}_${Math.random().toString(36).slice(2, 8)}`,
    ...data,
    checklist: data.checklist ?? [],
    leaks: [],
    createdAt: now,
    difficulty: 5, // 首次评分后由 D0 公式重置
    interval: 0,
    repetitions: 0,
    stability: 0.4,
    dueDate: startOfDay(now),
    state: 'new',
    totalReviews: 0,
    lapses: 0,
  }
}

type SchedulePatch = Pick<
  KnowledgePoint,
  | 'difficulty'
  | 'interval'
  | 'repetitions'
  | 'stability'
  | 'dueDate'
  | 'state'
  | 'lastReviewedAt'
  | 'totalReviews'
  | 'lapses'
>

/**
 * 核心调度函数：根据本次回忆评分，按 FSRS-6 公式计算下一次复习安排。
 * 返回更新后的字段（不修改原对象）。
 */
export function schedule(p: KnowledgePoint, rating: Rating, now = Date.now()): SchedulePatch {
  const isFirstReview = p.totalReviews === 0
  const elapsedDays = Math.max(0, (now - (p.lastReviewedAt ?? p.createdAt)) / DAY)
  const sameDay = !isFirstReview && elapsedDays < 1

  // ---- 难度 D ----
  const difficulty = isFirstReview ? initialDifficulty(rating) : nextDifficulty(p.difficulty, rating)

  // ---- 稳定性 S ----
  let stability: number
  if (isFirstReview) {
    stability = W[rating - 1] // 初始稳定性 S0(G)
  } else if (sameDay) {
    stability = stabilitySameDay(p.stability, rating)
  } else {
    const r = retrievability(elapsedDays, p.stability)
    stability =
      rating === 1
        ? stabilityAfterLapse(p.difficulty, p.stability, r)
        : stabilityAfterRecall(p.difficulty, p.stability, r, rating)
  }
  stability = clamp(stability, 0.1, 36500)

  // ---- 间隔与状态 ----
  let interval: number
  let repetitions: number
  let state: KnowledgePoint['state']
  let lapses = p.lapses

  if (rating === 1) {
    // 完全忘记：当天重学（短期队列），间隔压缩
    repetitions = 0
    interval = 0
    state = 'relearning'
    lapses += 1
  } else {
    repetitions = p.repetitions + 1
    interval = clamp(Math.round(nextIntervalDays(stability, targetRetentionFor(p))), 1, 365)
    state = repetitions >= 2 ? 'review' : 'learning'
  }

  return {
    difficulty,
    interval,
    repetitions,
    stability,
    dueDate: startOfDay(now) + interval * DAY,
    state,
    lastReviewedAt: now,
    totalReviews: p.totalReviews + 1,
    lapses,
  }
}

/** 今日到期的知识点（含逾期），按逾期程度排序后做同科目交错 */
export function dueToday(points: KnowledgePoint[], now = Date.now()): KnowledgePoint[] {
  const endOfToday = startOfDay(now) + DAY - 1
  const due = points.filter((p) => p.dueDate <= endOfToday).sort((a, b) => a.dueDate - b.dueDate)
  return interleaveQueue(due)
}

/** 未来 n 天的复习负荷分布 */
export function upcomingLoad(points: KnowledgePoint[], days: number, now = Date.now()): { date: string; count: number }[] {
  const today = startOfDay(now)
  const result: { date: string; count: number }[] = []
  for (let i = 0; i < days; i++) {
    const dayStart = today + i * DAY
    const dayEnd = dayStart + DAY - 1
    const count = points.filter((p) => p.dueDate >= dayStart && p.dueDate <= dayEnd).length
    const d = new Date(dayStart)
    result.push({
      date: i === 0 ? '今天' : i === 1 ? '明天' : `${d.getMonth() + 1}/${d.getDate()}`,
      count,
    })
  }
  return result
}

/** 当前全库平均记忆保持率（模拟"现在抽查能答对多少"） */
export function averageRetention(points: KnowledgePoint[], now = Date.now()): number {
  const reviewed = points.filter((p) => p.lastReviewedAt)
  if (reviewed.length === 0) return 0
  const sum = reviewed.reduce((acc, p) => {
    const t = (now - (p.lastReviewedAt ?? now)) / DAY
    return acc + retrievability(t, p.stability)
  }, 0)
  return sum / reviewed.length
}


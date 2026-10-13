// 记忆状态机：new(新录入) → learning(学习中) → review(稳定复习) 
// 遗忘后进入 relearning(重学)
export type MemoryState = 'new' | 'learning' | 'review' | 'relearning'

// 回忆质量评分（基于提取练习的困难度自评）
// 1=完全忘记 2=模糊挣扎 3=成功回忆 4=轻松秒杀
export type Rating = 1 | 2 | 3 | 4

// 彩色标签：label 为文字，color 为预设色板中的类名
export interface Tag {
  label: string
  color: string
}

// 补漏项：章节复习时漏掉的要点，进入 1~2 天的短周期补漏队列
export interface LeakItem {
  label: string
  due: number            // 补漏到期时间（当天 0 点时间戳）
}

export interface KnowledgePoint {
  id: string
  subject: string        // 科目：运动生理学 / 体育概论 / 体育管理学 / 其他
  title: string          // 知识点名称，如"运动性疲劳"
  content: string        // 详细内容（名词解释 / 论述要点）
  tags: Tag[]
  checklist?: string[]   // 章节要点清单（以章节为单位背诵时使用，每行一个要点）
  leaks?: LeakItem[]     // 待补漏的要点
  createdAt: number

  // ---- 调度状态（FSRS-6 DSR 模型）----
  ef?: number            // 旧 SM-2 难度系数：仅旧数据迁移时读取换算 D，新卡不再写入
  difficulty: number     // FSRS 难度 D ∈ [1, 10]
  interval: number       // 当前复习间隔（天）
  repetitions: number    // 连续成功回忆次数（遗忘会清零）
  stability: number      // FSRS 稳定性 S（天）：保持率 R 衰减到 90% 所需时间
  dueDate: number        // 下次复习到期时间（当天 0 点时间戳）
  lastReviewedAt?: number
  state: MemoryState
  totalReviews: number   // 历史总复习次数
  lapses: number         // 累计遗忘次数
  postponedUntil?: number // 「明天再看」推迟到的时间（评分或提前复习后清除）
}

export interface ReviewLog {
  id: string
  pointId: string
  subject: string
  reviewedAt: number
  rating: Rating
  intervalBefore: number
  intervalAfter: number
  // 评分前的知识点状态快照，用于撤回时精确回滚
  previousState?: Partial<KnowledgePoint>
}

// 首次启动时的默认科目，之后完全由用户自定义管理
export const DEFAULT_SUBJECTS = ['运动生理学', '体育概论', '体育管理学', '其他']

// GBA 像素风评分面板：四档对应 GameBoy 屏幕由深到浅的四个色阶
export const RATING_META: Record<Rating, { label: string; desc: string; color: string; bg: string }> = {
  1: { label: '忘记', desc: '想不起来', color: '#f8f8f8', bg: '#081820' },
  2: { label: '模糊', desc: '有印象', color: '#f8f8f8', bg: '#48c072' },
  3: { label: '记住', desc: '回忆成功', color: '#081820', bg: '#e0f8cf' },
  4: { label: '秒杀', desc: '脱口而出', color: '#081820', bg: '#f8f8f8' },
}


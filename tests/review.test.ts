import { describe, expect, it } from 'vitest'
import { reviewAnswer, REVIEW_LIMITS } from '../src/review/analyze'
import { mrcRubric, generalRubric } from '../src/review/rubric'
import { reviewReport } from '../src/review/report'
import { canonical } from '../src/review/text'
import type { ReviewPoint } from '../src/review/types'
import legacy from '../src/data/generated/content.json'
import type { ContentBundle } from '../src/types'
import { content } from '../src/content'
import { physiologyPack, policyPack } from '../src/general/textbook'
const point = (reference: string, patch: Partial<ReviewPoint> = {}): ReviewPoint => ({ id: 'p', label: '核对点', reference, group: '理论', role: 'point', confirmable: true, source: '本题原文', ...patch })
const review = (draft: string, source: string) => reviewAnswer(draft, [point(source)]).rows[0]

describe('offline text review: conservative evidence boundaries', () => {
  it('matches formatting and OCR line wrapping, retaining the actual answer excerpt', () => {
    const row = review('１．管理活动需要\n协调组织资源，\n实现组织目标。', '管理活动需要协调组织资源，实现组织目标。')
    expect(row.status).toBe('matched')
    expect(row.evidence[0].answer).toContain('\n')
    expect(row.evidence[0].reference).toBe('管理活动需要协调组织资源，实现组织目标。')
  })
  it('does not turn a heading alone into its full explanatory point', () => {
    const row = review('系统原理', '系统原理要求把组织视为整体，协调各子系统之间的相互关系。')
    expect(row.status).not.toBe('matched')
  })
  it('keeps title matching explicitly scoped to the outline', () => {
    const r = reviewAnswer('系统原理', [point('（一）系统原理', { role: 'heading' })])
    expect(r.rows[0].status).toBe('matched')
    expect(r.rows[0].explanation).toContain('不代表')
  })
  it.each([
    ['运动时心率下降，促进血液循环。', '运动时心率升高，促进血液循环。'],
    ['Na⁺外流形成终板电位。', 'Na⁺内流形成终板电位。'],
    ['Na⁺外流，K⁺内流形成终板电位。', 'Na⁺内流，K⁺外流形成终板电位。'],
    ['积分肌电与肌力成反比。', '积分肌电与肌力成正比。'],
    ['员工不参与制定组织目标。', '员工参与制定组织目标。'],
    ['不是员工参与制定组织目标。', '员工参与制定组织目标。'],
    ['错误说法：员工参与制定组织目标。', '员工参与制定组织目标。'],
    ['心率达到160次/min时终止实验。', '心率达到180次/min时终止实验。'],
    ['正常数值应当小于20mmHg。', '正常数值应当小于10mmHg。'],
    ['压力条件为P<20。', '压力条件为P>20。'],
    ['传导速度V=S*t。', '传导速度V=S/t。'],
    ['离子通道使Na-内流。', '离子通道使Na+内流。'],
    ['调节过程为刺激←反应。', '调节过程为刺激→反应。'],
  ])('flags polarity, number, sign or direction differences: %s', (draft, source) => {
    const row = review(draft, source)
    expect(row.status).toBe('check')
    expect(row.evidence.some(e => e.warnings.length)).toBe(true)
  })
  it('does not promote a paraphrase or shuffled keywords to semantic correctness', () => {
    const row = review('资源、管理、组织、目标、协调。', '管理是协调组织资源以实现组织目标的过程。')
    expect(row.status).not.toBe('matched')
    expect(JSON.stringify(row)).not.toContain('正确率')
  })
  it('allows source-exact negative and numerical statements without false polarity alerts', () => {
    const source = '理性分析与直觉判断不是对立的。心率达到180次/min时应终止实验。'
    const row = review(source, source)
    expect(row.status).toBe('matched')
    expect(row.evidence.flatMap(e => e.warnings)).toEqual([])
  })
  it('does not drop unmatched source sentences or let repetition inflate a result', () => {
    const first = '目标管理强调员工参与制定目标。', second = '成果评价需要对照既定目标开展。'
    const one = review(first, first + second), repeated = review(first.repeat(8), first + second)
    expect(one.status).not.toBe('matched')
    expect(repeated.status).not.toBe('matched')
    expect(repeated.missing).toEqual(one.missing)
  })
  it('keeps empty/no-rubric cases explicit and avoids fake grades', () => {
    const r = reviewAnswer('', [point('管理活动需要协调组织资源。')])
    expect(r.empty).toBe(true); expect(r.rows[0].status).toBe('unmatched')
    expect(reviewAnswer('回答', []).rows).toEqual([])
    expect(Object.keys(r)).not.toContain('score')
  })
  it('never modifies inputs, IDs, or scientific signs', () => {
    const refs = [point('Ca²⁺浓度升高。')], original = structuredClone(refs)
    const r = reviewAnswer('Ca2+浓度升高。', refs)
    expect(r.rows[0].status).toBe('matched'); expect(refs).toEqual(original)
    expect(canonical('Ca²⁺')).not.toBe(canonical('Ca²⁻'))
    expect(canonical('> 20')).not.toBe(canonical('< 20'))
    expect(canonical('- 5℃')).not.toBe(canonical('5℃'))
    expect(canonical('S/t')).not.toBe(canonical('S*t'))
    expect(canonical('0.1')).not.toBe(canonical('01'))
  })
  it('bounds computation without truncating or changing the saved answer', () => {
    const draft = '答案'.repeat(REVIEW_LIMITS.draft)
    const r = reviewAnswer(draft, [point('答案')])
    expect(r.limited).toBe(true); expect(r.rows[0].status).toBe('unavailable')
    expect(reviewReport('题目', draft, r)).toContain(draft)
  })
  it('bounds combined rubric size, not only each individual point', () => {
    const points = Array.from({ length: 80 }, (_, i) => point('原文内容'.repeat(300), { id: String(i) }))
    expect(reviewAnswer('我的回答。'.repeat(100), points).limited).toBe(true)
  })
  it('warns about replacement characters and screen timer text without modifying either', () => {
    const r = reviewAnswer('00:02\n管理�程', [point('管理过程')])
    expect(r.warnings).toHaveLength(2)
  })
})

describe('source-grounded rubrics', () => {
  it('keeps every MRC checkpoint ID and literal source, including sports and expansion', () => {
    for (const item of content.items) {
      const r = mrcRubric(item)
      expect(r.map(p => p.id)).toEqual(item.checkPoints.map(p => p.id))
      expect(r.map(p => p.reference)).toEqual(item.checkPoints.map(p => p.sourceText))
    }
  })
  it('does not treat publisher study instructions as automatically matched exam content', () => {
    const item = (legacy as ContentBundle).items.find(i => i.checkPoints.some(p => /原资料提示/.test(p.sourceText)))!
    const points = mrcRubric(item), p = points.find(p => p.role === 'reference')!
    expect(reviewAnswer(p.reference, [p]).rows[0].status).toBe('unavailable')
  })
  it('uses physiology section bodies and keeps section boundaries', () => {
    const p = physiologyPack.points[0], r = generalRubric(p)
    expect(r).toHaveLength(3)
    expect(r[0].reference).toContain('兴奋-收缩耦联')
    expect(r[0].reference).not.toContain('Na⁺内流')
    expect(r[1].reference).toContain('Na⁺内流')
    expect(r[2].reference).toContain('肌肉舒张')
    expect(reviewAnswer(p.checklist.join('\n'), r).rows.every(x => x.status !== 'matched')).toBe(true)
  })
  it('maps complete numbered physiology paragraphs and headings repeated at the start of body sentences', () => {
    const paragraph = physiologyPack.points.find(p => p.title.startsWith('F22｜'))!
    const r = generalRubric(paragraph)
    expect(r).toHaveLength(4)
    expect(r[0].reference.replace(/\*\*/g, '')).toContain('心肌由冠状循环供血')
    expect(r[0].reference).not.toContain('毛细血管、线粒体丰富')
    const heart = generalRubric(physiologyPack.points.find(p => p.title.startsWith('F23｜'))!)
    expect(heart[0].reference).toContain('1分钟内的心动周期')
    expect(heart[0].reference).toContain('心率可有效反映心室的收缩情况')
    expect(heart[0].reference).not.toContain('一侧心室收缩时一次性射入动脉')
  })
  it('uses policy paragraphs, not just their titles', () => {
    const p = policyPack.points[0], r = generalRubric(p)
    expect(r).toHaveLength(4)
    expect(r[0].reference).toContain('体育功能')
    expect(r[0].reference).not.toContain('记忆提示')
    expect(r.map(x => x.reference).join('')).not.toContain('本质“三项”')
    const rows = reviewAnswer(p.content, r).rows
    expect(rows.map(x => x.status)).toEqual(['matched', 'related', 'related', 'matched'])
    expect(rows.every(x => x.missing.length === 0 && x.evidence.every(e => e.exact))).toBe(true)
  })
  it('refuses ambiguous or absent paragraph mappings, and never assigns the whole answer to every label', () => {
    const r = generalRubric({ subject: '测试', title: '题目', content: '概念\n第一种内容。\n概念\n第二种内容。', checklist: ['概念', '不存在的点'] })
    expect(r.every(x => x.reference === '')).toBe(true)
    expect(reviewAnswer('概念', r).rows.every(x => x.status === 'unavailable')).toBe(true)
  })
  it('stops at a sibling heading even when that heading has no checklist entry', () => {
    const r = generalRubric({ subject: '测试', title: '题目', content: '## 概念\n管理需要协调组织资源。\n## 分类\n不能归到概念的另一段。', checklist: ['概念'] })
    expect(r[0].reference).toBe('管理需要协调组织资源。')
  })
  it('can review a custom whole answer without manufacturing checklist entries', () => {
    const p = { subject: '测试', title: '题目', content: '目标管理强调员工参与制定目标。', checklist: [] }
    const r = generalRubric(p)
    expect(r[0].confirmable).toBe(false)
    expect(reviewAnswer(p.content, r).rows[0].status).toBe('matched')
  })
  it('exports evidence, source wording and the user decision distinctly', () => {
    const r = reviewAnswer('员工不参与制定组织目标。', [point('员工参与制定组织目标。')])
    const report = reviewReport('目标管理', '员工不参与制定组织目标。', r, ['p'])
    expect(report).toContain('自动提示：需要检查')
    expect(report).toContain('本人核对：已确认写到')
    expect(report).toContain('教材对应正文：员工参与制定组织目标。')
  })
})

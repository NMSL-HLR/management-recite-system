import { canonical, clauses, grams, plain } from './text'
import type { AnswerReviewResult, PointReview, ReviewEvidence, ReviewPoint } from './types'

export const REVIEW_VERSION = 'offline-text-review-1'
export const REVIEW_LIMITS = { draft: 20_000, points: 100, reference: 8_000, segments: 450, totalReference: 40_000, comparisons: 120_000 } as const
const opposites = [['增加', '减少'], ['升高', '降低'], ['升高', '下降'], ['促进', '抑制'], ['内流', '外流'], ['正比', '反比'], ['收缩', '舒张'], ['有氧', '无氧'], ['大于', '小于']]
const negations = (s: string) => (s.match(/不|未|无|非/g) ?? []).length
const quantities = (s: string) => [...new Set(s.normalize('NFKC').match(/[+-]?\d+(?:\.\d+)?(?:%|[a-z]+)?/gi) ?? [])].sort().join('|')
const comparators = (s: string) => (s.match(/>=|<=|≥|≤|≠|>|</g) ?? []).sort().join('|')
const operators = (s: string) => (s.match(/[*/×÷^→←↑↓]|(?<=[a-z\d])[+-]|[+-](?=\d)/gi) ?? []).sort().join('|')
function wordingWarnings(reference: string, answer: string): string[] {
  const r = canonical(reference), a = canonical(answer), warnings: string[] = []
  if (negations(r) !== negations(a)) warnings.push('否定词用法与原文片段不同，请检查“不、未、无、非”的作用范围。')
  if (/(错误说法|不成立|未必|是否|不正确)/.test(answer) && !/(错误说法|不成立|未必|是否|不正确)/.test(reference)) warnings.push('作答可能在质疑或否定这个说法，请核对它在上下文中的含义。')
  for (const [left, right] of opposites) {
    if (r.includes(left) && r.includes(right) && a.includes(left) && a.includes(right) && !a.includes(r)) warnings.push(`两段都含“${left} / ${right}”，请逐一核对它们对应的对象，避免配对颠倒。`)
    if (r.includes(left) && !r.includes(right) && a.includes(right) && !a.includes(left)) warnings.push(`原文出现“${left}”，作答出现“${right}”，请检查方向或对象。`)
    if (r.includes(right) && !r.includes(left) && a.includes(left) && !a.includes(right)) warnings.push(`原文出现“${right}”，作答出现“${left}”，请检查方向或对象。`)
  }
  if (quantities(plain(reference)) && quantities(plain(answer)) && quantities(plain(reference)) !== quantities(plain(answer))) warnings.push('数字或单位与原文片段不同，请核对数值、单位及其对应对象。')
  if (operators(r) !== operators(a)) warnings.push('运算符、方向箭头或电荷符号不同，请核对公式及离子符号。')
  if (comparators(r) !== comparators(a)) warnings.push('大小关系符号不同，请核对不等号及其对应对象。')
  return [...new Set(warnings)]
}
interface Candidate { text: string; key: string; grams: Set<string> }
function findEvidence(reference: string, candidates: Candidate[]): ReviewEvidence | null {
  const key = canonical(reference), rg = grams(key)
  if (key.length < 3) return null
  // Prefer the shortest exact window, so an unrelated adjacent sentence doesn't drive the judgement.
  const exact = candidates.filter(c => c.key.includes(key)).sort((a, b) => a.key.length - b.key.length)[0]
  if (exact) return { reference, answer: exact.text, exact: true, warnings: wordingWarnings(reference, exact.text) }
  let best: Candidate | undefined, score = 0
  for (const c of candidates) {
    let overlap = 0
    const small = rg.size <= c.grams.size ? rg : c.grams, large = small === rg ? c.grams : rg
    for (const g of small) if (large.has(g)) overlap++
    const coverage = overlap / Math.max(1, rg.size)
    const rank = coverage * .75 + overlap / Math.max(1, c.grams.size) * .25
    if (overlap >= Math.min(4, rg.size) && coverage >= .35 && rank > score) { best = c; score = rank }
  }
  return best ? { reference, answer: best.text, exact: false, warnings: wordingWarnings(reference, best.text) } : null
}

/** Deterministic text alignment, not semantic grading. No network, score, or state writes. */
export function reviewAnswer(draft: string, points: ReviewPoint[]): AnswerReviewResult {
  const warnings: string[] = [], empty = !canonical(draft)
  const segments = clauses(draft)
  const limited = draft.length > REVIEW_LIMITS.draft || points.length > REVIEW_LIMITS.points || segments.length > REVIEW_LIMITS.segments || points.some(p => p.reference.length > REVIEW_LIMITS.reference) || points.reduce((n, p) => n + p.reference.length, 0) > REVIEW_LIMITS.totalReference || points.reduce((n, p) => n + clauses(p.reference).length, 0) * segments.length * 3 > REVIEW_LIMITS.comparisons
  if (limited) warnings.push('这份作答或教材超出本地快速评审范围，已停止自动匹配；原稿未截断，请使用原核对清单。')
  if (/�/.test(draft)) warnings.push('作答含无法识别的字符“�”，请对照纸面核查；冻结的原稿不会被自动改写。')
  if (/^\s*\d{1,2}:\d{2}\s*$/m.test(draft)) warnings.push('发现单独一行时间格式，可能是录屏计时混入；请检查该行是否属于答案。')
  const candidates: Candidate[] = []
  if (!limited && !empty) for (let i = 0; i < segments.length; i++) for (let n = 1; n <= 3 && i + n <= segments.length; n++) {
    const text = segments.slice(i, i + n).join('\n'), key = canonical(text)
    candidates.push({ text, key, grams: grams(key) })
  }
  const rows: PointReview[] = points.slice(0, REVIEW_LIMITS.points).map(point => {
    const base = { point, evidence: [] as ReviewEvidence[], missing: [] as string[] }
    if (limited || !point.reference.trim() || point.role === 'reference') return { ...base, status: 'unavailable', explanation: limited ? '请使用完整原文与原核对清单。' : point.role === 'reference' ? '这是资料说明，不据此推断答题正确性。' : '未定位到唯一的对应正文，请直接对照本题原文。' }
    const units = clauses(point.reference)
    const evidence: ReviewEvidence[] = [], missing: string[] = []
    for (const reference of units) {
      const found = findEvidence(reference, candidates)
      if (found) evidence.push(found)
      else missing.push(reference)
    }
    const allExact = units.length > 0 && !missing.length && evidence.every(e => e.exact)
    const suspicious = evidence.some(e => e.warnings.length > 0)
    const substantive = point.role === 'heading' || units.every(u => canonical(u).length >= 8)
    const status = suspicious ? 'check' : allExact && substantive ? 'matched' : evidence.length ? 'related' : 'unmatched'
    return { point, status, evidence, missing, explanation: suspicious ? '用词可能改变意思，也可能是识别或上下文差异；请对照下方原句确认。'
      : status === 'matched' ? point.role === 'heading' ? '找到对应标题；这只说明骨架出现，不代表该部分论述完整。' : '找到该核对点的原文表述；仍需检查上下文、对象和因果关系。'
      : status === 'related' ? '找到相近字词；是否表达了同一意思需要你确认。'
      : empty ? '没有可供匹配的作答文字，不据此自动评分。' : '未定位到明确对应，可能遗漏，也可能用了不同表达或有识别错字。' }
  })
  return { version: REVIEW_VERSION, rows, warnings, empty, limited }
}

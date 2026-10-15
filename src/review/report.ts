import type { AnswerReviewResult } from './types'
import { REVIEW_LABEL } from './types'

export function reviewReport(title: string, draft: string, result: AnswerReviewResult, checked: string[] = [], readOnly = false): string {
  return [
    `答题评审｜${title}`, `规则版本：${result.version}`, '依据当前教材对冻结作答进行本地文字匹配，不是考试分数或语义正确率。',
    ...(readOnly ? ['当前为只读评审。'] : ['核对勾选由使用者确认，不由匹配结果自动决定。']),
    ...result.warnings, '', '【揭晓前作答】', draft || '（空）', '', '【逐项评审】',
    ...result.rows.flatMap((row, index) => [
      `${index + 1}. ${row.point.label}`, `自动提示：${REVIEW_LABEL[row.status]}`, `本人核对：${checked.includes(row.point.id) ? '已确认写到' : '未勾选（不等于已判错）'}`,
      row.explanation, `教材来源：${row.point.source}`, `教材对应正文：${row.point.reference || '未定位，请查整题原文'}`,
      ...row.evidence.flatMap(e => [`作答片段：${e.answer}`, `原文片段：${e.reference}`, ...e.warnings]),
      ...(row.missing.length ? ['未匹配到的原文片段：', ...row.missing] : []), '',
    ]),
  ].join('\n')
}

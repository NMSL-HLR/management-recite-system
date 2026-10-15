/** Derived feedback only. Never stored as an Attempt or used to change a schedule. */
export type ReviewStatus = 'matched' | 'related' | 'check' | 'unmatched' | 'unavailable'
export interface ReviewPoint {
  id: string
  label: string
  reference: string
  group: string
  role: 'heading' | 'point' | 'sports' | 'expansion' | 'reference'
  confirmable: boolean
  source: string
}
export interface ReviewEvidence {
  reference: string
  answer: string
  exact: boolean
  warnings: string[]
}
export interface PointReview {
  point: ReviewPoint
  status: ReviewStatus
  explanation: string
  evidence: ReviewEvidence[]
  missing: string[]
}
export interface AnswerReviewResult {
  version: string
  rows: PointReview[]
  warnings: string[]
  empty: boolean
  limited: boolean
}
export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  matched: '找到原文对应', related: '有相关表述', check: '需要检查', unmatched: '未找到明确对应', unavailable: '请直接核对原文',
}

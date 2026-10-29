import type { GeneralData, GeneralPoint } from '../fusion/types'
import { mergeTextbook } from './textbook'

// Only these source fields may change. All scheduling, notes, tags and evidence stay local.
const CONTENT_FIELDS = ['title', 'content', 'checklist', 'quotaChapterOverride', 'trainingBlocked', 'referenceReason', 'sourceOrder', 'sourceHash', 'paragraphChecklist', 'rawSourceContent', 'sourceQuestionHash', 'sourceRevision'] as const
export interface TextbookChange { id: string; title: string; before: string; after: string; blocked: boolean }
export function textbookChanges(data: GeneralData, points: GeneralPoint[], packId: string, activeId?: string): TextbookChange[] {
  const existing = new Map(data.points.map(p => [p.id, p]))
  return points.flatMap(p => {
    const old = existing.get(p.id)
    if (!old) return []
    if (old.sourcePackId !== packId || p.sourcePackId !== packId || old.subject !== p.subject) {
      throw new Error(`教材中的 ${p.title} 与现有同 ID 条目来源或科目冲突，未修改记录。`)
    }
    if (CONTENT_FIELDS.every(k => JSON.stringify(old[k]) === JSON.stringify(p[k]))) return []
    const describe = (row: GeneralPoint) => JSON.stringify(Object.fromEntries(CONTENT_FIELDS.filter(k => row[k] !== undefined).map(k => [k, row[k]])), null, 2)
    return [{ id: p.id, title: p.title, before: describe(old), after: describe(p), blocked: p.id === activeId }]
  })
}

export function applyTextbookChanges(data: GeneralData, points: GeneralPoint[], packId: string, selected: string[], activeId?: string): GeneralData {
  const changes = textbookChanges(data, points, packId, activeId)
  const chosen = new Set(selected)
  if (selected.some(id => !changes.some(c => c.id === id && !c.blocked))) throw new Error('所选教材修订已变化，或对应训练尚未完成，请重新预览。')
  const incoming = new Map(points.map(p => [p.id, p]))
  const merged = mergeTextbook(data, points, packId)
  return { ...merged, points: merged.points.map(p => {
    if (!chosen.has(p.id)) return p
    const fresh = incoming.get(p.id)!
    const next = { ...p }
    for (const key of CONTENT_FIELDS) {
      if (fresh[key] === undefined) delete next[key]
      else (next as Record<string, unknown>)[key] = fresh[key]
    }
    return next
  }) }
}

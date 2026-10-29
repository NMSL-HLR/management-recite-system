import policy from '../data/policy/policy.json'
import pack from '../data/physiology/physiology.json'
import type { GeneralData, GeneralPoint } from '../fusion/types'
import { createPoint } from './scheduler'
import { naturalTitleCompare } from './naturalSort'

export const physiologyPack = pack
// Decode the quote marker for display only; retain the source and pack verbatim.
export const physiologyPrefaceText = pack.preface.replace(/&gt;/g, '>')
export function mergeTextbook(data: GeneralData, points: GeneralPoint[], packId: string): GeneralData {
  const known = new Set(data.points.map(p => p.id))
  const additions = points.filter(p => !known.has(p.id))
  const installed = Array.isArray(data.installedTextbooks) ? data.installedTextbooks.filter((s): s is string => typeof s === 'string') : []
  return { ...data, points: [...data.points, ...additions], subjects: [...new Set([...data.subjects, ...points.map(p => p.subject)])],
    installedTextbooks: [...new Set([...installed, packId])] }
}
export function installPhysiology(data: GeneralData, now: number): GeneralData {
  if (Array.isArray(data.installedTextbooks) && data.installedTextbooks.includes(pack.packId)) return data
  const points = pack.points.map(p => ({ ...p, ...createPoint({ subject: p.subject, title: p.title, content: p.content, tags: [], checklist: p.checklist }, now), id: p.id }))
  return mergeTextbook(data, points, pack.packId)
}
export function compareGeneralPoints(a: GeneralPoint, b: GeneralPoint): number {
  if (typeof a.sourcePackId === 'string' && a.sourcePackId === b.sourcePackId && typeof a.sourceOrder === 'number' && typeof b.sourceOrder === 'number') return a.sourceOrder - b.sourceOrder
  return naturalTitleCompare(a.title, b.title)
}

export const policyPack = policy
/** Archive superseded built-ins without modifying their scheduling or answer fields.
 * An active old session still resolves the same point and can finish against its old answer.
 * Retired rows are excluded from every future candidate and manual-practice pool.
 */
export function installBuiltInTextbooks(data: GeneralData, now: number, _activeId?: string): GeneralData {
  const retiredPacks = new Set(['physiology-final-v1', 'sports-policy-lectures-1-5-v1'])
  const retired = data.points.filter(p => typeof p.sourcePackId === 'string' && retiredPacks.has(p.sourcePackId) && !p.retiredTextbook)
  let next = data
  if (retired.length) {
    const ids = new Set(retired.map(p => p.id))
    next = { ...data, points: data.points.map(p => ids.has(p.id) ? { ...p, retiredTextbook: '2026-10-29', trainingBlocked: true,
      referenceReason: '旧教材档案：正文、成绩、笔记与到期时间保留，不再自动派题；在途训练仍按旧答案完成。' } : p),
      textbookReplacementArchive: [...(Array.isArray(data.textbookReplacementArchive) ? data.textbookReplacementArchive : []), { revision: '2026-10-29', replacedAt: now, points: retired }] }
  }
  next = installPhysiology(next, now)
  if (Array.isArray(next.installedTextbooks) && next.installedTextbooks.includes(policy.packId)) return next
  const fresh = policy.points.map(p => ({ ...p, ...createPoint({ subject: p.subject, title: p.title, content: p.content, tags: [], checklist: p.checklist }, now), id: p.id }))
  return mergeTextbook(next, fresh, policy.packId)
}

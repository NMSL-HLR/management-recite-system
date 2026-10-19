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
/** User-authorized replacement of this specific policy edition, preserving learning fields. */
export function installBuiltInTextbooks(data: GeneralData, now: number, activeId?: string): GeneralData {
  const previous = installPhysiology(data, now)
  if (previous.policySourceRevision === policy.revision) return previous
  const fresh = policy.points.map(p => ({ ...p, ...createPoint({ subject: p.subject, title: p.title, content: p.content, tags: [], checklist: p.checklist }, now), id: p.id }))
  const incoming = new Map(fresh.map(p => [p.id, p]))
  const fields = ['title', 'content', 'checklist', 'quotaChapterOverride', 'trainingBlocked', 'referenceReason', 'sourceOrder', 'sourceHash', 'sourceQuestionHash', 'sourceLine', 'sourceRevision', 'rawSourceContent'] as const
  const archived: GeneralPoint[] = []
  let pending = false
  const points = previous.points.map(old => {
    const next = incoming.get(old.id)
    if (!next || old.sourcePackId !== policy.packId || old.subject !== '体育概论' || old.sourceRevision === policy.revision) return old
    // The frozen answer must be compared with the same textbook until this attempt ends.
    if (old.id === activeId) { pending = true; return old }
    archived.push(old)
    const updated: GeneralPoint = { ...old }
    for (const field of fields) {
      const value = (next as GeneralPoint)[field]
      if (value === undefined) delete updated[field]
      else updated[field] = value as never
    }
    const retiredLeaks = (old.leaks ?? []).filter(leak => !next.checklist.includes(leak.label))
    if (retiredLeaks.length) {
      updated.policyLegacyLeaks = [...(Array.isArray(old.policyLegacyLeaks) ? old.policyLegacyLeaks : []), ...retiredLeaks]
      updated.leaks = (old.leaks ?? []).filter(leak => next.checklist.includes(leak.label))
    }
    return updated
  })
  const merged = mergeTextbook({ ...previous, points }, fresh, policy.packId)
  return { ...merged,
    ...(pending ? {} : { policySourceRevision: policy.revision }),
    ...(archived.length ? { policyReplacementArchive: [...(Array.isArray(previous.policyReplacementArchive) ? previous.policyReplacementArchive : []), { revision: policy.revision, replacedAt: now, points: archived }] } : {}),
  }
}

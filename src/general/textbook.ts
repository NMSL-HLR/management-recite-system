import pack from '../data/physiology/physiology.json'
import type { GeneralData, GeneralPoint } from '../fusion/types'
import { createPoint } from './scheduler'
import { naturalTitleCompare } from './naturalSort'

export const physiologyPack = pack
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

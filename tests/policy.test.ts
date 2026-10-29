import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import oldPolicy from '../sources/editions/policy-six.json'
import oldPhysiology from '../sources/editions/physiology-v1.json'
import { policyPack, physiologyPack, installBuiltInTextbooks } from '../src/general/textbook'
import { emptyGeneral, reviewGeneral } from '../src/general/data'
import { allCandidates, defaultFusion, lockChapters, retireUnavailableMrc } from '../src/fusion/planner'
import { defaultPersisted } from '../src/state/defaults'
import { inspectFusionImport } from '../src/fusion/transfer'
import type { GeneralPoint } from '../src/fusion/types'
import { generalRubric } from '../src/review/rubric'
const now = new Date(2026,9,29,10).getTime()
const oldData = () => ({...emptyGeneral(),points:[...oldPhysiology.points,...oldPolicy.points] as GeneralPoint[],installedTextbooks:[oldPhysiology.packId,oldPolicy.packId]})
describe('three-subject textbook replacement', () => {
  it('extracts all forty source questions in order, retaining full text and source citations', () => {
    const raw=readFileSync(policyPack.sourceFile,'utf8')
    expect(createHash('sha256').update(raw).digest('hex')).toBe(policyPack.sourceHash)
    const headings=[...raw.matchAll(/^## (\d{3})　(.+)$/gm)]
    expect(headings).toHaveLength(40);expect(policyPack.points).toHaveLength(40)
    for (const [i,h] of headings.entries()) {
      const p=policyPack.points[i]
      expect(p.title).toBe(`${h[1]}　${h[2]}`);expect(p.sourceOrder).toBe(i+1)
      expect(raw).toContain(p.rawSourceContent)
      const tail=raw.slice(h.index!+h[0].length), end=tail.search(/^#{1,2} /m)
      expect(p.content).toBe((end<0?tail:tail.slice(0,end)).trim())
      expect(p.checklist.length).toBeGreaterThan(0)
      expect(generalRubric(p).every(r => r.reference.trim().length > 0)).toBe(true)
      expect(generalRubric(p).every(r=>!r.reference.includes('记忆提示：')&&!r.reference.includes('原总册第'))).toBe(true)
    }
  })
  it('installs 73 physiology and 40 overview questions once with no inherited grades', () => {
    const data=installBuiltInTextbooks(emptyGeneral(),now)
    expect(data.points).toHaveLength(113)
    expect(installBuiltInTextbooks(data,now+100)).toBe(data)
    const candidates=allCandidates({...defaultFusion(now),general:data},defaultPersisted(),now).filter(c=>c.module==='general')
    expect(candidates).toHaveLength(113)
    expect(candidates.filter(c=>c.subject==='体育概论')[0].itemId).toBe(policyPack.points[0].id)
    expect(data.points.every(p=>p.totalReviews===0&&!p.trainingBlocked)).toBe(true)
  })
  it('archives old built-ins without overwriting dates, grades, notes, checklist, leaks or logs', () => {
    let old=oldData();old=reviewGeneral(old,old.points[0].id,3,[],'old-review',now) as typeof old
    old.points[0].privateNote='原笔记'; const before=structuredClone(old)
    const next=installBuiltInTextbooks(old,now+100)
    expect(old).toEqual(before);expect(next.logs).toEqual(before.logs)
    for(const p of before.points) {
      const updated=next.points.find(n=>n.id===p.id)!
      const { trainingBlocked: _blocked, referenceReason: _reason, ...originalFields } = p
      expect(updated).toMatchObject(originalFields)
      expect(updated.trainingBlocked).toBe(true)
      expect(updated.retiredTextbook).toBeTruthy()
    }
    expect((next.textbookReplacementArchive as {points:GeneralPoint[]}[])[0].points).toEqual(before.points)
    const candidates=allCandidates({...defaultFusion(now),general:next},defaultPersisted(),now)
    expect(candidates.some(c=>before.points.some(p=>p.id===c.itemId))).toBe(false)
    expect(installBuiltInTextbooks(next,now+200)).toBe(next)
  })
  it('lets an active old answer finish against its unchanged old source, without training the replacement', () => {
    const old=oldData(), point=old.points[0]
    const next=installBuiltInTextbooks(old,now,point.id)
    expect(next.points.find(p=>p.id===point.id)!.content).toBe(point.content)
    const done=reviewGeneral(next,point.id,3,point.checklist!,'finished-old',now+1000)
    expect(done.logs.at(-1)!.pointId).toBe(point.id)
    expect(done.points.find(p=>p.id===point.id)!.totalReviews).toBe(1)
    expect(done.points.filter(p=>p.sourcePackId===physiologyPack.packId).every(p=>p.totalReviews===0)).toBe(true)
    expect(installBuiltInTextbooks(done,now+2000)).toBe(done)
  })
  it('preserves independent material and later local edits; old imports cannot re-enable retired tasks', () => {
    const original=oldData();original.points[0].sourcePackId='custom'
    const installed=installBuiltInTextbooks(original,now)
    expect(installed.points[0]).toBe(original.points[0])
    const fresh=installed.points.find(p=>p.sourcePackId===policyPack.packId)!;fresh.content='我的本地修订'
    expect(installBuiltInTextbooks(installed,now+100)).toBe(installed)
    const reimported={...installed,points:installed.points.map(p=>p.id===oldPolicy.points[0].id?oldPolicy.points[0] as GeneralPoint:p)}
    expect(installBuiltInTextbooks(reimported,now+200).points.find(p=>p.id===oldPolicy.points[0].id)!.trainingBlocked).toBe(true)
  })
  it('releases retired policy chapter and practice scopes without clearing completed budget', () => {
    const state=defaultFusion(now);state.general=installBuiltInTextbooks(oldData(),now)
    state.day.selectedChapters['体育概论']=[`体育概论::${oldPolicy.points[0].quotaChapterOverride}`]
    state.day.practice={module:'general',kind:'item',title:'旧题',itemIds:[oldPolicy.points[0].id]}
    const next=lockChapters(retireUnavailableMrc(state),defaultPersisted(),now)
    expect(next.day.practice).toBeUndefined()
    expect(next.day.selectedChapters['体育概论']).not.toEqual(state.day.selectedChapters['体育概论'])
    expect(next.day.tasks).toEqual(state.day.tasks);expect(next.day.budgetMinutes).toBe(state.day.budgetMinutes)
  })
  it('roundtrips new standalone textbooks without resetting personal progress', () => {
    const state=defaultFusion(now);state.general=installBuiltInTextbooks(emptyGeneral(),now)
    const p=policyPack.points[0];state.general=reviewGeneral(state.general,p.id,3,p.checklist,'new-record',now)
    const imported=inspectFusionImport(readFileSync('346_Sports_Policy_Import.json','utf8'),state,defaultPersisted())
    expect(imported.platform).toEqual(state)
  })
})

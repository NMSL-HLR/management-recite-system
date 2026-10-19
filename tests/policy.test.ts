import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { policyPack, installBuiltInTextbooks } from '../src/general/textbook'
import { emptyGeneral, reviewGeneral } from '../src/general/data'
import { allCandidates, defaultFusion } from '../src/fusion/planner'
import { defaultPersisted } from '../src/state/defaults'
import { inspectFusionImport } from '../src/fusion/transfer'
import { createPoint } from '../src/general/scheduler'
const now = new Date(2026, 9, 19, 12).getTime()
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
function oldEdition() {
  const text = readFileSync('sources/policy/政策热点班_第一至第五讲_一点一两句背诵版.md','utf8')
  const headers = [...text.matchAll(/^(#{2,4}) (.+)$/gm)]
  let chapter = ''
  const points = headers.flatMap((h, i) => {
    if (h[1] === '##' && /^第.+讲｜/.test(h[2])) chapter = h[2]
    if (h[1] !== '####' && !(h[1] === '###' && h[2].startsWith('B｜'))) return []
    const content = text.slice(h.index!+h[0].length,headers[i+1]?.index??text.length).trim()
    return [{ ...createPoint({subject:'体育概论',title:h[2],content,tags:[],checklist:[]},now),
      id:`policy-${sha(`${policyPack.packId}\n${chapter}\n${h[2]}`).slice(0,24)}`, sourcePackId:policyPack.packId, sourceHash:sha(text), trainingBlocked:h[1]==='###' }]
  })
  return {...emptyGeneral(),points,installedTextbooks:[policyPack.packId]}
}
describe('six-lecture policy replacement', () => {
  it('retains the exact uploaded source and every one of the 664 numbered blocks', () => {
    const raw=readFileSync(policyPack.sourceFile), text=raw.toString().replace(/\r\n?/g,'\n')
    expect(sha(raw)).toBe(policyPack.sourceHash)
    const original=[...text.matchAll(/^> (\*\*\d+\..+)$/gm)].map(m=>m[1].replace(/\*\*/g,'').trim()).sort()
    const extracted=[policyPack.preface,...policyPack.points.map(p=>p.content)].flatMap(t=>t.split('\n').filter(l=>/^\d+\. /.test(l))).sort()
    expect(original).toHaveLength(664); expect(extracted).toEqual(original)
    expect(policyPack.points).toHaveLength(26)
    expect(policyPack.points.filter(p=>!p.trainingBlocked)).toHaveLength(18)
    expect(new Set(policyPack.points.map(p=>p.id)).size).toBe(26)
    for(const p of policyPack.points) expect(text).toContain(p.rawSourceContent)
  })
  it('keeps all 20 existing IDs and assigns new ones only for new material', () => {
    const old=oldEdition(); expect(old.points).toHaveLength(20)
    for(const p of old.points) expect(policyPack.points.some(n=>n.id===p.id)).toBe(true)
    expect(policyPack.points.filter(p=>p.quotaChapterOverride.startsWith('第六讲'))).toHaveLength(4)
  })
  it('installs once and only schedules the 18 homework questions', () => {
    const general=installBuiltInTextbooks(emptyGeneral(),now)
    expect(general.points).toHaveLength(86)
    expect(installBuiltInTextbooks(general,now+100)).toBe(general)
    const candidates=allCandidates({...defaultFusion(now),general},defaultPersisted(),now).filter(p=>p.subject==='体育概论')
    expect(candidates).toHaveLength(18); expect(candidates[0].itemId).toBe(policyPack.points[0].id)
  })
  it('directly replaces the prior edition but preserves grades, due dates, notes, leaks and original source snapshots', () => {
    let old=reviewGeneral(oldEdition(),policyPack.points[0].id,3,[],'old-review',now)
    old.points[0]={...old.points[0], privateNote:'保留私人批注',leaks:[{label:'旧遗漏项',due:now-1000}]}
    const before=structuredClone(old), updated=installBuiltInTextbooks(old,now+100)
    const current=updated.points.find(p=>p.id===before.points[0].id)!
    expect(current.content).toBe(policyPack.points[0].content)
    for(const key of ['dueDate','lastReviewedAt','stability','difficulty','totalReviews','privateNote']) expect(current[key]).toEqual(before.points[0][key])
    expect(current.policyLegacyLeaks).toEqual(before.points[0].leaks); expect(current.leaks).toEqual([])
    expect(updated.logs).toEqual(before.logs); expect(old).toEqual(before)
    expect((updated.policyReplacementArchive as any[])[0].points).toEqual(before.points)
    expect(installBuiltInTextbooks(updated,now+200)).toBe(updated)
  })
  it('defers only the active question until its draft has finished, without duplicate archival', () => {
    const old=oldEdition(), id=old.points[0].id
    const partial=installBuiltInTextbooks(old,now,id)
    expect(partial.points.find(p=>p.id===id)!.content).toBe(old.points[0].content)
    expect(partial.policySourceRevision).toBeUndefined()
    const again=installBuiltInTextbooks(partial,now+100,id)
    expect(again.policyReplacementArchive).toEqual(partial.policyReplacementArchive)
    const done=installBuiltInTextbooks(again,now+200)
    expect(done.points.find(p=>p.id===id)!.content).toBe(policyPack.points[0].content)
    expect((done.policyReplacementArchive as any[]).flatMap(a=>a.points)).toHaveLength(20)
    expect(done.policySourceRevision).toBe(policyPack.revision)
  })
  it('does not overwrite later personal edits or independent custom material', () => {
    const updated=installBuiltInTextbooks(oldEdition(),now)
    updated.points[0].content='更新后我的自定义内容'
    expect(installBuiltInTextbooks(updated,now+100)).toBe(updated)
    const unrelated=oldEdition(); unrelated.points[0].sourcePackId='custom'
    expect(installBuiltInTextbooks(unrelated,now).points[0]).toEqual(unrelated.points[0])
  })
  it('repeated import preserves learning records, and new textbook includes reference blocks', () => {
    const s=defaultFusion(now);s.general=installBuiltInTextbooks(emptyGeneral(),now)
    const first=policyPack.points[0]
    s.general=reviewGeneral(s.general,first.id,3,first.checklist,'policy-result',now)
    const file=readFileSync('346_Sports_Policy_Import.json','utf8')
    expect(inspectFusionImport(file,s,defaultPersisted()).platform).toEqual(s)
    const fresh=inspectFusionImport(file,defaultFusion(now),defaultPersisted())
    expect(fresh.platform.general.points).toHaveLength(26)
    expect(fresh.platform.general.points.filter(p=>p.trainingBlocked)).toHaveLength(8)
  })
})

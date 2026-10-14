import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { policyPack, installBuiltInTextbooks } from '../src/general/textbook'
import { emptyGeneral, reviewGeneral } from '../src/general/data'
import { allCandidates, defaultFusion } from '../src/fusion/planner'
import { defaultPersisted } from '../src/state/defaults'
import { inspectFusionImport } from '../src/fusion/transfer'
const now = new Date(2026, 9, 14, 12).getTime()
describe('sports policy textbook', () => {
  it('preserves source hash and every full body, with 15 questions and 5 reference outlines', () => {
    const raw=readFileSync('sources/policy/政策热点班_第一至第五讲_一点一两句背诵版.md')
    expect(createHash('sha256').update(raw).digest('hex')).toBe(policyPack.sourceHash)
    const text=raw.toString().replace(/\r\n?/g,'\n')
    const headings=[...text.matchAll(/^(#{2,4}) (.+)$/gm)]
    const selected=headings.filter(h=>h[1]==='####'||(h[1]==='###'&&h[2].startsWith('B｜')))
    expect(policyPack.points).toHaveLength(20)
    selected.forEach((h,i)=>{ const next=headings[headings.indexOf(h)+1]; expect(policyPack.points[i].content).toBe(text.slice(h.index!+h[0].length,next?.index??text.length).trim()) })
    expect(policyPack.points.filter(p=>!p.trainingBlocked)).toHaveLength(15)
    expect(policyPack.points[19].content).toContain('最后只记这5条边界')
    expect(new Set(policyPack.points.map(p=>p.id)).size).toBe(20)
  })
  it('installs both textbooks once and excludes the reference outlines from automatic training', () => {
    const general=installBuiltInTextbooks(emptyGeneral(),now)
    expect(general.points).toHaveLength(80)
    expect(installBuiltInTextbooks(general,now+100)).toBe(general)
    const candidates=allCandidates({...defaultFusion(now),general},defaultPersisted(),now).filter(p=>p.subject==='体育概论')
    expect(candidates).toHaveLength(15)
    expect(candidates[0].itemId).toBe(policyPack.points[0].id)
  })
  it('repeated import preserves grades, drafts, budget and all existing records', () => {
    const s=defaultFusion(now);s.general=installBuiltInTextbooks(emptyGeneral(),now)
    const first=policyPack.points[0]
    s.general=reviewGeneral(s.general,first.id,3,first.checklist,'policy-result',now)
    const file=readFileSync('346_Sports_Policy_Import.json','utf8')
    const imported=inspectFusionImport(file,s,defaultPersisted())
    expect(imported.platform).toEqual(s)
    const fresh=inspectFusionImport(file,defaultFusion(now),defaultPersisted())
    expect(fresh.platform.general.points).toHaveLength(20)
    expect(fresh.platform.general.points.filter(p=>p.trainingBlocked)).toHaveLength(5)
  })
})

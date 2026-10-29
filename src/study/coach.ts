import { content } from '../content'
import { mrcRubric, generalRubric } from '../review/rubric'
import { latestAttempts } from '../coach/candidates'
import type { CoachPersisted } from '../coach/types'
import type { Candidate, FusionState, TrainingTask, GeneralPoint } from '../fusion/types'
import type { Activity, StudyConfig, StudyState, ScopedSession, ScopedRecord } from './types'
export const isSupplement = (p: GeneralPoint) => /^附录/.test(p.quotaChapterOverride??'')
export const DAY = 86400000
export const studyDate = (n: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(n)
export const defaultConfig: StudyConfig = { budgetKind: 'professional', inputMinutes: 0, protectedMinutes: 90, bufferPercent: 10, newShare: 0.3, deadline: '2026-12-19', retryMinutes: 45, maxDailyTests: 2, fullEveryDays: 7 }
export function netBudget(c: StudyConfig) { return Math.floor(Math.max(0, c.inputMinutes - (c.budgetKind === 'total' ? c.protectedMinutes : 0)) * (1 - c.bufferPercent / 100)) }
export function daysLeft(c: StudyConfig, now: number) { return Math.max(0, Math.round((Date.parse(c.deadline + 'T00:00:00+08:00') - Date.parse(studyDate(now) + 'T00:00:00+08:00')) / DAY)) }
export function newStudy(config: StudyConfig): StudyState { return { version: 1, config, declarations: {}, records: [], session: null, time: {}, exams: [] } }
export function key(module: string, id: string) { return `${module}:${id}` }
const rubricCache = new WeakMap<object, ReturnType<typeof mrcRubric>>()
export function rubric(state: FusionState, module: string, id: string) {
  const item = content.items.find(i => i.id === id)
  const point = state.general.points.find(p => p.id === id)
  const source=module==='mrc'?item:point
  if(!source)return []
  const cached=rubricCache.get(source);if(cached)return cached
  const result=(module==='mrc'?mrcRubric(item!):generalRubric(point!)).filter(p=>p.role!=='reference')
  rubricCache.set(source,result);return result
}
// Deterministic text identity; NOT an expert review or a replacement for textbook sourceHash.
export function fingerprint(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16) }
export function sourceFingerprint(state: FusionState, module: string, id: string) { return fingerprint(JSON.stringify([rubric(state,module,id),module==='mrc'?content.items.find(i=>i.id===id)?.originalMarkdown:state.general.points.find(p=>p.id===id)?.content])) }
export function matchingRecords(state: FusionState, module: string, id: string) {
  const fp = sourceFingerprint(state, module, id)
  return (state.study?.records ?? []).filter(r => r.itemId === id && r.module === module && r.sourceFingerprint === fp).sort((a,b) => a.finishedAt - b.finishedAt)
}
export function pointEvidence(records: ScopedRecord[]) {
  const result: Record<string,'pass'|'miss'>={}
  for(const r of records) for(const [id,outcome] of Object.entries(r.outcomes)) if(outcome!=='untested') result[id]=outcome
  return result
}
export function lastExposure(state: FusionState, mrc: CoachPersisted, module: string, id: string) {
  return Math.max(0, ...matchingRecords(state,module,id).map(r => r.finishedAt), ...(module === 'mrc' ? mrc.attempts.filter(a => a.itemId === id).map(a => a.finishedAt) : [...state.general.logs,...state.general.logsArchive].filter(l => l.pointId === id).map(l => l.reviewedAt)), state.study?.declarations[key(module,id)] ?? 0, module==='general' ? state.general.points.find(p=>p.id===id)?.lastReviewedAt??0 : 0)
}
export function estimate(state: FusionState, subject: string, activity: Activity, fallback: number) {
  const samples = Object.values(state.study?.time ?? {}).filter(t => t.confirmed && t.subject === subject && t.activity === activity && t.seconds > 0).slice(-12).map(t => t.seconds / 60).sort((a,b)=>a-b)
  if (samples.length < 3) return fallback
  // Upper median; never infer speed from a tab's historical wall-clock duration.
  return Math.max(5, Math.min(120, Math.ceil(samples[Math.floor(samples.length * 0.65)])))
}
export function adaptCandidates(state: FusionState, mrc: CoachPersisted, raw: Candidate[], now: number): Candidate[] {
  if (!state.study) return raw
  const gaps=new Map(coverage(state,mrc,now).map(r=>[r.subject,r.total?r.uncovered/r.total:0]))
  const all = [...raw]
  // Full validation has its own explicit deadline, not a rewrite of engine due dates.
  const latest = latestAttempts(mrc.attempts)
  for (const i of content.items.filter(i => i.kind !== 'reference' && i.coreA)) if (!all.some(c=>c.module==='mrc'&&c.itemId===i.id)) {
    const a = latest.get(i.id)
    if (a) all.push({ module:'mrc', itemId:i.id, subject:'体育管理学',title:i.title,chapterKey:`mrc::${i.chapterId}`,isNew:false,reason:'整题验证检查',estimatedMinutes:15,dueAt:a.dueAt??now,tier:0 })
  }
  for (const p of state.general.points.filter(p=>!p.trainingBlocked && p.subject!=='体育管理学' && (p.totalReviews>0 || state.study!.declarations[key('general',p.id)]))) if (!all.some(c=>c.module==='general'&&c.itemId===p.id)) all.push({module:'general',itemId:p.id,subject:p.subject,title:p.title,supplement:isSupplement(p),chapterKey:`${p.subject}::${p.quotaChapterOverride??p.id}`,isNew:false,reason:'验证检查',estimatedMinutes:15,dueAt:p.dueDate,tier:0})
  return all.flatMap(c => {
    const records = matchingRecords(state,c.module,c.itemId), last = records.at(-1)
    const exposure = lastExposure(state,mrc,c.module,c.itemId)
    const declared = state.study!.declarations[key(c.module,c.itemId)]
    const touched = !c.isNew || Boolean(declared) || records.length>0
    const full = records.filter(r=>r.complete).at(-1)
    const fullDue = (full?.finishedAt ?? exposure) + (full ? state.study!.config.fullEveryDays : 1) * DAY
    const end = Date.parse(state.study!.config.deadline+'T00:00:00+08:00')
    // Spread final checks across the last 7 days by stable ID, never cram all into the last day.
    const finalSlot = end - (1 + parseInt(fingerprint(c.itemId),16)%7)*DAY
    const due = !touched ? now : Math.min(last?.nextAt ?? (declared && c.isNew ? now : c.dueAt), fullDue, full && full.finishedAt>=finalSlot ? Infinity : finalSlot)
    const todays = [...records.map(r=>r.finishedAt), ...(c.module==='mrc'?mrc.attempts.filter(a=>a.itemId===c.itemId).map(a=>a.finishedAt):[...state.general.logs,...state.general.logsArchive].filter(l=>l.pointId===c.itemId).map(l=>l.reviewedAt))].filter(n=>studyDate(n)===studyDate(now))
    if (todays.length>=state.study!.config.maxDailyTests || (exposure && now-exposure<state.study!.config.retryMinutes*60000) || due>now) return []
    const activity: Activity = !touched ? 'recovery' : !last || fullDue<=now || (finalSlot<=now && (!full||full.finishedAt<finalSlot)) ? 'full' : 'short'
    const important = /【A】/.test(c.title) || content.items.find(i=>i.id===c.itemId)?.sourceSignals.some(s=>s.type==='actual_exam'||s.type==='teacher_must')
    const failed = Object.values(pointEvidence(records)).includes('miss')
    return [{...c,isNew:!touched,activity, tier: touched ? 0 : 1, dueAt:due,
      priority: (!touched?(c.supplement?-1:(gaps.get(c.subject)??0)*100):0)+(important?2:0)+(failed?3:0)+Math.min(10,Math.max(0,(now-due)/DAY)),
      estimatedMinutes:estimate(state,c.subject,activity,activity==='short'?(c.subject==='运动生理学'?12:8):c.estimatedMinutes),
      reason:activity==='recovery'?'尚无本版测试证据。先尝试提取，再按需恢复。':activity==='full'?'整题尚未验证、验证已到期或进入考前窗口；闭卷检查全题，不用短测代替。':'局部复测：轮换正常点并复查错漏；只记录本次实际测试范围。'}]
  })
}
export function makeSession(state: FusionState, task: TrainingTask): ScopedSession {
  const points = rubric(state,task.module,task.itemId)
  const records = matchingRecords(state,task.module,task.itemId)
  const evidence = pointEvidence(records)
  const lastSeen = (id: string) => Math.max(0,...records.filter(r=>r.outcomes[id] && r.outcomes[id]!=='untested').map(r=>r.finishedAt))
  const sorted = [...(task.activity==='short'?points.filter(p=>p.role!=='heading'):points)].sort((a,b)=>lastSeen(a.id)-lastSeen(b.id)||a.id.localeCompare(b.id))
  const misses = sorted.filter(p=>evidence[p.id]==='miss')
  const sports = sorted.filter(p=>p.role==='sports')
  const picked = task.activity==='short' ? [...new Map([sorted[0],misses[0]??sorted[1],sports[0]??sorted[2]].filter(Boolean).map(p=>[p.id,p])).values()] : points
  return { taskId:task.id,itemId:task.itemId,module:task.module,activity:task.activity==='short'?'short':'full',scope:picked,allPointIds:points.map(p=>p.id),sourceFingerprint:sourceFingerprint(state,task.module,task.itemId),phase:'draft',draft:'',frozenDraft:null,hinted:false,outcomes:Object.fromEntries(picked.map(p=>[p.id,'untested'])),paper:false,structure:false,written:false,startedAt:task.startedAt }
}
export function saveScoped(state: FusionState, mrc: CoachPersisted, now: number): ScopedRecord | null {
  const s=state.study?.session
  if (!s || s.phase!=='compare' || state.study!.records.some(r=>r.id===s.taskId)) return null
  const previous=lastExposure(state,mrc,s.module,s.itemId)
  const delayed=previous>0 && now-previous>=DAY
  const allPass=s.scope.length>0&&s.scope.every(p=>s.outcomes[p.id]==='pass')
  const complete=s.activity==='full'&&s.scope.length===s.allPointIds.length&&allPass&&!s.hinted&&s.structure&&s.written&&delayed&&(Boolean(s.frozenDraft?.trim())||s.paper)
  const accumulated=pointEvidence([...matchingRecords(state,s.module,s.itemId),{...s} as ScopedRecord])
  const nextAt=now+(allPass&&!s.hinted&&!Object.values(accumulated).includes('miss')?(complete?3*DAY:DAY):state.study!.config.retryMinutes*60000)
  return {...s,scope:s.scope.map(p=>({...p,reference:''})),id:s.taskId,phase:'done',finishedAt:now,delayed,complete,nextAt}
}
export function coverage(state: FusionState,mrc:CoachPersisted,now:number) {
  const items=[...content.items.filter(i=>i.kind!=='reference'&&i.coreA).map(i=>({module:'mrc',id:i.id,subject:'体育管理学'})),...state.general.points.filter(p=>!p.trainingBlocked&&!isSupplement(p)&&p.subject!=='体育管理学').map(p=>({module:'general',id:p.id,subject:p.subject}))]
  return [...new Set(items.map(i=>i.subject))].map(subject=>{
    const rows=items.filter(i=>i.subject===subject).map(i=>{const rs=matchingRecords(state,i.module,i.id),r=rs.at(-1),full=rs.filter(x=>x.complete).at(-1),legacy=i.module==='mrc'?mrc.attempts.filter(a=>a.itemId===i.id).at(-1):null,general=i.module==='general'?state.general.points.find(p=>p.id===i.id):null,e=lastExposure(state,mrc,i.module,i.id);return {uncovered:!e&&!general?.totalReviews&&!legacy,declared:Boolean(state.study?.declarations[key(i.module,i.id)]),verified:Boolean(full && now-full.finishedAt<= (state.study?.config.fullEveryDays??7)*DAY && !rs.some(x=>x.finishedAt>full.finishedAt&&(x.hinted||Object.values(x.outcomes).includes('miss')))),repair:Boolean(r?(r.hinted||Object.values(pointEvidence(rs)).includes('miss')):(legacy&&['cue_dependent','relearned'].includes(legacy.evidenceState))||(general&&['relearning','learning'].includes(general.state)&&general.totalReviews>0)),independent:Boolean(r&&!r.hinted&&r.scope.some(p=>p.role!=='heading'&&r.outcomes[p.id]==='pass'))}})
    return {subject,total:rows.length,uncovered:rows.filter(r=>r.uncovered).length,declared:rows.filter(r=>r.declared).length,verified:rows.filter(r=>r.verified).length,repair:rows.filter(r=>r.repair).length,scopedIndependent:rows.filter(r=>r.independent).length,unverified:rows.filter(r=>!r.verified).length}
  })
}

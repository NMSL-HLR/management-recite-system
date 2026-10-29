import type { StudyState } from './types'
const obj=(x:unknown):x is Record<string,any>=>Boolean(x&&typeof x==='object'&&!Array.isArray(x))
const number=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max
const strings=(x:unknown):x is string[]=>Array.isArray(x)&&x.every(v=>typeof v==='string')&&new Set(x).size===x.length
export function validateStudy(x: unknown): asserts x is StudyState {
 const fail=()=>{throw new Error('教练扩展数据不完整或版本未知，原数据保留；请恢复有效整包。')}
 if(!obj(x)||x.version!==1||!obj(x.config)||!obj(x.declarations)||!Array.isArray(x.records)||!obj(x.time)||!Array.isArray(x.exams)) return fail()
 if(x.sources!==undefined && (!obj(x.sources)||Object.values(x.sources).some(ps=>!Array.isArray(ps)||ps.some(p=>!obj(p)||typeof p.id!=='string'||typeof p.reference!=='string')))) return fail()
 const c=x.config
 if(!['total','professional'].includes(c.budgetKind)||!number(c.inputMinutes,0,690)||!number(c.protectedMinutes,60,90)||!number(c.bufferPercent,0,20)||!number(c.newShare,0.1,0.6)||!/^\d{4}-\d{2}-\d{2}$/.test(c.deadline)||!Number.isFinite(Date.parse(c.deadline))||new Date(c.deadline).toISOString().slice(0,10)!==c.deadline||!number(c.retryMinutes,20,180)||!number(c.maxDailyTests,1,3)||!Number.isInteger(c.maxDailyTests)||!number(c.fullEveryDays,1,14)) return fail()
 if(Object.values(x.declarations).some(v=>!number(v))) return fail()
 const validSession=(s:any)=>obj(s)&&typeof s.taskId==='string'&&typeof s.itemId==='string'&&['mrc','general'].includes(s.module)&&['short','full'].includes(s.activity)&&['draft','compare','done'].includes(s.phase)&&typeof s.draft==='string'&&(s.phase==='draft'?s.frozenDraft===null:typeof s.frozenDraft==='string')&&typeof s.sourceFingerprint==='string'&&number(s.startedAt)&&['hinted','paper','structure','written'].every(k=>typeof s[k]==='boolean')&&strings(s.allPointIds)&&Array.isArray(s.scope)&&s.scope.length>0&&new Set(s.scope.map((p:any)=>p.id)).size===s.scope.length&&s.scope.every((p:any)=>obj(p)&&typeof p.id==='string'&&s.allPointIds.includes(p.id)&&['label','reference','source','group','role'].every(k=>typeof p[k]==='string'))&&obj(s.outcomes)&&Object.keys(s.outcomes).length===s.scope.length&&s.scope.every((p:any)=>['pass','miss','untested'].includes(s.outcomes[p.id]))
 if(x.session!==null&&!validSession(x.session)) return fail()
 if(x.records.some(r=>!x.sources?.[r.sourceFingerprint] && !r.scope?.every((p:any)=>p.reference))) return fail()
 if(x.records.some(r=>!validSession(r)||r.phase!=='done'||r.id!==r.taskId||!number(r.finishedAt)||r.finishedAt<r.startedAt||!number(r.nextAt)||typeof r.delayed!=='boolean'||typeof r.complete!=='boolean'||(r.complete&&(!r.delayed||r.hinted||r.activity!=='full'||!r.structure||!r.written||r.scope.length!==r.allPointIds.length||Object.values(r.outcomes).some(v=>v!=='pass'))))||new Set(x.records.map(r=>r.id)).size!==x.records.length) return fail()
 if(Object.values(x.time).some(t=>!obj(t)||typeof t.subject!=='string'||!['recovery','short','full','exam'].includes(t.activity)||!number(t.seconds)||!obj(t.days)||Object.values(t.days).some(v=>!number(v))||typeof t.paused!=='boolean'||typeof t.confirmed!=='boolean'||(t.lastTick!==null&&!number(t.lastTick)))) return fail()
 if(x.exams.some(e=>!obj(e)||typeof e.id!=='string'||!number(e.startedAt)||!number(e.reserved)||!obj(e.snapshot)||(e.charges!==undefined&&(!obj(e.charges)||Object.values(e.charges).some(v=>!number(v))))||(e.finishedAt!==undefined&&!number(e.finishedAt)))) return fail()
}

import type { FusionState } from '../fusion/types'
import { studyDate } from './coach'
export function tickStudy(state: FusionState, now: number, running: boolean): FusionState {
 const task=state.active, study=state.study
 if(!study||!task||task.status!=='in_progress') return state
 const old=study.time[task.id]??{subject:task.subject,activity:task.activity??'recovery',seconds:0,days:{},paused:false,lastTick:null,confirmed:false}
 const elapsed=old.lastTick!==null&&!old.paused ? Math.max(0,(now-old.lastTick)/1000):0
 // A suspended browser never contributes a long hidden interval.
 const delta=elapsed<=15?elapsed:0
 const date=studyDate(now),previousDate=studyDate(now-delta*1000)
 const days={...old.days}
 if(previousDate===date) days[date]=(days[date]??0)+delta
 else { const midnight=Date.parse(date+'T00:00:00+08:00'); const today=(now-midnight)/1000; days[date]=(days[date]??0)+today; days[previousDate]=(days[previousDate]??0)+delta-today }
 const seconds=old.seconds+delta
 const time={...old,seconds,days,paused:!running,lastTick:running?now:null}
 const prior=(seconds-(days[date]??0))/60
 const chargedMinutes=Math.max(days[date]??0,Math.max(0,task.estimatedMinutes-prior)*60)/60
 const active={...task,chargedMinutes}
 return {...state,active,day:{...state.day,tasks:state.day.tasks.map(t=>t.id===task.id?active:t)},study:{...study,time:{...study.time,[task.id]:time}}}
}
export function confirmTime(state:FusionState, minutes:number, now:number):FusionState {
 const task=state.active,study=state.study
 if(!study||!task||task.status!=='completed'||!Number.isFinite(minutes)||minutes<=0||minutes>600) return state
 const old=study.time[task.id]
 if(!old) return state
 const date=studyDate(now),previousSeconds=old.seconds-(old.days[date]??0)
 if(minutes*60<previousSeconds) return state
 const days={...old.days,[date]:minutes*60-previousSeconds}
 const time={...old,seconds:minutes*60,days,confirmed:true,paused:true,lastTick:null}
 const active={...task,chargedMinutes:days[date]/60}
 return {...state,active,day:{...state.day,tasks:state.day.tasks.map(t=>t.id===task.id?active:t)},study:{...study,time:{...study.time,[task.id]:time}}}
}

/** Original exam countdown is unchanged. This ledger observes only active foreground work. */
export function tickExam(state:FusionState, id:string, now:number, running:boolean):FusionState {
 const study=state.study,exam=study?.exams.find(e=>e.id===id)
 if(!study||!exam||exam.finishedAt)return state
 const old=study.time[id]??{subject:'体育管理学',activity:'exam' as const,seconds:0,days:{},paused:false,lastTick:null,confirmed:false}
 const elapsed=old.lastTick!==null&&!old.paused?Math.max(0,(now-old.lastTick)/1000):0,delta=elapsed<=15?elapsed:0,date=studyDate(now)
 const days={...old.days,[date]:(old.days[date]??0)+delta},seconds=old.seconds+delta
 const cost=Math.max(days[date]/60,exam.reserved-(seconds-days[date])/60)
 const charges={...exam.charges,[date]:cost}
 return {...state,day:{...state.day,examMinutes:Math.max(0,(state.day.examMinutes??0)-(exam.charges?.[date]??0))+cost},study:{...study,exams:study.exams.map(e=>e.id===id?{...e,charges}:e),time:{...study.time,[id]:{...old,seconds,days,paused:!running,lastTick:running?now:null}}}}
}
export function confirmExamTime(state:FusionState,id:string,minutes:number,now:number):FusionState {
 const study=state.study,exam=study?.exams.find(e=>e.id===id),old=study?.time[id]
 if(!study||!exam?.finishedAt||!old||!Number.isFinite(minutes)||minutes<=0||minutes>600)return state
 const date=studyDate(now),prior=old.seconds-(old.days[date]??0)
 if(minutes*60<prior)return state
 const today=minutes-prior/60
 return {...state,day:{...state.day,examMinutes:Math.max(0,(state.day.examMinutes??0)-(exam.charges?.[date]??0))+today},study:{...study,exams:study.exams.map(e=>e.id===id?{...e,charges:{...e.charges,[date]:today}}:e),time:{...study.time,[id]:{...old,seconds:minutes*60,days:{...old.days,[date]:today*60},confirmed:true,paused:true,lastTick:null}}}}
}

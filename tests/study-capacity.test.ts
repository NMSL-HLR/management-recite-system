import {it,expect} from 'vitest'
import {writeFileSync} from 'node:fs'
import {content} from '../src/content'
import {defaultPersisted} from '../src/state/defaults'
import {installBuiltInTextbooks} from '../src/general/textbook'
import {reviewGeneral} from '../src/general/data'
import {commitAttempt,startRecall} from '../src/engine/recall'
import {defaultFusion,lockChapters,decide,beginTask,finishTask,rollDay,remaining,spent} from '../src/fusion/planner'
import {newStudy,defaultConfig,netBudget,DAY,studyDate,saveScoped,coverage} from '../src/study/coach'
import {tickStudy,confirmTime} from '../src/study/time'
it('runs capacity scenarios with mixed failures, overruns, overdue backlogs and deadline pressure',()=>{
 const base=Date.parse('2026-10-29T10:00:00+08:00')
 const scenarios=[]
 for(const config of [{minutes:5,fail:0.3,days:51,overdue:false},{minutes:60,fail:0.3,days:51,overdue:false},{minutes:120,fail:0.3,days:51,overdue:false},{minutes:240,fail:0.3,days:51,overdue:false},{minutes:120,fail:0.7,days:51,overdue:true},{minutes:180,fail:0.4,days:3,overdue:true}]){
  let m=defaultPersisted(),s=defaultFusion(base);s.general=installBuiltInTextbooks(s.general,base);s.study=newStudy({...defaultConfig,inputMinutes:config.minutes});s.day.budgetMinutes=netBudget(s.study.config);s.day.date=studyDate(base)
  const start=base+(51-config.days)*DAY
  if(config.overdue) for(const p of s.general.points){p.totalReviews=2;p.lastReviewedAt=start-10*DAY;p.dueDate=start-5*DAY}
  let total=0,overruns=0,stops=0,seed=1701,minutes=0
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  for(let d=0;d<config.days;d++){
   let now=start+d*DAY;s=lockChapters(rollDay(s,now),m,now)
   for(let guard=0;guard<60;guard++){
    const decision=decide(s,m,now)
    if(decision.kind!=='next'){stops++;break}
    const c=decision.candidate;expect(c.estimatedMinutes).toBeLessThanOrEqual(remaining(s))
    s=tickStudy(beginTask(s,c,now),now,true);const fail=rand()<config.fail,actual=Math.ceil((c.activity==='short'?(c.subject==='运动生理学'?12:8):15)*(fail?1.4:1));now+=actual*60000
    const id=s.active!.id
    if(c.activity==='short'||c.activity==='full'){
     const session=s.study!.session!;s.study!.session={...session,phase:'compare',frozenDraft:'SIMULATION ONLY',structure:true,written:true,outcomes:Object.fromEntries(session.scope.map((p,i)=>[p.id,fail&&i===0?'miss':'pass']))}
     const r=saveScoped(s,m,now)!;s={...s,study:{...s.study!,session:r,records:[...s.study!.records,r]}};s=finishTask(s,r.id,now)
    }else if(c.module==='general'){
     const p=s.general.points.find(p=>p.id===c.itemId)!;s.general=reviewGeneral(s.general,p.id,fail?1:3,fail?[]:p.checklist??[],id,now,{draft:'SIMULATION ONLY',startedAt:s.active!.startedAt});s=finishTask(s,id,now)
    }else{
     const item=content.items.find(i=>i.id===c.itemId)!,recall={...startRecall(item.id,s.active!.startedAt),phase:'restate' as const,highestHintUsed:fail?'full_answer' as const:'none' as const,checkedPointIds:fail?[]:item.checkPoints.map(p=>p.id),postRevealNoHintPassed:!fail};const a=commitAttempt(recall,item,now,m.settings.gaps,m.attempts);m={...m,attempts:[...m.attempts,a]};s=finishTask(s,a.id,now)
    }
    s=confirmTime(s,actual,now);total++;minutes+=actual;if(spent(s.day)>s.day.budgetMinutes)overruns++
    if(guard===59)throw new Error('unbounded daily loop')
   }
  }
  const rows=coverage(s,m,start+config.days*DAY-1000)
  scenarios.push({...config,netBudget:netBudget(s.study!.config),tasks:total,actualMinutes:minutes,daysStopped:stops,overrunStops:overruns,uncovered:rows.reduce((n,r)=>n+r.uncovered,0),repair:rows.reduce((n,r)=>n+r.repair,0),unverified:rows.reduce((n,r)=>n+r.unverified,0),subjectRows:rows})
 }
 expect(scenarios.every(s=>s.daysStopped===s.days)).toBe(true)
 expect(scenarios[0].tasks).toBe(0)
 writeFileSync('reports/study-capacity.json',JSON.stringify({hypothetical:true,notPersonalMemoryPrediction:true,assumptions:'155正文＋14补充；确认净时间为5/60/120/240/180分钟，仅容量情景不是用户事实；10%单一缓冲；整题基准15分钟、短测生理12/其他8分钟；失败耗时为基准1.4倍，其他为1倍，实际用时不跟随模型估时递增；伪随机固定种子；未模拟知识本身。所有模拟记录只存在测试内存。',uniformIntervalLoad:[7,4,2].map(intervalDays=>({intervalDays,questions:155,minutesPerQuestion:15,averageMinutesPerDay:Math.ceil(155*15/intervalDays)})),scenarios},null,2))
},120000)

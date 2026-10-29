import { allCandidates } from '../fusion/planner'
import { useEffect, useRef, useState } from 'react'
import { useFusion } from '../fusion/store'
import { useApp } from '../state/store'
import { content } from '../content'
import { defaultConfig, netBudget, daysLeft, coverage, key, estimate, isSupplement } from './coach'
import type { StudyConfig } from './types'
import { FusionNext } from '../fusion/views/Next'
export const activityLabel={recovery:'恢复或新学',short:'短复习（局部证据）',full:'完整验收'}
export function BudgetSetup() {
 const f=useFusion(), c=f.state.study?.config
 const [draft,setDraft]=useState<StudyConfig>(c??defaultConfig)
 const [minutes,setMinutes]=useState(c?String(c.inputMinutes):'')
 const valid=minutes.trim()!==''&&Number.isFinite(Number(minutes))&&Number(minutes)>=0&&Number(minutes)<=690
 const config={...draft,inputMinutes:Number(minutes)}
 return <section className="card" aria-label="净学习时间设置"><h2>{c?'调整净学习时间':'先确认今天有多少净学习时间'}</h2>
 <p>不预设240分钟。吃饭、运动和休息不计入；最早通常10:00开始，但程序不假定你会连续学到几点。该输入也作为后续每日默认值；临时有变化时在这里调整。</p>
 <label className="field">时间包含哪些科目<select aria-label="预算类型" value={draft.budgetKind} onChange={e=>setDraft({...draft,budgetKind:e.target.value as StudyConfig['budgetKind']})}><option value="professional">仅346净学习时间（不再扣英政）</option><option value="total">全部净学习时间（先扣英政）</option></select></label>
 <label className="field">净学习分钟<input aria-label="净学习分钟" inputMode="numeric" type="number" min="0" max="690" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
 <p>英政保护{draft.protectedMinutes}分钟{draft.budgetKind==='professional'?'，由你另外保留，不从此输入重复扣除':''}；一次性缓冲{draft.bufferPercent}%。{valid?`可分配给346：${netBudget(config)}分钟。`:''}</p>
 <details><summary>少量调度参数（工程起点，可调整）</summary>
 <label className="field">英政保护分钟<input type="number" min="60" max="90" value={draft.protectedMinutes} onChange={e=>setDraft({...draft,protectedMinutes:Number(e.target.value)})}/></label>
 <label className="field">缓冲百分比<input type="number" min="0" max="20" value={draft.bufferPercent} onChange={e=>setDraft({...draft,bufferPercent:Number(e.target.value)})}/></label>
 <label className="field">新增覆盖时间比例<select value={draft.newShare} onChange={e=>setDraft({...draft,newShare:Number(e.target.value)})}>{[0.2,0.3,0.4,0.5].map(n=><option value={n} key={n}>{n*100}%</option>)}</select></label>
 <p>起点：管理学、体概每日新题各至多2题（可在科目设置调整）；新增覆盖占比上限防止堆积。失败题至少隔{draft.retryMinutes}分钟、每日最多{draft.maxDailyTests}次；完整验收按失败状态、重要性和容量安排，局部练习不推迟完整验收。它们是透明工程规则，不是个人记忆预测。</p></details>
 <button className="btn primary" data-testid="confirm-study-budget" disabled={!valid||netBudget(config)>600||f.blocked} onClick={()=>f.configureStudy(config)}>确认净学习预算</button>
 </section>
}
export function StudySummary() {
 const f=useFusion(),a=useApp(),study=f.state.study
 const [selected,setSelected]=useState<string[]>([])
 const [query,setQuery]=useState('')
 const [forecast,setForecast]=useState('')
 if(!study)return null
 const rows=coverage(f.state,a.state,a.now),days=daysLeft(study.config,a.now)
 const work=rows.reduce((n,r)=>n+r.uncovered*estimate(f.state,r.subject,'recovery',15)+r.unverified*estimate(f.state,r.subject,'full',15)+r.repair*estimate(f.state,r.subject,'short',12),0)
 const capacity=days*netBudget(study.config)
 const choices=[...content.items.filter(i=>i.coreA&&i.kind!=='reference').map(i=>({id:key('mrc',i.id),title:i.title,subject:'体育管理学'})),...f.state.general.points.filter(p=>!p.trainingBlocked&&p.subject!=='体育管理学').map(p=>({id:key('general',p.id),title:p.title,subject:p.subject}))]
 return <section className="card"><h2>距离初试 {days} 天 · 记忆恢复与验证</h2><p>初试开始：{study.config.deadline}。完成任务、清空队列都不等于掌握。</p>
 {rows.map(r=><p key={r.subject}><strong>{r.subject} · 正文{r.total}题</strong><br/>尚无接触记录{r.uncovered} · 已声明学过{r.declared} · 已记录待修复{r.repair}<br/>有范围内独立点证据{r.scopedIndependent} · 已有整题延迟验收证据{r.verified} · 未完整验证{r.unverified}</p>)}<p>另有{f.state.general.points.filter(p=>!p.trainingBlocked&&isSupplement(p)).length}组附录补充，使用同一预算、每日自动新增至多1组，但不计正文配额和分母；可在资料库练习。正文缺口估计不含这些补充的工作量。</p>
 <p className="muted">“尚无记录”不等于你从未学过。旧Attempt/FSRS自评单独保留，不推导历史细点成绩；已学声明不算通过。统计类别有重叠，参考和停用题不计入分母。</p>
 <details><summary>剩余容量与缺口</summary><button className="btn" onClick={()=>{const tasks=new Map<string,number>();for(let d=0;d<7;d++)for(const c of allCandidates(f.state,a.state,a.now+d*86400000))if(!c.isNew)tasks.set(key(c.module,c.itemId),c.estimatedMinutes);const work=[...tasks.values()].reduce((n,m)=>n+m,0),room=Math.floor(netBudget(study.config)*(1-study.config.newShare)*7);setForecast(`未来7天已知复习（短测、完整验收、修复合计）${tasks.size}题，预计${work}分钟；扣除新增覆盖份额后容量约${room}分钟，缺口${Math.max(0,work-room)}分钟。每题仅计已知下一次任务，是负荷下界；未包含完成后再次到期、未来新失败和新增学习，不能据此认定总负荷可承受。`)}}>检查未来7天已知复习负荷</button>{forecast&&<p role="status">{forecast}</p>}<p>负荷预警：若155题每7天整题验收一次、每题15分钟，仅此就需约333分钟/天。新版稳定题间隔至少14或28天，并按当前预算的30%容量延长；失败题和考前验证仍可能超载，预算不足不代表负债消失。已有通过证据不会仅因过了七天被抹去。</p><p>按当前净预算重复安排至考前，约可分配{capacity}分钟。未覆盖恢复＋未完整验证＋当前修复，最低工作估计约{work}分钟；缺口至少{Math.max(0,work-capacity)}分钟。尚未计入之后的新遗忘和所有复测，不能据此承诺能完成。</p><p>样本不足3次时使用保守工程估时。稳定题不强行统一压成7→4→2天；考前完整检查分散在最后7天，预算装不下会显示缺口。未完成不会因截止日被隐藏。</p></details>
 <details><summary>我在纸上或旧版本已经学过</summary><p>勾选实际接触过的题，标为待验证。不能一键继承旧教材成绩。可搜索科目、题号或【A】，再取消尚未学过的题。</p><input aria-label="筛选已学声明" placeholder="例如：【A】、体育概论、F01" value={query} onChange={e=>setQuery(e.target.value)}/><button className="btn" onClick={()=>setSelected([...new Set([...selected,...choices.filter(p=>(p.subject+p.title).includes(query)&&!study.declarations[p.id]).map(p=>p.id)])])}>勾选当前筛选结果</button><div style={{maxHeight:300,overflow:'auto'}}>{choices.filter(p=>(p.subject+p.title).includes(query)).map(p=><label className="check" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} disabled={Boolean(study.declarations[p.id])} onChange={e=>setSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/>{p.subject} · {p.title}{study.declarations[p.id]?'（已声明）':''}</label>)}</div><button className="btn" disabled={!selected.length||f.blocked} onClick={()=>{f.declareLearned(selected);setSelected([])}}>将所选题标为已学待验证</button></details>
 <details><summary>本版短测与完整验收记录（{study.records.length}）</summary>{study.records.slice(-30).reverse().map(r=><p key={r.id}>{choices.find(c=>c.id===key(r.module,r.itemId))?.title??r.itemId} · {activityLabel[r.activity]} · 测试{r.scope.length}/{r.allPointIds.length}项 · 通过{Object.values(r.outcomes).filter(x=>x==='pass').length} · 错漏{Object.values(r.outcomes).filter(x=>x==='miss').length} · {r.complete?'整题延迟验收通过':r.hinted?'使用提示，仍需闭卷验证':'尚未整题验证'}</p>)}</details>
 </section>
}
export function StudyTimer() {
 const f=useFusion(),app=useApp()
 const lastExam=f.state.study?.exams.at(-1)
 const exam=app.state.exam?f.state.study?.exams.find(e=>e.id===app.state.exam!.id):f.state.active?.status!=='in_progress' && lastExam?.finishedAt && !f.state.study?.time[lastExam.id]?.confirmed ? lastExam:null
 const task=exam?{id:exam.id,status:exam.finishedAt?'completed':'in_progress'}:f.state.active, entry=task?f.state.study?.time[task.id]:null
 const [minutes,setMinutes]=useState(''),paused=useRef(false),lastInput=useRef(Date.now())
 useEffect(()=>{setMinutes('');paused.current=false;lastInput.current=Date.now()},[task?.id])
 const ticking=useRef(f.tick);ticking.current=f.tick
 const onTraining=exam ? f.panel==='mrc'&&app.state.view==='exam' : f.panel==='scoped'||f.panel==='general'||(f.panel==='mrc'&&app.state.view==='recall')
 useEffect(()=>{
  if(!f.state.study||!task||task.status!=='in_progress')return
  const pulse=()=>ticking.current(onTraining&&!paused.current&&!document.hidden&&Date.now()-lastInput.current<120000)
  const input=()=>{lastInput.current=Date.now()}
  const visibility=()=>{if(document.hidden)ticking.current(false);else {paused.current=true;ticking.current(false)}}
  if(!onTraining) { ticking.current(false); return }
  const timer=setInterval(pulse,10000); document.addEventListener('visibilitychange',visibility);window.addEventListener('pointerdown',input);window.addEventListener('keydown',input)
  pulse()
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pointerdown',input);window.removeEventListener('keydown',input);ticking.current(false)}
 },[task?.id,task?.status,onTraining,Boolean(f.state.study)])
 if(!f.state.study||!task||!entry)return null
 return <aside className="card study-timer"><p>本任务已观测操作用时 {Math.round(entry.seconds/60*10)/10} 分钟。后台、暂停和连续2分钟无操作不计；纸面作答请在完成后补记净用时。</p>
 {task.status==='in_progress'?<button className="btn" disabled={f.blocked} onClick={()=>{paused.current=!entry.paused;lastInput.current=Date.now();f.tick(!paused.current)}}>{entry.paused?'继续计时':'暂停计时'}</button>:!entry.confirmed?<div><label className="field">本题总净用时（含纸面作答、核对、复述）<input aria-label="确认本题净分钟" type="number" min="1" max="600" value={minutes} placeholder={String(Math.max(1,Math.ceil(entry.seconds/60)))} onChange={e=>setMinutes(e.target.value)}/></label><button className="btn" disabled={!minutes.trim()||Number(minutes)<=0} onClick={()=>f.confirmTime(Number(minutes),exam?.id)}>确认用时</button><p>不确认则保留预计预算，不用这条数据校准速度；超时照实占预算。</p></div>:<p>净用时已确认，用于同科同类型估时；不会改变成绩。</p>}
 </aside>
}
export function ScopedTraining() {
 const f=useFusion(),s=f.state.study?.session,task=f.state.active
 if(!s||!task)return <p>没有抽测任务。请回到今日训练。</p>
 return <div className="stack"><header className="page-head"><div><p>{activityLabel[s.activity]} · {task.subject}{task.supplement?' · 附录补充，不计正文分母':''}</p><h1>{task.title}</h1></div><button className="btn" onClick={()=>{f.tick(false);f.open('today')}}>暂停，回到今日</button></header>
 <p>本次测试{s.scope.length}/{s.allPointIds.length}项，范围已保存，刷新不会换题。{s.module==='general'?'范围来自教材小标题或编号段落，是机械定位，不是专家审核的细采分点。':''}</p>
 {s.phase==='draft'&&<section className="card"><h2>先闭卷输出</h2><p>{s.activity==='short'?`先回忆全题骨架，再展开源文顺序第${s.scope.map(p=>s.allPointIds.indexOf(p.id)+1).join('、')}项。不显示答案标题；不知道对应内容时记录不会，再用提示。`:'展开整题结构、关键解释和适用的体育例证，并完成必要书面作答。'}</p><textarea aria-label="范围闭卷草稿" rows={8} value={s.draft} onChange={e=>f.patchScoped({draft:e.target.value})}/><label className="check"><input type="checkbox" checked={s.paper} onChange={e=>f.patchScoped({paper:e.target.checked})}/>已在纸上完成并保留原稿（人工声明，程序未读取图片）</label><div className="actions"><button className="btn primary" onClick={()=>f.patchScoped({phase:'compare'})}>冻结原稿，开始核对</button><button className="btn" onClick={()=>f.patchScoped({phase:'compare',hinted:true})}>想不起来，需要原文帮助</button></div></section>}
 {s.phase==='compare'&&<><section className="card"><h2>只核对揭晓前的输出</h2><pre>{s.frozenDraft|| (s.paper?'纸上原稿由你保留并人工核对':'（闭卷原稿为空）')}</pre><p>补写和看答案后的复述不算原稿答对。只说出标题不能证明解释正确；不确定保留“未测试”。</p></section>{s.scope.map((p,i)=><section className="card" key={p.id}><h3>{i+1}. {p.label}</h3><pre>{p.reference||'此处缺少可靠分段正文，请查完整教材；不能确认通过。'}</pre><label className="field">原稿表现{p.role==='heading'?'（此项仅核对标题，不能证明论述正确）':''}<select aria-label={`核对第${i+1}项`} value={s.outcomes[p.id]} onChange={e=>f.patchScoped({outcomes:{...s.outcomes,[p.id]:e.target.value as 'pass'|'miss'|'untested'}})}><option value="untested">未测试／无法确定</option><option value="pass" disabled={!p.reference||(!s.frozenDraft?.trim()&&!s.paper)}>闭卷已有正确解释</option><option value="miss">已测试，有错漏</option></select></label></section>)}{s.activity==='full'&&<section className="card"><label className="check"><input type="checkbox" checked={s.structure} onChange={e=>f.patchScoped({structure:e.target.checked})}/>整题结构、关键解释和适用例证均已核对，不以标题代替论述</label><label className="check"><input type="checkbox" checked={s.written} onChange={e=>f.patchScoped({written:e.target.checked})}/>已完成必要书面输出，不仅是在脑中觉得熟悉</label></section>}<button className="btn primary" disabled={f.blocked} onClick={f.saveScoped}>保存实际测试结果</button></>}
 {s.phase==='done'&&<section className="card"><h2>范围证据已保存</h2><p>未抽查的点没有判分；没有新增整题Attempt或FSRS评分。只有延迟至少24小时、全范围通过且无提示的完整验收，才标为“整题已验证”。</p><FusionNext/></section>}
 </div>
}

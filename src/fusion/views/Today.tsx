import { useState } from 'react'
import { useApp } from '../../state/store'
import { useFusion } from '../store'
import { remaining, spent, availableSubjects, allCandidates, subjectAllowed } from '../planner'
import { FusionNext } from './Next'
import { isLegacyManagement } from '../../general/data'
import { Icon } from '../Icon'
import { BudgetSelect } from '../components'

export function FusionToday() {
  const f = useFusion()
  const [choosing, setChoosing] = useState(false)
  const app = useApp()
  const subjects = availableSubjects(f.state)
  const selection = f.state.day.subjects
  const practice = f.state.day.practice
  const outsideDue = selection ? allCandidates(f.state, app.state, app.now).filter(c => !c.isNew && !subjectAllowed(f.state, c.subject)).length : 0
  const d = f.decision
  const task = d.kind === 'resume' ? d.task : d.kind === 'next' ? d.candidate : null
  const completed = f.state.day.tasks.filter(t => t.status === 'completed').length
  const emptySubjects = ['运动生理学', '体育概论'].filter(subject => !f.state.general.points.some(p => p.subject === subject && !isLegacyManagement(p.subject)))
  return <div className="stack today-page">
    <header className="page-head"><div><p className="kicker">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 每日训练</p><h1>今日作战台</h1><p className="muted">先做好这一题，下一步交给教练。</p></div><span className="day-icon"><Icon name="today" size={28} /></span></header>
    <div className="day-budget"><div><span><Icon name="check" size={16} /> 已完成 <strong>{completed}</strong> 项</span><span>可安排 <strong>{remaining(f.state)}</strong> / {f.state.day.budgetMinutes} 分钟</span></div><progress aria-label="今日已分配预算" max={f.state.day.budgetMinutes} value={Math.min(spent(f.state.day), f.state.day.budgetMinutes)} /></div>
    <section className="card subject-selection" aria-label="今日科目选择">
      <h2>今天练哪些科目</h2>
      <div className="actions" role="group" aria-label="安排方式">
        <button className="btn" aria-pressed={!selection} disabled={f.blocked} onClick={() => { f.setSubjects(null); setChoosing(false) }}>自动安排</button>
        <button className="btn" aria-pressed={Boolean(selection)} disabled={f.blocked} onClick={() => { if (!selection) f.setSubjects(subjects); setChoosing(true) }}>自选科目</button>
      </div>
      {selection ? <details className="subject-picker" open={choosing} onToggle={e => setChoosing(e.currentTarget.open)}><summary>已选：{selection.join('、')} · 调整</summary><fieldset><legend>可多选，至少保留一个科目</legend><div className="subject-options">{[...new Set([...subjects, ...selection])].map(subject => <label className="check" key={subject}><input type="checkbox" checked={selection.includes(subject)} disabled={f.blocked || (selection.length === 1 && selection.includes(subject))} onChange={e => f.setSubjects(e.target.checked ? [...selection, subject] : selection.filter(s => s !== subject))} />{subject}</label>)}</div></fieldset></details> : <p className="muted">系统按到期情况与原科目安排选题。</p>}
      {selection && <p className="muted">仅今天有效，明天恢复自动安排。</p>}
      {outsideDue > 0 && <p role="status">其他未选科目另有 {outsideDue} 道到期复测，仍保留在原日程中。</p>}
    </section>
    {practice && <aside className="card practice-scope"><h2>正在自主练习：{practice.title}</h2><p>只接续本次范围，不自动跳到其他章节或科目。切换上方科目安排将结束此范围，当前草稿保留。</p><button className="btn ghost" disabled={f.blocked} onClick={f.endPractice}>结束自主范围，返回今日安排</button></aside>}
    {task ? <section className="card coach-main">
      <div className="task-topline"><span className="task-chip">{d.kind === 'resume' ? '继续未完成训练' : practice ? '自主练习' : task.isNew ? '首次主动提取' : '到期复测'}</span><span className="muted">{task.subject}</span></div>
      <p className="task-label">{d.kind === 'resume' ? '接着完成这一题' : '现在先做这一题'}</p>
      <h2 className="coach-title">{task.title}</h2><p className="coach-reason">{task.reason}</p>
      <p className="task-time"><Icon name="clock" size={18} />预计 <strong>{task.estimatedMinutes} 分钟</strong><span>· {task.module === 'mrc' ? '完整答题训练' : '知识点提取'}</span></p>
      <button data-testid="start-training" className="btn primary coach-start" disabled={f.blocked} onClick={() => f.start()}><span>{d.kind === 'resume' ? '继续训练' : '开始训练'}</span><Icon name="arrow" /></button>
      <div className="task-followup"><Icon name="check" size={18} /><p>完成后保存本轮表现，{practice ? '只接续本次范围。' : '继续下一项。'}<br /><span className="muted">今日预算用完，就可以收工。</span></p></div>
    </section> : <section className="card"><FusionNext onToday /></section>}
    <section className="card coach-footer">
      <h2>按今天的精力安排</h2><p className="muted">已分配 {spent(f.state.day)} 分钟，按任务预计时长计算；暂停和刷新不会重复占用预算。</p>
      <details><summary>调整今日预算</summary><label className="field">只调整今天<BudgetSelect label="今日预算" value={f.state.day.budgetMinutes} onChange={f.setMinutes} /></label><p className="muted">明天仍用每日默认预算 {f.state.settings.minutes} 分钟。</p>
      </details>
      <p className="muted">调整只影响今天；收工会停止今天的推荐。</p>
      {task && <button className="btn ghost" disabled={d.kind === 'resume' || f.blocked} onClick={f.closeDay}>今天先到这里</button>}
      {d.kind === 'resume' && <p className="muted">草稿已保留，可直接离开；完成当前训练后再收工。</p>}
    </section>
    {completed > 0 && <details className="card"><summary>今日已完成（{completed}）</summary><ul>{f.state.day.tasks.filter(t => t.status === 'completed').map(t => <li key={t.id}>{t.subject} · {t.title}</li>)}</ul></details>}
    {task && d.kind === 'next' && task.estimatedMinutes < 15 && remaining(f.state) < 15 && <p className="muted">剩余预算不足15分钟，本次安排能在预算内完成的短任务；较长题目留待下次，不自动延长今日预算。</p>}
    {emptySubjects.length > 0 && <aside className="subject-note"><Icon name="library" /><div><p>{emptySubjects.includes('运动生理学') ? '管理学资料已就绪。' : '管理学、运动生理学资料已就绪。'}</p><p className="muted">{emptySubjects.join('、')}可在设置中导入 JSON，或到资料库录入教材。</p><div className="actions"><button className="btn" onClick={() => f.open('settings')}>导入 JSON</button><button className="btn" onClick={() => f.open('library')}>去资料库录入</button></div></div></aside>}
  </div>
}

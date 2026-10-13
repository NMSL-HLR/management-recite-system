import { useFusion } from '../store'
import { remaining, spent } from '../planner'
import { FusionNext } from './Next'
import { isLegacyManagement } from '../../general/data'
import { Icon } from '../Icon'

export function FusionToday() {
  const f = useFusion()
  const d = f.decision
  const task = d.kind === 'resume' ? d.task : d.kind === 'next' ? d.candidate : null
  const completed = f.state.day.tasks.filter(t => t.status === 'completed').length
  const emptySubjects = ['运动生理学', '体育概论'].filter(subject => !f.state.general.points.some(p => p.subject === subject && !isLegacyManagement(p.subject)))
  return <div className="stack today-page">
    <header className="page-head"><div><p className="kicker">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 每日训练</p><h1>今日作战台</h1><p className="muted">先做好这一题，下一步交给教练。</p></div><span className="day-icon"><Icon name="today" size={28} /></span></header>
    <div className="day-budget"><div><span><Icon name="check" size={16} /> 已完成 <strong>{completed}</strong> 项</span><span>剩余 <strong>{remaining(f.state)}</strong> / {f.state.day.budgetMinutes} 分钟</span></div><progress aria-label="今日已分配预算" max={f.state.day.budgetMinutes} value={Math.min(spent(f.state.day), f.state.day.budgetMinutes)} /></div>
    {task ? <section className="card coach-main">
      <div className="task-topline"><span className="task-chip">{d.kind === 'resume' ? '继续未完成训练' : task.isNew ? '首次主动提取' : '到期复测'}</span><span className="muted">{task.subject}</span></div>
      <p className="task-label">{d.kind === 'resume' ? '接着完成这一题' : '现在先做这一题'}</p>
      <h2 className="coach-title">{task.title}</h2><p className="coach-reason">{task.reason}</p>
      <p className="task-time"><Icon name="clock" size={18} />预计 <strong>{task.estimatedMinutes} 分钟</strong><span>· {task.module === 'mrc' ? '完整答题训练' : '知识点提取'}</span></p>
      <button data-testid="start-training" className="btn primary coach-start" disabled={f.blocked} onClick={() => f.start()}><span>{d.kind === 'resume' ? '继续训练' : '开始训练'}</span><Icon name="arrow" /></button>
      <div className="task-followup"><Icon name="check" size={18} /><p>完成后保存本轮表现，继续下一项。<br /><span className="muted">今日预算用完，就可以收工。</span></p></div>
    </section> : <section className="card"><FusionNext />{!f.state.day.closed && <button className="btn ghost" onClick={f.closeDay}>今天先到这里</button>}</section>}
    <section className="card coach-footer">
      <h2>按今天的精力安排</h2><p className="muted">已分配 {spent(f.state.day)} 分钟训练预算，实际用时另行记录。</p>
      <details><summary>调整今日预算</summary><label className="field">分钟<select aria-label="今日预算" value={f.state.day.budgetMinutes} onChange={e => f.setMinutes(Number(e.target.value))}>{[15, 30, 45, 60, 90, 120, 180].map(n => <option key={n}>{n}</option>)}</select></label>
        <button className="btn ghost" onClick={f.closeDay}>今天先到这里</button>
      </details>
    </section>
    {emptySubjects.length > 0 && <aside className="subject-note"><Icon name="library" /><div><p>{emptySubjects.includes('运动生理学') ? '管理学资料已就绪。' : '管理学、运动生理学资料已就绪。'}</p><p className="muted">{emptySubjects.join('、')}可在设置中导入 JSON，或到资料库录入教材。</p></div></aside>}
  </div>
}

import { useFusion } from '../store'
import { remaining, spent } from '../planner'
import { FusionNext } from './Next'
import { isLegacyManagement } from '../../general/data'

export function FusionToday() {
  const f = useFusion()
  const d = f.decision
  const task = d.kind === 'resume' ? d.task : d.kind === 'next' ? d.candidate : null
  const completed = f.state.day.tasks.filter(t => t.status === 'completed').length
  const emptySubjects = ['运动生理学', '体育概论'].filter(subject => !f.state.general.points.some(p => p.subject === subject && !isLegacyManagement(p.subject)))
  return <div className="stack">
    <header className="page-head"><div><p className="kicker">346 全科备考 · 融合 Alpha</p><h1>今日作战台</h1><p className="muted">先做当前这一项，完成后再安排下一步。</p></div></header>
    {task ? <section className="card coach-main">
      <p className="kicker">{d.kind === 'resume' ? '继续未完成训练' : task.isNew ? '今日重点 · 首次主动提取' : '今日重点 · 到期复测'}</p>
      <p>{task.subject} · {task.module === 'mrc' ? '完整答题训练' : '知识点提取'}</p>
      <h2 className="coach-title">{task.title}</h2><p>{task.reason}</p>
      <p>预计 <strong>{task.estimatedMinutes} 分钟</strong>。</p>
      <button data-testid="start-training" className="btn primary coach-start" disabled={f.blocked} onClick={() => f.start()}>{d.kind === 'resume' ? '继续训练' : '开始训练'}</button>
      <p className="muted">完成后：保存本轮真实表现，再推荐下一项；预算完成即可收工。</p>
    </section> : <section className="card"><FusionNext />{!f.state.day.closed && <button className="btn ghost" onClick={f.closeDay}>今天先到这里</button>}</section>}
    <section className="card coach-footer">
      <p>今日已完成 {completed} 项 · 剩余预算 {remaining(f.state)} / {f.state.day.budgetMinutes} 分钟</p>
      <p className="muted">已为开始的任务分配 {spent(f.state.day)} 分钟。这是安排预算，实际耗时保存在各模块训练记录中。</p>
      <details><summary>调整今日预算</summary><label className="field">分钟<select aria-label="今日预算" value={f.state.day.budgetMinutes} onChange={e => f.setMinutes(Number(e.target.value))}>{[15, 30, 45, 60, 90, 120, 180].map(n => <option key={n}>{n}</option>)}</select></label>
        <button className="btn ghost" onClick={f.closeDay}>今天先到这里</button>
      </details>
    </section>
    {emptySubjects.length > 0 && <aside className="card"><p>{emptySubjects.join('、')}尚未导入学习资料。</p><p className="muted">可在设置中导入旧记忆引擎 JSON，或到资料库录入已有教材内容。管理学 A/B 资料已内置。</p></aside>}
  </div>
}

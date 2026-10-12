import { getItem } from '../content'
import { remainingMinutes } from '../coach/planner'
import { useApp } from '../state/store'

export function Today() {
  const app = useApp()
  const decision = app.coachDecision
  const task = decision.kind === 'next' || decision.kind === 'resume' ? decision.task : null
  const item = task ? getItem(task.itemId) : null
  const completed = app.coachPlan.tasks.filter((row) => row.status === 'completed').length
  return (
    <div className="stack coach-page">
      <header className="page-head">
        <div>
          <p className="kicker">MRC · V3 Alpha Lite</p>
          <h1>今日作战台</h1>
          <p className="muted">先闭卷输出，再按需恢复。今天只管眼前这一项。</p>
        </div>
        <span className="coach-day">{app.coachPlan.date}</span>
      </header>
      <section className="card coach-primary" aria-live="polite">
        {task && item ? <>
          <p className="kicker">今日重点 · {decision.kind === 'resume' ? '继续未完成训练' : task.kind === 'due_review' ? '到期复测' : item.coreA ? '核心题首测' : '知识补齐'}</p>
          <p className="coach-label">{decision.kind === 'resume' ? '接着完成' : '现在先做'}</p>
          <h2 className="coach-title">{item.title}</h2>
          <p className="coach-reason">{decision.kind === 'resume' ? '上次训练尚未完成，原草稿与提示步骤都在。' : task.reason}</p>
          <p>预计 <strong>{task.estimatedMinutes} 分钟</strong>，含核对与撤提示复述。</p>
          <button className="btn primary coach-start" type="button" onClick={app.startCoach}>
            {decision.kind === 'resume' ? '继续训练' : '开始训练'}
          </button>
          <p className="muted">完成后：保存真实表现，系统继续安排下一项，或提醒你休息、收工。</p>
        </> : decision.kind === 'wait' ? <>
          <p className="kicker">现在可以休息</p>
          <h2 className="coach-title">当前没有立即任务。</h2>
          <p>下一次复测：{new Date(decision.dueAt).toLocaleString()}，约 {Math.max(1, Math.ceil((decision.dueAt - app.now) / 60000))} 分钟后。</p>
          <p className="muted">重新打开页面时会检查到期时间。无需立刻重复刚练过的题。</p>
          <button className="btn primary coach-start" type="button" onClick={app.closeCoachDay}>今天先到这里</button>
        </> : <>
          <p className="kicker">今日收工</p>
          <h2 className="coach-title">今日安排已完成。</h2>
          <p>可以收工。</p>
          <p className="muted">{decision.kind === 'done' && decision.reason === 'budget'
            ? '今日预算已用完，或剩余时间不足一项完整训练。到期题仍保留原复测时间，留待下次安排。'
            : '今天不再自动追加任务。明天打开时会重新检查训练安排。'}</p>
        </>}
      </section>
      <section className="coach-footer">
        <p>今日完成 <strong>{completed}</strong> 项 · 预算 <strong>{app.coachPlan.budgetMinutes}</strong> 分钟 · 还可安排 <strong>{remainingMinutes(app.coachPlan)}</strong> 分钟</p>
        <details>
          <summary>调整今日预算与使用说明</summary>
          <label className="field">今日预算（分钟）
            <select value={app.coachPlan.budgetMinutes} onChange={(event) => app.setCoachBudget(Number(event.target.value))}>
              {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}
            </select>
          </label>
          <p className="muted">每开始一项，按预计时长占用预算；这是任务上限，不是精确计时。调整预算不会覆盖正在进行的训练。</p>
          <button className="linkish" type="button" onClick={() => app.setView('method')}>查看主动提取方法</button>
        </details>
      </section>
    </div>
  )
}

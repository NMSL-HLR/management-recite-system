import { getItem } from '../content'
import { useApp } from '../state/store'

export function CoachNext() {
  const app = useApp()
  const decision = app.coachDecision
  if (decision.kind === 'next' || decision.kind === 'resume') {
    const item = getItem(decision.task.itemId)
    return (
      <div className="coach-next" aria-live="polite">
        <h3>下一步：{item?.title}</h3>
        <p>{decision.task.reason}</p>
        <p>预计 {decision.task.estimatedMinutes} 分钟。</p>
        <button className="btn primary" type="button" onClick={app.recallNext}>继续</button>
        <button className="btn ghost" type="button" onClick={() => app.setView('today')}>先回今日</button>
      </div>
    )
  }
  return (
    <div className="coach-next" aria-live="polite">
      {decision.kind === 'wait' ? <>
        <h3>当前没有立即任务。</h3>
        <p>下一次复测：约 {Math.max(1, Math.ceil((decision.dueAt - app.now) / 60000))} 分钟后（{new Date(decision.dueAt).toLocaleString()}）。</p>
      </> : <>
        <h3>今日安排已完成。可以收工。</h3>
        <p className="muted">{decision.reason === 'budget' ? '今日剩余预算不足以开始下一项，待复测题留到下次安排。' : '今天不再自动追加训练。'}</p>
      </>}
      <button className="btn primary" type="button" onClick={() => app.setView('today')}>回到今日</button>
    </div>
  )
}

import { useApp } from '../../state/store'
import { useFusion } from '../store'

export function FusionNext() {
  const fusion = useFusion()
  const app = useApp()
  const d = fusion.decision
  return <div className="coach-next" aria-live="polite">
    {d.kind === 'next' || d.kind === 'resume' ? <>
      <h3>下一步：{d.kind === 'next' ? d.candidate.title : d.task.title}</h3>
      <p>{d.kind === 'next' ? d.candidate.subject : d.task.subject} · 预计 {d.kind === 'next' ? d.candidate.estimatedMinutes : d.task.estimatedMinutes} 分钟</p>
      <button className="btn primary" onClick={() => fusion.start()}>继续</button>
      <button className="btn ghost" onClick={() => fusion.open('today')}>回到今日</button>
    </> : <>
      <h3>{d.kind === 'wait' ? '当前没有立即任务。' : '今日安排已完成，可以收工。'}</h3>
      {d.kind === 'wait' ? <p>下一次复测：约 {Math.max(1, Math.ceil((d.dueAt - app.now) / 60000))} 分钟后，{new Date(d.dueAt).toLocaleString()}。</p> : <p>{d.reason === 'budget' ? '剩余预算不足以开始下一项。' : d.reason === 'quota' ? '今日新学配额已完成，明天继续。' : d.reason === 'closed' ? '今天不再自动追加训练。' : '当前没有可安排的训练。'}</p>}
      {d.pending > 0 ? <p>仍有 {d.pending} 道到期题未安排，下次优先处理。</p> : null}
      <button className="btn" onClick={() => fusion.open('today')}>回到今日</button>
    </>}
  </div>
}

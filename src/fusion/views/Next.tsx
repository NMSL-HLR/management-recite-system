import { localTime, waitTime } from '../../browser/format'
import { useApp } from '../../state/store'
import { useFusion } from '../store'

export function FusionNext({ onToday = false }: { onToday?: boolean }) {
  const fusion = useFusion()
  const app = useApp()
  const d = fusion.decision
  return <div className="coach-next" aria-live="polite">
    {d.kind === 'next' || d.kind === 'resume' ? <>
      <h3>{d.kind === 'resume' ? '继续未完成：' : '下一步：'}{d.kind === 'next' ? d.candidate.title : d.task.title}</h3>
      <p>{d.kind === 'next' ? d.candidate.subject : d.task.subject} · 预计 {d.kind === 'next' ? d.candidate.estimatedMinutes : d.task.estimatedMinutes} 分钟</p>
      <div className="actions"><button className="btn primary" disabled={fusion.blocked} onClick={() => fusion.start()}>继续</button>
      {d.kind === 'next' && <button className="btn ghost" disabled={fusion.blocked} onClick={fusion.closeDay}>今天先到这里</button>}
      {!onToday && <button className="btn ghost" onClick={() => fusion.open('today')}>回到今日</button>}</div>
    </> : <>
      <h3>{d.kind === 'wait' ? '当前没有立即任务。' : d.reason === 'closed' ? '今天已收工，可以休息了。' : d.reason === 'budget' ? '今日预算已用完或不足以开始下一题，可以收工。' : d.reason === 'quota' ? '当前新学配额或章节范围内，没有可安排的题目。' : '当前没有可安排的训练。'}</h3>
      {d.kind === 'wait' ? <p>下一次复测：约 {waitTime(d.dueAt, app.now)}后，{localTime(d.dueAt)}。现在可以休息，不需要等在页面上。</p> : <p>{d.reason === 'budget' ? '已开始的任务按预计时长占用预算，这不等于实际学习用时。' : d.reason === 'quota' ? '可能已达到上限，也可能暂停了新学；不代表所有知识都已掌握。可明天继续，或查看科目安排。' : d.reason === 'closed' ? '今天不再自动追加训练。需要继续时可恢复，已用预算和完成记录保留。' : '可以去资料库检查教材，或到设置导入资料。'}</p>}
      {d.pending > 0 && <p>仍有 {d.pending} 道到期题未安排，下次优先处理。</p>}
      <div className="actions">
        {d.kind === 'done' && d.reason === 'closed' && <button className="btn" disabled={fusion.blocked} onClick={fusion.reopenDay}>恢复今日训练</button>}
        {d.kind === 'done' && ['quota', 'budget'].includes(d.reason) && <button className="btn" onClick={() => fusion.open('settings')}>查看训练安排</button>}
        {d.kind === 'done' && d.reason === 'empty' && <button className="btn" onClick={() => fusion.open('library')}>查看资料库</button>}
        {!fusion.state.day.closed && <button className="btn ghost" disabled={fusion.blocked} onClick={fusion.closeDay}>今天先到这里</button>}
        {!onToday && <button className="btn" onClick={() => fusion.open('today')}>回到今日</button>}
      </div>
    </>}
  </div>
}

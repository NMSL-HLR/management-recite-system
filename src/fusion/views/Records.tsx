import { useApp } from '../../state/store'
import { isLegacyManagement } from '../../general/data'
import { useFusion } from '../store'

export function FusionRecords() {
  const f = useFusion()
  const app = useApp()
  const points = f.state.general.points.filter(p => !isLegacyManagement(p.subject))
  const weak = points.filter(p => (p.leaks?.length ?? 0) > 0).sort((a, b) => (b.leaks?.length ?? 0) - (a.leaks?.length ?? 0)).slice(0, 5)
  const logs = [...f.state.general.logsArchive, ...f.state.general.logs].sort((a, b) => b.reviewedAt - a.reviewedAt).slice(0, 20)
  return <div className="stack"><h1>学习记录</h1><section className="card"><h2>管理学证据</h2><p>已有 {app.state.attempts.length} 次训练记录，提示依赖与体育例证检查保留原值。</p><button className="btn" onClick={() => app.setView('archive')}>查看管理学记录</button><button className="btn ghost" onClick={() => app.setView('mistakes')}>查看管理学错漏</button></section>
    <section className="card"><h2>当前需要修复的要点</h2>{weak.length ? <ul>{weak.map(p => <li key={p.id}>{p.subject} · {p.title}：上次记录仍有 {p.leaks!.length} 个遗漏要点。</li>)}</ul> : <p className="muted">通用模块尚无已记录的遗漏。没有记录不代表已经掌握。</p>}<p>通用模块当前有 {points.filter(p => p.totalReviews > 0 && p.dueDate <= app.now).length} 条到期复习。下一步由今日作战台安排。</p></section>
    <section className="card"><h2>最近通用模块训练</h2>{logs.length ? <ul>{logs.map(l => <li key={l.id}>{new Date(l.reviewedAt).toLocaleString()} · {l.subject} · {f.state.general.points.find(p => p.id === l.pointId)?.title ?? l.pointId} · {['', '忘记', '模糊', '记住', '轻松回忆'][l.rating]}
      {l.preRevealDraft !== undefined && <details><summary>查看揭晓前输出{l.durationSeconds !== undefined ? ` · ${l.durationSeconds} 秒` : ''}</summary><pre>{l.preRevealDraft || '（空）'}</pre><p>已核对 {l.checkedLabels?.length ?? 0} 个要点。</p></details>}
    </li>)}</ul> : <p>暂无通用模块训练记录。</p>}</section>
  </div>
}

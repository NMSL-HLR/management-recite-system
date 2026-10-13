import { completenessToRating } from '../../general/scheduler'
import type { Rating } from '../../general/types'
import { useFusion } from '../store'
import { FusionNext } from './Next'

const LABELS: Record<Rating, string> = { 1: '忘记', 2: '模糊', 3: '记住', 4: '轻松回忆' }
export function GeneralTraining() {
  const f = useFusion()
  const s = f.state.session
  const task = f.state.active
  const point = f.state.general.points.find(p => p.id === s?.itemId)
  if (!s || !point || !task || task.module !== 'general') return <section className="card"><p>当前没有通用训练。</p><button className="btn" onClick={() => f.open('today')}>回到今日</button></section>
  const checklist = point.checklist ?? []
  const suggested = checklist.length ? completenessToRating(checklist.filter(c => s.checked.includes(c)).length / checklist.length) : null
  return <div className="stack">
    <header className="page-head"><div><p className="kicker">{point.subject} · 主动提取</p><h1>{point.title}</h1></div><button className="btn ghost" onClick={() => f.open('today')}>暂停，回到今日</button></header>
    {s.phase === 'draft' && <section className="card"><h2>先闭卷输出</h2><p>写出能想起的答案，再揭晓核对。揭晓后这一稿会冻结。</p>
      <textarea aria-label="闭卷草稿" rows={10} value={s.draft} onChange={e => f.patchSession({ draft: e.target.value })} />
      <button className="btn primary" onClick={f.reveal}>提交草稿，核对原文</button>
    </section>}
    {s.phase === 'compare' && <>
      <div className="compare"><section className="card"><h2>揭晓前草稿</h2><pre>{s.frozenDraft || '（空）'}</pre></section><section className="card"><h2>原资料</h2><pre>{point.content}</pre></section></div>
      <section className="card"><h2>核对揭晓前的输出</h2><p className="muted">只勾选刚才草稿中已有的要点。这里的自评用于通用记忆模块。</p>
        {checklist.length > 0 && <fieldset><legend>要点清单</legend>{checklist.map((label, index) => <label className="check" key={`${index}-${label}`}><input type="checkbox" checked={s.checked.includes(label)} onChange={e => f.patchSession({ checked: e.target.checked ? [...s.checked, label] : s.checked.filter(x => x !== label) })} />{label}</label>)}</fieldset>}
        {suggested !== null && <p>按已核对要点建议：{LABELS[suggested]}。仍需结合实际回忆困难度选择。</p>}
        <div className="actions">{([1, 2, 3, 4] as Rating[]).map(r => <button className="btn" data-rating={r} key={r} onClick={() => f.rate(r)}>{LABELS[r]}</button>)}</div>
      </section>
    </>}
    {s.phase === 'done' && <section className="card"><h2>本轮已保存</h2><p>回忆自评：{s.rating && LABELS[s.rating]}。下次复习：{new Date(point.dueDate).toLocaleString()}。</p>
      {(point.leaks?.length ?? 0) > 0 && <p>尚有 {point.leaks!.length} 个遗漏要点，下一次核对时重点修复。</p>}
      <FusionNext />
    </section>}
  </div>
}

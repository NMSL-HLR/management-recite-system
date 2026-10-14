import { generalReadyAt } from '../planner'
import { useEffect } from 'react'
import { localTime } from '../../browser/format'
import { completenessToRating } from '../../general/scheduler'
import type { Rating } from '../../general/types'
import { useFusion } from '../store'
import { FusionNext } from './Next'

const LABELS: Record<Rating, string> = { 1: '忘记', 2: '模糊', 3: '记住', 4: '轻松回忆' }
export function GeneralTraining() {
  const f = useFusion()
  const s = f.state.session
  const task = f.state.active
  useEffect(() => {
    if (s?.phase !== 'compare') return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || document.querySelector('dialog[open]') || (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return
      if (/^[1-4]$/.test(e.key)) { e.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-rating="${e.key}"]`)?.focus() }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [s?.phase])
  const point = f.state.general.points.find(p => p.id === s?.itemId)
  if (!s || !point || !task || task.module !== 'general') return <section className="card"><p>当前没有通用训练。</p><button className="btn" onClick={() => f.open('today')}>回到今日</button></section>
  const checklist = point.checklist ?? []
  const suggested = checklist.length ? completenessToRating(checklist.filter(c => s.checked.includes(c)).length / checklist.length) : null
  return <div className="stack">
    <header className="page-head"><div><p className="kicker">{point.subject} · {point.quotaChapterOverride || '主动提取'}</p><h1>{point.title}</h1></div><button className="btn ghost" onClick={() => f.open('today')}>{s.phase === 'done' ? '回到今日' : '暂停，回到今日'}</button></header>
    <ol className="training-steps" aria-label="训练步骤">{[['draft', '闭卷输出'], ['compare', '核对与自评'], ['done', '保存与下一步']].map(([phase, label]) => <li key={phase} aria-current={s.phase === phase ? 'step' : undefined}>{label}</li>)}</ol>
    {s.phase === 'draft' && <section className="card"><h2>先闭卷输出</h2><p>写出能想起的答案，再揭晓核对。揭晓后这一稿会冻结。想不起来可以留空；Ctrl+Enter 提交。</p>
      <textarea aria-label="闭卷草稿" rows={10} onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); f.reveal() } }} value={s.draft} onChange={e => f.patchSession({ draft: e.target.value })} />
      <button className="btn primary" onClick={f.reveal}>提交草稿，核对原文</button>
    </section>}
    {s.phase === 'compare' && <>
      <div className="compare"><section className="card draft-pane"><h2>揭晓前草稿</h2><pre className="frozen-draft">{s.frozenDraft || '（空）'}</pre></section><section className="card"><h2>原资料</h2><pre>{point.content}</pre></section></div>
      <section className="card"><h2>核对揭晓前的输出</h2><p className="muted">只勾选刚才草稿中已有的要点。这里的自评用于通用记忆模块。</p>
        {checklist.length > 0 && <fieldset><legend>要点清单 · 已核对 {checklist.filter(c => s.checked.includes(c)).length}/{checklist.length}</legend>{checklist.map((label, index) => <label className="check" key={`${index}-${label}`}><input type="checkbox" checked={s.checked.includes(label)} onChange={e => f.patchSession({ checked: e.target.checked ? [...s.checked, label] : s.checked.filter(x => x !== label) })} />{label}</label>)}</fieldset>}
        {suggested !== null && <p>按已核对要点建议：{LABELS[suggested]}。仍需结合实际回忆困难度选择。</p>}
        <p className="muted" id="rating-help">忘记：无法重现；模糊：费力且遗漏多；记住：基本完整；轻松回忆：迅速完整。数字键 1–4 只定位按钮，按 Enter 才保存。</p>
        <div className="actions">{([1, 2, 3, 4] as Rating[]).map(r => <button className="btn" data-suggested={r === suggested} aria-describedby="rating-help" data-rating={r} key={r} onClick={() => f.rate(r)}>{LABELS[r]}</button>)}</div>
      </section>
    </>}
    {s.phase === 'done' && <section className="card"><h2>本轮已保存</h2><p>回忆自评：{s.rating && LABELS[s.rating]}。下次复习：{localTime(generalReadyAt(point))}。</p>
      {(point.leaks?.length ?? 0) > 0 && <p>尚有 {point.leaks!.length} 个遗漏要点，下一次核对时重点修复。</p>}
      {s.rating === 1 && <p>这题先休息20分钟再自动安排，避免刚看完答案立即重复。原复习记录保留，等待期间可练其他题或收工。</p>}
      <FusionNext />
    </section>}
  </div>
}

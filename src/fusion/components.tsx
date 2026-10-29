import { useEffect, useId, useRef, useState } from 'react'
import { useFusion } from './store'

export function BudgetSelect({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const options = [...new Set([15, 30, 45, 60, 90, 120, 180, value])].sort((a, b) => a - b)
  return <select aria-label={label} value={value} onChange={e => onChange(Number(e.target.value))}>{options.map(n => <option key={n} value={n}>{n} 分钟</option>)}</select>
}

/** Keep incomplete keyboard input local; only a valid, complete value is persisted. */
export function PolicyField({ label, value, min, max, integer = true, onCommit }: { label: string; value: number; min: number; max: number; integer?: boolean; onCommit: (value: number) => boolean }) {
  const [draft, setDraft] = useState(String(value))
  const [feedback, setFeedback] = useState('')
  const [invalid, setInvalid] = useState(false)
  const id = useId()
  useEffect(() => { setDraft(String(value)) }, [value])
  const commit = () => {
    const number = Number(draft)
    if (!draft.trim() || !Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < min || number > max) {
      setInvalid(true); setFeedback(`请输入 ${min}–${max} 的${integer ? '整数' : '数字'}，原设置未改动。`); return
    }
    if (number === value) { setInvalid(false); setFeedback(''); return }
    if (onCommit(number)) { setInvalid(false); setFeedback('已保存') }
  }
  return <div><input aria-label={label} aria-describedby={id} aria-invalid={invalid} type="number" min={min} max={max} step={integer ? 1 : 'any'} value={draft}
    onChange={e => { setDraft(e.target.value); setFeedback(''); setInvalid(false) }} onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } if (e.key === 'Escape') { setDraft(String(value)); setInvalid(false); setFeedback('已恢复原值') } }} />
    <small id={id} role="status" className={invalid ? 'field-error' : 'muted'}>{feedback}</small></div>
}

export function RollbackDialog() {
  const f = useFusion()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (f.rollbackRequested && !dialog.current?.open) dialog.current?.showModal()
    if (!f.rollbackRequested && dialog.current?.open) dialog.current.close()
  }, [f.rollbackRequested])
  return <dialog ref={dialog} className="restore-dialog" aria-labelledby="restore-title" onCancel={f.cancelRollback}>
    <h2 id="restore-title">恢复导入前的数据？</h2>
    <p>这会替换管理学与通用模块的当前记录、训练草稿和今日安排。导入之后的新训练不会合并到旧备份中。</p>
    <p>建议先导出当前整包；取消不会改变任何记录。</p>
    <div className="actions"><button autoFocus className="btn" onClick={f.cancelRollback}>取消恢复</button><button className="btn" onClick={f.exportAll}>先导出当前整包</button><button className="btn danger" onClick={f.confirmRollback}>确认恢复旧备份</button></div>
  </dialog>
}

export function ResumeDialog() {
  const f = useFusion()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (f.resumeNotice && !dialog.current?.open) dialog.current?.showModal()
    if (!f.resumeNotice && dialog.current?.open) dialog.current.close()
  }, [f.resumeNotice])
  return <dialog ref={dialog} className="restore-dialog" aria-labelledby="resume-title" onCancel={f.cancelResume}>
    <h2 id="resume-title">先处理未完成训练</h2>
    <p>{f.resumeNotice}</p>
    <div className="actions"><button autoFocus className="btn" onClick={f.cancelResume}>留在当前页面</button><button className="btn primary" onClick={() => { f.cancelResume(); f.start() }}>继续未完成训练</button></div>
  </dialog>
}


export function PracticeDialog() {
  const f = useFusion()
  const p = f.practicePreview
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (p && !dialog.current?.open) dialog.current?.showModal()
    if (!p && dialog.current?.open) dialog.current.close()
  }, [Boolean(p)])
  return <dialog ref={dialog} className="restore-dialog" aria-labelledby="practice-title" onCancel={f.cancelPractice}>
    <h2 id="practice-title">开始自主练习</h2>
    {p && <><p><strong>{p.scope.title}</strong></p>
      {p.candidate ? <>
        <p>先练：{p.candidate.title} · 预计 {p.candidate.estimatedMinutes} 分钟。</p>
        <p>{p.scope.kind === 'chapter' ? `本次范围含 ${p.scope.itemIds.length} 道到期或未训练题，优先到期题。按今日剩余预算逐题进行，结束后不自动换科。` : p.candidate.reason}</p>
        <p className="muted">自主选择不受自动新学和章节配额限制，仍计入同一份今日预算与学习记录。若刚看过原文，建议稍后再练。</p>
        {f.state.day.closed && <p className="warnbox">今天已收工。开始将恢复今日训练，保留已完成记录。</p>}
        {p.extraMinutes > 0 && f.state.study && <p className="warnbox">这道题装不进剩余预算，不能开始；不会自动追加时间。</p>}
        {p.extraMinutes > 0 && !f.state.study && <p className="warnbox">剩余预算不足。开始这一题需给今天追加 {p.extraMinutes} 分钟，总预算变为 {p.budgetMinutes} 分钟；明天默认预算不变。</p>}
        {p.budgetMinutes > 600 && <p className="warnbox">超过每日600分钟上限，请休息后明天再练。</p>}
      </> : <p>本范围没有到期或未训练的可练题，参考资料和提示骨架不派发。想提前复习时，可打开某一道可训练题，选择“练这道题”。</p>}
      {f.message && <p role="status">{f.message}</p>}
      <div className="actions"><button autoFocus className="btn" onClick={f.cancelPractice}>暂不开始</button>{p.candidate && <button className="btn primary" disabled={f.blocked || p.budgetMinutes > 600 || Boolean(f.state.study && p.extraMinutes>0)} onClick={f.confirmPractice}>{p.extraMinutes > 0 ? `追加${p.extraMinutes}分钟并开始` : f.state.day.closed ? '恢复今日并开始' : '确认开始练习'}</button>}</div>
    </>}
  </dialog>
}

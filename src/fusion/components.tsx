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

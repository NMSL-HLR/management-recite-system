import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudyItem } from '../types'
import type { GeneralPoint } from '../fusion/types'
import { downloadText, localDateStamp } from '../browser/download'
import { mrcRubric, generalRubric } from '../review/rubric'
import { reviewAnswer } from '../review/analyze'
import { reviewReport } from '../review/report'
import { REVIEW_LABEL } from '../review/types'
import '../review/review.css'

type Props = {
  item?: StudyItem
  general?: GeneralPoint
  draft: string
  checked?: string[]
  onChange?: (checked: string[]) => void
  onContinue?: () => void
  continueLabel?: string
  disabled?: boolean
}
export function AnswerReview({ item, general, draft, checked = [], onChange, onContinue, continueLabel, disabled = false }: Props) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!onChange || !window.matchMedia('(max-width: 700px)').matches) return
    const frame = requestAnimationFrame(() => { root.current?.scrollIntoView({ block: 'start' }); root.current?.focus({ preventScroll: true }) })
    return () => cancelAnimationFrame(frame)
  }, [])
  const points = useMemo(() => item ? mrcRubric(item) : general ? generalRubric(general) : [], [item, general])
  const result = useMemo(() => reviewAnswer(draft, points), [draft, points])
  const [filter, setFilter] = useState<'attention' | 'all' | 'matched'>('attention')
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const [batch, setBatch] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const title = item?.title ?? general?.title ?? '当前题目'
  const matched = result.rows.filter(r => r.status === 'matched')
  const eligible = matched.filter(r => r.point.confirmable && !checked.includes(r.point.id))
  const attention = result.rows.filter(r => r.status !== 'matched' && !checked.includes(r.point.id)).sort((a, b) => ['check', 'unmatched', 'related', 'unavailable'].indexOf(a.status) - ['check', 'unmatched', 'related', 'unavailable'].indexOf(b.status))
  const filtered = filter === 'all' ? result.rows : filter === 'matched' ? matched : attention
  const shown = expanded ? filtered : filtered.slice(0, 5)
  const confirmed = points.filter(p => checked.includes(p.id)).length
  const report = () => reviewReport(title, draft, result, checked, !onChange)
  const changeFilter = (next: typeof filter) => { setFilter(next); setExpanded(false); setMessage('') }
  const mark = (id: string) => {
    if (!onChange || disabled) return
    const previous = checked.includes(id)
    onChange(previous ? checked.filter(x => x !== id) : [...new Set([...checked, id])])
    setMessage('')
  }
  return <section ref={root} tabIndex={-1} className="card answer-review" aria-label="答题评审" data-testid="answer-review">
    <p className="kicker">免费 · 本机处理 · 不上传作答</p><h2>答题评审</h2>
    <p className="review-question">{title}</p><p>先检查疑点，再确认原稿里写到的要点。</p>
    <p className="muted">文字匹配结果需你确认，不是考试评分。</p>
    {result.empty && <p className="warnbox">还没有可评审的文字。手写答案请先在手机识别并粘贴，再交卷；这一稿已冻结，不会拿揭晓后的补写冒充闭卷输出。</p>}
    {result.warnings.map(w => <p className="warnbox" role="status" key={w}>{w}</p>)}
    {!points.length && <p>本题未设置可评审核对点，请查看完整原资料。</p>}
    <div className="review-summary" aria-label="评审摘要" aria-live="polite"><span>原文对应 <strong>{matched.length}</strong> 项</span><span>待你检查 <strong>{attention.length}</strong> 项</span>{onChange && <span>本人已确认 <strong data-testid="review-confirmed">{confirmed}</strong> / {points.length} 项</span>}</div>
    <div className="actions" role="group" aria-label="评审筛选">
      {([['attention', '待检查'], ['matched', '原文对应'], ['all', '全部要点']] as const).map(([value, label]) => <button type="button" className="btn ghost" aria-pressed={filter === value} key={value} onClick={() => changeFilter(value)}>{label}</button>)}
    </div>
    {!filtered.length && points.length > 0 && <p role="status">{filter === 'attention' ? '当前没有未处理的提示。请查看原文对应项，或在“全部要点”复核；这不代表答案已自动判为全对。' : '这个分类暂无要点。'}</p>}
    <ol className="review-points">
      {shown.map(row => <li key={row.point.id} className={`review-point review-${row.status}`} data-review-id={row.point.id} data-review-status={row.status}>
        <div className="review-point-head"><span className="review-badge">{REVIEW_LABEL[row.status]}</span>{checked.includes(row.point.id) && <span>本人已确认</span>}</div>
        <h3>{row.point.label}</h3><p>{row.explanation}</p>{row.status === 'check' && <p className="warnbox">{row.evidence.flatMap(e => e.warnings)[0]}</p>}
        {(row.point.role === 'sports') && <p className="muted">体育转写：请确认有具体对象、做法及理论联系；不同于教材的有效案例可由你手动确认。</p>}
        <details className="review-evidence"><summary>查看我的表述与教材依据</summary><p className="muted">{row.point.source}</p>
          {row.evidence.map((e, i) => <div key={i} className="review-quote"><strong>我的表述</strong><pre>{e.answer}</pre><strong>教材对应片段</strong><pre>{e.reference}</pre>{e.warnings.map(w => <p className="warnbox" key={w}>{w}</p>)}</div>)}
          {row.missing.length > 0 && <div><strong>尚未匹配到的教材片段</strong>{row.missing.map((line, i) => <pre key={i}>{line}</pre>)}</div>}
          {!row.evidence.length && !row.missing.length && <pre>{row.point.reference || '未定位到唯一正文，请查看下方完整原资料。'}</pre>}
        </details>
        {onChange && row.point.confirmable && <button type="button" className="btn" disabled={disabled} aria-pressed={checked.includes(row.point.id)} onClick={() => mark(row.point.id)}>{checked.includes(row.point.id) ? '取消这项确认' : '我核对过，这项写到了'}</button>}
      </li>)}
    </ol>
    {filtered.length > 5 && <button type="button" className="btn ghost" onClick={() => setExpanded(!expanded)}>{expanded ? '收起要点' : `展开其余 ${filtered.length - 5} 项`}</button>}
    {onChange && eligible.length > 0 && !result.limited && <div className="review-batch">
      <button type="button" className="btn" disabled={disabled} onClick={() => setBatch(!batch)}>确认原文对应项（{eligible.length}）</button>
      {batch && <div className="warnbox" role="region" aria-label="批量确认对应项"><p>以下 {eligible.length} 项找到了原文表述。请确认它们在你的答案中使用正确；匹配本身不代表语义正确。只增加这些勾选，保留你已确认的其他项。</p><ul>{eligible.map(r => <li key={r.point.id}>{r.point.label}</li>)}</ul><button type="button" className="btn primary" disabled={disabled} onClick={() => { onChange([...new Set([...checked, ...eligible.map(r => r.point.id)])]); setBatch(false); setMessage('') }}>我已核对，应用这些勾选</button><button type="button" className="btn ghost" onClick={() => setBatch(false)}>暂不应用</button></div>}
    </div>}
    {onContinue && <button type="button" className="btn primary" disabled={disabled} onClick={onContinue}>{continueLabel ?? '继续原训练流程'}</button>}
    <details className="review-tools"><summary>保存评审报告与使用说明</summary><p>本功能不能判断所有同义表达、因果关系或自创案例。识别错字请对照纸面原稿核查，不把看答案后的补写算入。确认结果仍按原规则记录。</p><p>评审根据冻结作答和当前教材重算；核对勾选沿用原保存机制。报告含本次作答，请自行保管。</p><div className="actions"><button type="button" className="btn" onClick={async () => {
      try { if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable'); await navigator.clipboard.writeText(report()); setMessage('评审报告已复制。') }
      catch { setReportOpen(true); setMessage('浏览器未允许直接复制，已显示报告，请长按文字全选复制。') }
    }}>复制评审报告</button><button type="button" className="btn" onClick={() => { try { downloadText(report(), `346-答题评审-${localDateStamp()}.txt`); setMessage('报告下载已发起，请在下载列表确认。') } catch { setReportOpen(true); setMessage('下载未能发起，已显示报告，可长按复制。') } }}>下载评审报告</button><button type="button" className="btn ghost" onClick={() => setReportOpen(!reportOpen)}>{reportOpen ? '收起报告文字' : '显示报告文字'}</button></div>{reportOpen && <pre className="review-report" tabIndex={0} aria-label="可复制的评审报告">{report()}</pre>}</details>
    {message && <p role="status">{message}</p>}
  </section>
}
export function HandwritingHelp() {
  return <details className="handwriting-help"><summary>手写答题，不想打字？</summary><p>纸上写完 → 拍照 → 用手机的双指识别提取文字 → 全选复制 → 在答题框长按粘贴。先校对识别错字、数字和漏行，再交卷。照片不会由本程序上传或识别。</p><p>交卷后自动显示教材对照评审；揭晓后的补写不能回填到这一份闭卷原稿。</p></details>
}

import { useState } from 'react'
import { useApp } from '../../state/store'
import { isLegacyManagement } from '../../general/data'
import { naturalTitleCompare } from '../../general/naturalSort'
import { useFusion } from '../store'

export function FusionLibrary() {
  const f = useFusion()
  const app = useApp()
  const [subject, setSubject] = useState('运动生理学')
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [checklist, setChecklist] = useState('')
  const [chapter, setChapter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [lookup, setLookup] = useState<string | null>(null)
  const subjects = [...new Set(['运动生理学', '体育概论', ...f.state.general.points.map(p => p.subject).filter(s => !isLegacyManagement(s))])]
  const points = f.state.general.points.filter(p => (subject === 'legacy' ? isLegacyManagement(p.subject) : p.subject === subject) && (!query.trim() || `${p.title}\n${p.content}`.includes(query.trim()))).sort((a, b) => naturalTitleCompare(a.title, b.title))
  const selected = points.find(p => p.id === lookup)
  return <div className="stack"><h1>资料库</h1><p className="muted">查询与录入教材内容。每日训练从作战台开始。</p>
    <div className="actions"><button className="btn" onClick={() => app.setView('library')}>管理学 A/B 资料</button>{subjects.map(s => <button className={subject === s ? 'btn primary' : 'btn'} key={s} onClick={() => { setSubject(s); setLookup(null) }}>{s}</button>)}<button className={subject === 'legacy' ? 'btn primary' : 'btn'} onClick={() => { setSubject('legacy'); setLookup(null) }}>旧管理学记录</button></div>
    <input aria-label="查找资料" placeholder="查标题或正文" value={query} onChange={e => setQuery(e.target.value)} />
    {subject === 'legacy' && <p className="warnbox">旧管理学内容与历史评分保留查询，不自动映射到 MRC，也不重复派题。</p>}
    {subject !== 'legacy' && <button className="btn" onClick={() => setShowAdd(!showAdd)}>{showAdd ? '收起录入' : '录入教材条目'}</button>}
    {showAdd && subject !== 'legacy' && <form className="card stack" onSubmit={e => {
      e.preventDefault()
      if (f.addPoint({ subject, title, content: text, checklist: [...new Set(checklist.split('\n').map(x => x.trim()).filter(Boolean))], chapter })) { setTitle(''); setText(''); setChecklist(''); setChapter(''); setShowAdd(false) }
    }}><h2>录入 {subject}</h2><label className="field">标题<input required value={title} onChange={e => setTitle(e.target.value)} /></label><label className="field">正文<textarea required rows={8} value={text} onChange={e => setText(e.target.value)} /></label><label className="field">核对要点（每行一条，可留空）<textarea rows={4} value={checklist} onChange={e => setChecklist(e.target.value)} /></label><label className="field">章节（可留空）<input value={chapter} onChange={e => setChapter(e.target.value)} placeholder="例如：第六章" /></label><button className="btn primary" type="submit">保存条目</button></form>}
    {points.length === 0 && <section className="card"><p>这里还没有匹配的资料。</p><p className="muted">旧 HTML 不包含你的浏览器学习数据。请在旧程序导出 JSON，再到设置导入。</p></section>}
    {selected && <article className="card"><h2>{selected.title}</h2><pre>{selected.content}</pre>{selected.checklist?.length ? <ul>{selected.checklist.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}<p className="muted">复习 {selected.totalReviews} 次 · 下次 {new Date(selected.dueDate).toLocaleString()} · 补漏 {selected.leaks?.length ?? 0} 项</p><button className="btn ghost" onClick={() => setLookup(null)}>收起</button></article>}
    <ul className="plain">{points.map(p => <li key={p.id}><button className="linkish" onClick={() => setLookup(p.id)}>{p.title}</button><span className="muted"> · {p.totalReviews === 0 ? '未训练' : `已复习 ${p.totalReviews} 次`}</span></li>)}</ul>
  </div>
}

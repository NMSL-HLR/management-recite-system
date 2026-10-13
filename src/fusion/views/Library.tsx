import { useState } from 'react'
import { useApp } from '../../state/store'
import { isLegacyManagement } from '../../general/data'
import { naturalTitleCompare } from '../../general/naturalSort'
import { compareGeneralPoints, physiologyPack } from '../../general/textbook'
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
  const [chapterFilter, setChapterFilter] = useState('')
  const subjects = [...new Set(['运动生理学', '体育概论', ...f.state.general.points.map(p => p.subject).filter(s => !isLegacyManagement(s))])]
  const subjectPoints = f.state.general.points.filter(p => subject === 'legacy' ? isLegacyManagement(p.subject) : p.subject === subject)
  const chapters = [...new Set(subjectPoints.map(p => p.quotaChapterOverride).filter((c): c is string => Boolean(c)))].sort(naturalTitleCompare)
  const points = subjectPoints.filter(p => (!chapterFilter || p.quotaChapterOverride === chapterFilter) && (!query.trim() || `${p.title}\n${p.content}`.includes(query.trim()))).sort(compareGeneralPoints)
  const selected = points.find(p => p.id === lookup)
  const chapterNote = subject === '运动生理学' ? (physiologyPack.chapterNotes as Record<string, string>)[chapterFilter] : null
  return <div className="stack"><h1>资料库</h1><p className="muted">查询与录入教材内容。每日训练从作战台开始。</p>
    <div className="actions"><button className="btn" onClick={() => app.setView('library')}>管理学 A/B 资料</button>{subjects.map(s => <button className={subject === s ? 'btn primary' : 'btn'} key={s} onClick={() => { setSubject(s); setLookup(null); setChapterFilter('') }}>{s}</button>)}<button className={subject === 'legacy' ? 'btn primary' : 'btn'} onClick={() => { setSubject('legacy'); setLookup(null); setChapterFilter('') }}>旧管理学记录</button></div>
    {chapters.length > 0 && <label className="field">按章节查询<select aria-label="资料章节" value={chapterFilter} onChange={e => { setChapterFilter(e.target.value); setLookup(null) }}><option value="">全部章节（{subjectPoints.length}题）</option>{chapters.map(c => <option key={c}>{c}</option>)}</select></label>}
    {chapterNote && <aside className="card"><p className="kicker">原稿章前说明</p><pre>{chapterNote}</pre></aside>}
    {subjectPoints.some(p => p.sourcePackId === physiologyPack.packId) && <details><summary>《运动生理学》原稿说明与待补充题</summary><p>本次内置8章60题，其中56题进入训练，4题含“内容待补充”，暂仅供查询。核对清单取自原文小标题，不是自动评分。正文按原稿保存，未进行知识准确性审核或补写。</p><pre>{physiologyPack.preface}</pre></details>}
    <input aria-label="查找资料" placeholder="查标题或正文" value={query} onChange={e => setQuery(e.target.value)} />
    {subject === 'legacy' && <p className="warnbox">旧管理学内容与历史评分保留查询，不自动映射到 MRC，也不重复派题。</p>}
    {subject !== 'legacy' && <button className="btn" onClick={() => setShowAdd(!showAdd)}>{showAdd ? '收起录入' : '录入教材条目'}</button>}
    {showAdd && subject !== 'legacy' && <form className="card stack" onSubmit={e => {
      e.preventDefault()
      if (f.addPoint({ subject, title, content: text, checklist: [...new Set(checklist.split('\n').map(x => x.trim()).filter(Boolean))], chapter })) { setTitle(''); setText(''); setChecklist(''); setChapter(''); setShowAdd(false) }
    }}><h2>录入 {subject}</h2><label className="field">标题<input required value={title} onChange={e => setTitle(e.target.value)} /></label><label className="field">正文<textarea required rows={8} value={text} onChange={e => setText(e.target.value)} /></label><label className="field">核对要点（每行一条，可留空）<textarea rows={4} value={checklist} onChange={e => setChecklist(e.target.value)} /></label><label className="field">章节（可留空）<input value={chapter} onChange={e => setChapter(e.target.value)} placeholder="例如：第六章" /></label><button className="btn primary" type="submit">保存条目</button></form>}
    {points.length === 0 && <section className="card"><p>这里还没有匹配的资料。</p><p className="muted">旧 HTML 不包含你的浏览器学习数据。请在旧程序导出 JSON，再到设置导入。</p></section>}
    {selected && <article className="card"><p className="kicker">{selected.quotaChapterOverride}</p><h2>{selected.title}</h2>{selected.trainingBlocked && <p className="warnbox">原稿内容待补充，暂不自动安排训练。</p>}<pre>{selected.content}</pre>{selected.checklist?.length ? <ul>{selected.checklist.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}<p className="muted">复习 {selected.totalReviews} 次 · {selected.trainingBlocked ? '仅供查询' : selected.totalReviews === 0 ? '尚未训练' : `下次 ${new Date(selected.dueDate).toLocaleString()}`} · 补漏 {selected.leaks?.length ?? 0} 项</p><button className="btn ghost" onClick={() => setLookup(null)}>收起</button></article>}
    <ul className="plain">{points.map(p => <li key={p.id}><button className="linkish" onClick={() => setLookup(p.id)}>{p.title}</button><span className="muted">{p.quotaChapterOverride} · {p.trainingBlocked ? '待补充 · 仅供查询' : p.totalReviews === 0 ? '未训练' : `已复习 ${p.totalReviews} 次`}</span></li>)}</ul>
  </div>
}

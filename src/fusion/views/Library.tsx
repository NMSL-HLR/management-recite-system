import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../state/store'
import { isLegacyManagement } from '../../general/data'
import { naturalTitleCompare } from '../../general/naturalSort'
import { compareGeneralPoints, policyPack, physiologyPack, physiologyPrefaceText } from '../../general/textbook'
import { emptyLibraryDraft, useFusion } from '../store'

export function FusionLibrary() {
  const f = useFusion()
  const app = useApp()
  const [subject, setSubject] = useState('运动生理学')
  const [discarding, setDiscarding] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const draft = f.libraryDraft
  const { title, content: text, checklist, chapter } = draft
  const patchDraft = (patch: Partial<typeof draft>) => f.setLibraryDraft({ ...draft, ...patch })
  const [showAdd, setShowAdd] = useState(Boolean(title || text || checklist || chapter))
  const [saved, setSaved] = useState('')
  const detail = useRef<HTMLElement>(null)
  const lookupButton = useRef<HTMLButtonElement | null>(null)
  const [lookup, setLookup] = useState<string | null>(null)
  const [chapterFilter, setChapterFilter] = useState('')
  const subjects = [...new Set(['运动生理学', '体育概论', ...f.state.general.points.map(p => p.subject).filter(s => !isLegacyManagement(s))])]
  const subjectPoints = useMemo(() => f.state.general.points.filter(p => subject === 'legacy' ? isLegacyManagement(p.subject) : p.subject === subject), [f.state.general.points, subject])
  const chapters = [...new Set(subjectPoints.map(p => p.quotaChapterOverride).filter((c): c is string => Boolean(c)))].sort(naturalTitleCompare)
  const points = useMemo(() => subjectPoints.filter(p => (!chapterFilter || p.quotaChapterOverride === chapterFilter) && (!deferredQuery.trim() || `${p.title}\n${p.content}\n${p.quotaChapterOverride ?? ''}\n${(p.checklist ?? []).join('\n')}`.includes(deferredQuery.trim()))).sort(compareGeneralPoints), [subjectPoints, chapterFilter, deferredQuery])
  useEffect(() => { if (lookup) { detail.current?.focus({ preventScroll: true }); detail.current?.scrollIntoView({ block: 'start' }) } }, [lookup])
  const selected = points.find(p => p.id === lookup)
  const chapterNote = subject === '运动生理学' ? (physiologyPack.chapterNotes as Record<string, string>)[chapterFilter] : null
  return <div className="stack"><h1>资料库</h1><p className="muted">查询与录入教材内容。每日训练从作战台开始。</p>
    <div className="actions"><button className="btn" onClick={() => app.setView('library')}>管理学 A/B 资料</button>{subjects.map(s => <button className={subject === s ? 'btn primary' : 'btn'} key={s} onClick={() => { setSubject(s); setLookup(null); setChapterFilter(''); setQuery(''); setSaved('') }}>{s}</button>)}{f.state.general.points.some(p => isLegacyManagement(p.subject)) && <button className={subject === 'legacy' ? 'btn primary' : 'btn'} onClick={() => { setSubject('legacy'); setLookup(null); setChapterFilter(''); setQuery(''); setSaved('') }}>旧管理学记录</button>}</div>
    {chapters.length > 0 && <label className="field">按章节查询<select aria-label="资料章节" value={chapterFilter} onChange={e => { setChapterFilter(e.target.value); setLookup(null) }}><option value="">全部章节（{subjectPoints.length}题）</option>{chapters.map(c => <option key={c}>{c}</option>)}</select></label>}
    {chapterNote && <aside className="card"><p className="kicker">原稿章前说明</p><pre>{chapterNote}</pre></aside>}
    {subjectPoints.some(p => p.sourcePackId === physiologyPack.packId) && <details><summary>《运动生理学》原稿说明与待补充题</summary><p>本次内置8章60题，其中56题进入训练，4题含“内容待补充”，暂仅供查询。核对清单取自原文小标题，不是自动评分。正文按原稿保存，未进行知识准确性审核或补写。</p><pre>{physiologyPrefaceText}</pre></details>}
    {subject === '体育概论' && <details><summary>政策热点班 · 五讲资料说明</summary><p>15道作业参与训练，5组补漏骨架仅供查询。正文按上传原稿保留，政策时效与事实未在录入时另行核验。</p><pre>{policyPack.preface}</pre></details>}
    <label className="field">搜索当前科目<input aria-label="查找资料" placeholder="查标题、正文、章节或核对要点" value={query} onChange={e => { setQuery(e.target.value); setLookup(null) }} /></label>
    <p className="muted" role="status">{subject === 'legacy' ? '旧管理学' : subject} · 显示 {points.length} / {subjectPoints.length} 题</p>
    {(query || chapterFilter) && <button className="btn ghost" onClick={() => { setQuery(''); setChapterFilter(''); setLookup(null) }}>清除筛选</button>}
    {saved && <p role="status">{saved}</p>}
    {subject === 'legacy' && <p className="warnbox">旧管理学内容与历史评分保留查询，不自动映射到 MRC，也不重复派题。</p>}
    {subject !== 'legacy' && <button className="btn" onClick={() => { if (!showAdd && !(title || text || checklist || chapter)) patchDraft({ subject }); setShowAdd(!showAdd) }}>{showAdd ? '收起录入' : '录入教材条目'}</button>}
    {showAdd && <form className="card stack" onSubmit={e => {
      e.preventDefault()
      if (f.addPoint({ subject: draft.subject, title, content: text, checklist: [...new Set(checklist.split('\n').map(x => x.trim()).filter(Boolean))], chapter })) { setSubject(draft.subject); setQuery(title.trim()); setChapterFilter(''); f.setLibraryDraft(emptyLibraryDraft); setShowAdd(false); setSaved('条目已保存。教练会按今日预算和章节范围安排训练。') }
    }}><h2>录入到 {draft.subject}</h2><label className="field">录入科目<select aria-label="录入科目" value={draft.subject} onChange={e => patchDraft({ subject: e.target.value })}>{subjects.map(s => <option key={s}>{s}</option>)}</select></label><p className="muted">切换查询科目不会改变这份草稿的归属。页面间切换会保留草稿；关闭或刷新前请先保存。</p><label className="field">标题<input required value={title} onChange={e => patchDraft({ title: e.target.value })} /></label><label className="field">正文<textarea required rows={8} value={text} onChange={e => patchDraft({ content: e.target.value })} /></label><label className="field">核对要点（每行一条，可留空）<textarea rows={4} value={checklist} onChange={e => patchDraft({ checklist: e.target.value })} /></label><label className="field">章节（可留空）<input value={chapter} onChange={e => patchDraft({ chapter: e.target.value })} placeholder="例如：第六章" /></label><button className="btn primary" type="submit">保存条目</button><button className="btn ghost" type="button" disabled={!(title || text || checklist || chapter)} onClick={() => setDiscarding(true)}>放弃录入草稿</button>{discarding && <section className="warnbox" aria-label="放弃录入确认"><p>仅清除未保存的录入内容，已有题目和记录保留。</p><button className="btn" type="button" onClick={() => setDiscarding(false)}>继续编辑</button><button className="btn danger" type="button" onClick={() => { f.setLibraryDraft(emptyLibraryDraft); setShowAdd(false); setDiscarding(false) }}>确认放弃录入</button></section>}</form>}
    {points.length === 0 && <section className="card"><p>{subjectPoints.length ? '没有找到匹配的资料，试试更短的关键词或清除章节筛选。' : '这个科目还没有资料。'}</p>{!subjectPoints.length && <><p className="muted">可以录入教材，或导入旧程序导出的 JSON。</p><button className="btn" onClick={() => f.open('settings')}>前往导入资料</button></>}</section>}

    {[...new Set(points.map(p => p.quotaChapterOverride || '未分章'))].map(chapter => <section key={chapter}><h2>{chapter}</h2><ul className="plain">{points.filter(p => (p.quotaChapterOverride || '未分章') === chapter).map(p => <li key={p.id}><button className="linkish" onClick={e => { lookupButton.current = e.currentTarget; setLookup(p.id) }}>{p.title}</button><span className="muted library-state">{p.trainingBlocked ? '仅供查询' : p.totalReviews === 0 ? '未训练' : p.dueDate <= app.now ? '已到期' : `已复习 ${p.totalReviews} 次`}</span>
{selected?.id === p.id && <article ref={detail} tabIndex={-1} className="card library-detail" aria-label="资料详情"><p className="kicker">{selected.quotaChapterOverride}</p><h2>{selected.title}</h2>{selected.trainingBlocked && <p className="warnbox">{typeof selected.referenceReason === 'string' ? selected.referenceReason : '原稿内容待补充，暂不自动安排训练。'}</p>}<pre>{selected.content}</pre>{selected.checklist?.length ? <ul>{selected.checklist.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}<p className="muted">复习 {selected.totalReviews} 次 · {selected.trainingBlocked ? '仅供查询' : selected.totalReviews === 0 ? '尚未训练' : `下次 ${new Date(selected.dueDate).toLocaleString()}`} · 补漏 {selected.leaks?.length ?? 0} 项</p><button className="btn ghost" onClick={() => { setLookup(null); lookupButton.current?.focus() }}>收起</button></article>}
    </li>)}</ul></section>)}
  </div>
}

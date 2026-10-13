import { useEffect } from 'react'
import { useApp } from '../state/store'
import { Archive } from '../views/Archive'
import { Exam } from '../views/Exam'
import { Library } from '../views/Library'
import { Mistakes } from '../views/Mistakes'
import { Recall } from '../views/Recall'
import { Settings } from '../views/Settings'
import { Methodology } from '../views/Methodology'
import { ReadingToolbar } from '../components/ReadingToolbar'
import { useFusion } from './store'
import { FusionToday } from './views/Today'
import { FusionLibrary } from './views/Library'
import { GeneralTraining } from './views/GeneralTraining'
import { FusionSettingsView } from './views/Settings'
import { FusionRecords } from './views/Records'
import type { Panel } from './types'
import { Icon } from './Icon'
import { SKINS, useMemoryTheme } from './theme'
import { RollbackDialog } from './components'

const NAV: { id: Panel; label: string }[] = [{ id: 'today', label: '今日训练' }, { id: 'library', label: '资料库' }, { id: 'records', label: '学习记录' }, { id: 'settings', label: '设置数据' }]
export function FusionApp() {
  const f = useFusion()
  const app = useApp()
  const theme = useMemoryTheme()
  const activePanel = f.panel === 'general' ? 'today' : f.panel === 'mrc'
    ? app.state.view === 'library' ? 'library' : ['archive', 'mistakes'].includes(app.state.view) ? 'records' : ['settings', 'method', 'exam'].includes(app.state.view) ? 'settings' : 'today'
    : f.panel
  const themeButton = <button className="btn theme-switch" onClick={theme.cycle} aria-label={`当前${SKINS[theme.skin].label}，切换到${SKINS[SKINS[theme.skin].next].label}`}><Icon name="palette" /><span>{SKINS[theme.skin].label}</span></button>
  const navigation = NAV.map((item, index) => <button key={item.id} aria-current={activePanel === item.id ? 'page' : undefined} className={activePanel === item.id ? 'on' : ''} onClick={() => f.open(item.id)}><Icon name={item.id as 'today' | 'library' | 'records' | 'settings'} /><span>{item.label}</span><small>Alt+{index + 1}</small></button>)
  const routeKey = f.panel === 'mrc' ? `mrc:${app.state.view}:${app.state.view === 'recall' ? app.state.recall?.phase : ''}` : f.panel === 'general' ? `general:${f.state.session?.phase}` : f.panel
  useEffect(() => {
    const main = document.getElementById('study-main')
    main?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
    const heading = main?.querySelector('h1')?.textContent
    document.title = `${heading || '今日训练'} · 346 记忆引擎`
  }, [routeKey])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || event.repeat || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector('dialog[open]') || target?.closest('input,textarea,select,[contenteditable="true"]')) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < NAV.length) { event.preventDefault(); f.open(NAV[index].id) }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); app.updateSettings({ theme: app.state.settings.theme === 'dark' ? 'light' : 'dark' }) }
    }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  }, [f, app])
  return <div className={`shell memory-shell${app.state.settings.focusReading ? ' focus-reading' : ''}`}>
    <a className="skip-link" href="#study-main">跳到学习内容</a>
    <aside className="side"><div className="brand"><span className="brand-mark"><Icon name="book" size={26} /></span><strong>346 记忆引擎</strong><small>SPACED REPETITION</small></div><nav aria-label="主导航">{navigation}</nav><div className="side-bottom">{themeButton}<p>管理学 · 生理学 · 体育概论<br />本地学习，按自己的节奏。</p></div></aside>
    <header className="mobile-topbar"><strong>346 记忆引擎</strong>{themeButton}</header>
    <main id="study-main" tabIndex={-1}>
      {theme.warning && <p className="warnbox" role="status">{theme.warning}</p>}
      {app.warning && <aside className="warnbox banner"><p>{app.warning}</p><button className="btn" onClick={app.dismissWarning}>知道了</button></aside>}
      {f.message && <aside className="warnbox banner" role={/失败|冲突|无法|损坏|错误|受保护/.test(f.message) ? 'alert' : 'status'}><p>{f.message}</p><button className="btn" onClick={f.dismiss}>知道了</button></aside>}
      {f.panel === 'today' && <FusionToday />}
      {f.panel === 'library' && <FusionLibrary />}
      {f.panel === 'records' && <FusionRecords />}
      {f.panel === 'settings' && <FusionSettingsView />}
      {f.panel === 'general' && <GeneralTraining />}
      {f.panel === 'mrc' && <>
        <button className="btn ghost module-back" onClick={() => f.open(activePanel === 'today' ? 'today' : activePanel as Panel)}>{activePanel === 'library' ? '返回全科资料库' : activePanel === 'records' ? '返回学习记录' : activePanel === 'settings' ? '返回设置与备份' : '回到全科作战台'}</button>
        {app.state.view === 'recall' && <Recall />}{app.state.view === 'library' && <Library />}
        {app.state.view === 'archive' && <Archive />}{app.state.view === 'exam' && <Exam />}
        {app.state.view === 'mistakes' && <Mistakes />}{app.state.view === 'method' && <Methodology />}
        {app.state.view === 'settings' && <Settings />}
      </>}
    </main>
    <nav className="mobile-nav" aria-label="移动端主导航">{navigation}</nav>
    {f.panel === 'mrc' && <ReadingToolbar />}
    <RollbackDialog />
  </div>
}

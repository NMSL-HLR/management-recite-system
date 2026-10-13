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

const NAV: { id: Panel; label: string }[] = [{ id: 'today', label: '今日训练' }, { id: 'library', label: '资料库' }, { id: 'records', label: '学习记录' }, { id: 'settings', label: '设置数据' }]
export function FusionApp() {
  const f = useFusion()
  const app = useApp()
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!event.altKey || target?.matches('input,textarea,select,[contenteditable]')) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < NAV.length) { event.preventDefault(); f.open(NAV[index].id) }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); app.updateSettings({ theme: app.state.settings.theme === 'dark' ? 'light' : 'dark' }) }
    }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  }, [f, app])
  return <div className={`shell${app.state.settings.focusReading ? ' focus-reading' : ''}`}>
    <aside className="side"><p className="brand">346 全科备考教练<br /><small>管理学 · 生理学 · 体育概论</small></p><nav>{NAV.map((item, index) => <button key={item.id} className={f.panel === item.id || (item.id === 'today' && ['general', 'mrc'].includes(f.panel) && app.state.view === 'recall') ? 'on' : ''} onClick={() => f.open(item.id)}><small>Alt+{index + 1}</small>{item.label}</button>)}</nav></aside>
    <main>
      {app.warning && <aside className="warnbox banner"><p>{app.warning}</p><button className="btn" onClick={app.dismissWarning}>知道了</button></aside>}
      {f.message && <aside className="warnbox banner" role="alert"><p>{f.message}</p><button className="btn" onClick={f.dismiss}>知道了</button></aside>}
      {f.panel === 'today' && <FusionToday />}
      {f.panel === 'library' && <FusionLibrary />}
      {f.panel === 'records' && <FusionRecords />}
      {f.panel === 'settings' && <FusionSettingsView />}
      {f.panel === 'general' && <GeneralTraining />}
      {f.panel === 'mrc' && <>
        <button className="btn ghost module-back" onClick={() => f.open('today')}>回到全科作战台</button>
        {app.state.view === 'recall' && <Recall />}{app.state.view === 'library' && <Library />}
        {app.state.view === 'archive' && <Archive />}{app.state.view === 'exam' && <Exam />}
        {app.state.view === 'mistakes' && <Mistakes />}{app.state.view === 'method' && <Methodology />}
        {app.state.view === 'settings' && <Settings />}
      </>}
    </main>
    {f.panel === 'mrc' && <ReadingToolbar />}
  </div>
}

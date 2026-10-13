import { useState } from 'react'
import { useApp } from '../../state/store'
import { isLegacyManagement } from '../../general/data'
import { policyFor } from '../planner'
import { useFusion } from '../store'

export function FusionSettingsView() {
  const f = useFusion()
  const app = useApp()
  const [readingFile, setReadingFile] = useState(false)
  const subjects = [...new Set(['体育管理学', '运动生理学', '体育概论', ...f.state.general.points.map(p => p.subject).filter(s => !isLegacyManagement(s))])]
  return <div className="stack"><h1>设置与备份</h1>
    <section className="card"><h2>全科安排</h2><label className="field">每日总预算（分钟）<select value={f.state.day.budgetMinutes} onChange={e => f.setMinutes(Number(e.target.value))}>{[15, 30, 45, 60, 90, 120, 180].map(n => <option key={n}>{n}</option>)}</select></label>
      <p className="muted">到期复习优先；同级任务按科目权重与当天已分配时间安排。新学配额按开始的任务累计。章节范围只限制新学，不挡住复习。</p>
      <div className="table-wrap"><table><thead><tr><th>科目</th><th>时间权重</th><th>每日新学上限</th><th>新学章节上限</th></tr></thead><tbody>{subjects.map(subject => { const p = policyFor(f.state, subject); return <tr key={subject}><td>{subject}</td><td><input aria-label={`${subject}权重`} type="number" min={1} max={10} value={p.weight} onChange={e => f.setPolicy(subject, { weight: Number(e.target.value) })} /></td><td><input aria-label={`${subject}新学上限`} type="number" min={0} max={50} value={p.newCap} onChange={e => f.setPolicy(subject, { newCap: Number(e.target.value) })} /></td><td><input aria-label={`${subject}章节上限`} type="number" min={0} max={20} value={p.chapterCap} onChange={e => f.setPolicy(subject, { chapterCap: Number(e.target.value) })} /></td></tr> })}</tbody></table></div>
      <p className="muted">新学上限 0 表示暂停新学；章节上限 0 表示不限制章节。修改配额会重新选择该科今日章节，已占用预算不会清零。</p>
    </section>
    <section className="card"><h2>备份与恢复</h2><p>支持旧记忆引擎 JSON、MRC JSON，以及本版全科整包。预览后确认才写入。</p>
      <div className="actions"><button className="btn primary" onClick={f.exportAll}>导出全科整包</button><button className="btn" onClick={f.exportGeneral}>导出记忆模块 JSON</button><button className="btn" onClick={app.exportJson}>导出管理学 JSON</button><button className="btn ghost" onClick={f.rollback}>恢复整包导入前备份</button></div>
      <label className="field">选择备份文件<input data-testid="fusion-import" type="file" accept=".json,application/json" disabled={readingFile} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setReadingFile(true); try { f.stageImport(await file.text()) } finally { setReadingFile(false) } }} /></label>
      {f.importPlan && <div className="warnbox" role="status"><h3>导入预览 · {f.importPlan.kind}</h3><p>{f.importPlan.summary}</p><div className="actions"><button className="btn primary" onClick={f.confirmImport}>确认整合导入</button><button className="btn" onClick={f.cancelImport}>取消导入</button></div></div>}
      <p className="muted">新 HTML 可能无法访问旧文件的浏览器存储。请从旧程序导出 JSON 后导入。整包保存两种训练记录与未完成草稿；原版单模块 JSON 按各自兼容规则导入。</p>
    </section>
    <section className="card"><h2>管理学工具与阅读</h2><div className="actions"><button className="btn" onClick={() => app.setView('settings')}>管理学详细设置</button><button className="btn" onClick={() => app.setView('exam')}>管理学闭卷考试</button><button className="btn" onClick={() => app.setView('method')}>训练方法</button><button className="btn" onClick={() => app.updateSettings({ theme: app.state.settings.theme === 'dark' ? 'light' : 'dark' })}>切换明暗主题</button></div><p className="muted">管理学原复测规则、提示与考试继续由 MRC 处理。通用模块使用旧版 FSRS-6 核心；旧版配额由上方全科安排接管。</p></section>
  </div>
}

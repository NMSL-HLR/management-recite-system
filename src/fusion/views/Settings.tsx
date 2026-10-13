import { useState } from 'react'
import { useApp } from '../../state/store'
import { isLegacyManagement } from '../../general/data'
import { policyFor } from '../planner'
import { useFusion } from '../store'
import { BudgetSelect, PolicyField } from '../components'

export function FusionSettingsView() {
  const f = useFusion()
  const app = useApp()
  const [readingFile, setReadingFile] = useState(false)
  const [fileError, setFileError] = useState('')
  const subjects = [...new Set(['体育管理学', '运动生理学', '体育概论', ...f.state.general.points.map(p => p.subject).filter(s => !isLegacyManagement(s))])]
  return <div className="stack"><h1>设置与备份</h1>
    <section className="card"><h2>全科安排</h2><label className="field">每日默认预算（同时应用到今天）<BudgetSelect label="每日默认预算" value={f.state.settings.minutes} onChange={n => f.setMinutes(n, 'daily')} /></label><p className="muted">今天的预算是 {f.state.day.budgetMinutes} 分钟。临时调整可在今日作战台进行，不影响明天。</p>
      <p className="muted">到期复习优先；同级任务按科目权重与当天已分配时间安排。新学配额按开始的任务累计。章节范围只限制新学，不挡住复习。</p>
      <div className="policy-grid">{subjects.map(subject => { const p = policyFor(f.state, subject); return <fieldset key={subject}><legend>{subject}</legend><label className="field">时间权重<PolicyField label={`${subject}权重`} integer={false} min={1} max={10} value={p.weight} onCommit={value => f.setPolicy(subject, { weight: value })} /></label><label className="field">每日新学上限<PolicyField label={`${subject}新学上限`} min={0} max={50} value={p.newCap} onCommit={value => f.setPolicy(subject, { newCap: value })} /></label><label className="field">新学章节上限<PolicyField label={`${subject}章节上限`} min={0} max={20} value={p.chapterCap} onCommit={value => f.setPolicy(subject, { chapterCap: value })} /></label></fieldset> })}</div>
      <p className="muted">输入后按 Enter 或离开输入框保存，Esc 撤回当前输入。空值和超出范围的值不会覆盖原设置。</p>
      <p className="muted">新学上限 0 表示暂停新学；章节上限 0 表示不限制章节。修改配额会重新选择该科今日章节，已占用预算不会清零。</p>
    </section>
    <section className="card"><h2>备份与恢复</h2><p>支持教材资料、旧记忆引擎 JSON、MRC JSON，以及本版全科整包。预览后确认才写入。</p>
      <div className="actions"><button className="btn primary" onClick={f.exportAll}>导出全科整包</button></div><p className="muted">日常备份与换设备使用全科整包，保存两科模块的记录和未完成草稿。</p>
      <label className="field">选择备份文件<input data-testid="fusion-import" type="file" accept=".json,application/json" disabled={readingFile} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setReadingFile(true); setFileError(''); f.cancelImport(); try { f.stageImport(await file.text()) } catch { setFileError('文件读取失败，请重新选择可读取的 JSON 文件。当前记录未改动。') } finally { setReadingFile(false) } }} /></label>
      {fileError && <p className="warnbox" role="alert">{fileError}</p>}
      {readingFile && <p role="status">正在读取文件，尚未修改学习记录…</p>}
      {f.importPlan && <div className="warnbox" role="status"><h3>导入预览 · {f.importPlan.kind}</h3><p>{f.importPlan.summary}</p><div className="actions"><button className="btn primary" onClick={f.confirmImport}>确认整合导入</button><button className="btn" onClick={f.cancelImport}>取消导入</button></div></div>}
      <p className="muted">新 HTML 可能无法访问旧文件的浏览器存储。请从旧程序导出 JSON 后导入。整包保存两种训练记录与未完成草稿；原版单模块 JSON 按各自兼容规则导入。</p>
      <details><summary>单模块兼容导出与恢复旧备份</summary><div className="actions"><button className="btn" onClick={f.exportGeneral}>导出记忆模块 JSON</button><button className="btn" onClick={app.exportJson}>导出管理学 JSON</button><button className="btn ghost" onClick={f.rollback}>恢复整包导入前备份</button></div><p className="muted">恢复旧备份会替换当前记录，需再次确认。</p></details>
    </section>
    <section className="card"><h2>管理学工具与阅读</h2><div className="actions"><button className="btn" onClick={() => app.setView('settings')}>管理学详细设置</button><button className="btn" onClick={() => app.setView('exam')}>管理学闭卷考试</button><button className="btn" onClick={() => app.setView('method')}>训练方法</button><button className="btn" onClick={() => app.updateSettings({ theme: app.state.settings.theme === 'dark' ? 'light' : 'dark' })}>切换明暗主题</button></div><p className="muted">管理学原复测规则、提示与考试继续由 MRC 处理。通用模块使用旧版 FSRS-6 核心；旧版配额由上方全科安排接管。</p></section>
  </div>
}

import { useState } from 'react'
import { useApp } from '../state/store'
import { useOptionalFusion } from '../fusion/store'
import { CONTENT_BACKUP_KEY, type RecoveryEntry } from '../state/contentRecovery'
import { downloadJson, downloadText, localDateStamp } from '../browser/download'
import { EVIDENCE_LABEL } from '../engine/labels'

export function MigrationReview() {
  const app = useApp(), fusion = useOptionalFusion()
  const [message, setMessage] = useState('')
  const download = (action: () => void | false) => {
    try { if (action() !== false) setMessage('下载已发起，请在浏览器下载列表中确认。') }
    catch { setMessage('下载未能发起，请保留当前浏览器数据，稍后重试。') }
  }
  return <section className="card"><h2>迁移待查 {app.state.migrationReview.length}</h2>
    <p>找不到原题的完整历史记录仍保留。不可继续的草稿、考试与任务在这里查阅，不影响今天继续训练；导出全科整包也会包含这些内容。</p>
    <button className="btn" onClick={() => download(() => {
      const raw = localStorage.getItem(CONTENT_BACKUP_KEY)
      if (!raw) { setMessage('本浏览器尚无自动迁移前备份。'); return false }
      downloadText(raw, `346-Before-Content-Repair-${localDateStamp()}.json`, 'application/json')
    })}>导出迁移前原始记录</button>
    {message && <p role="status">{message}</p>}
    {(app.state.migrationReview as RecoveryEntry[]).map((row, index) => {
      const attempt = app.state.attempts.find(a => a.id === row.attemptId)
      const recovery = row.recovery
      const recalled = recovery?.recall as { draft?: unknown; restatement?: unknown } | undefined
      return <details key={`${row.attemptId}:${index}`}><summary>{row.itemId} · {row.note}</summary>
        {attempt && <><p>历史证据：{EVIDENCE_LABEL[attempt.evidenceState]}</p><h3>闭卷作答</h3><pre>{attempt.preRevealDraft?.text || '（无草稿）'}</pre><h3>撤提示复述</h3><pre>{attempt.restatementText || '（无复述）'}</pre><p>{attempt.userNote}</p></>}
        {recalled && <><h3>原草稿</h3><pre>{typeof recalled.draft === 'string' ? recalled.draft : '（无草稿）'}</pre><h3>原复述</h3><pre>{typeof recalled.restatement === 'string' ? recalled.restatement : '（无复述）'}</pre></>}
        {Boolean(recovery?.exam) && <p>整场考试作答已保留，可导出原始内容查阅。</p>}
        {!attempt && !recovery && <p>这条旧待查记录只有摘要。旧版已删除的完整内容无法自动重建，请从更早的备份恢复。</p>}
        <button className="btn" onClick={() => download(() => downloadJson({ review: row, ...(attempt ? { attempt } : {}) }, `346-Migration-Review-${index + 1}.json`))}>导出这条待查内容</button>
      </details>
    })}
    {!!fusion?.state.unavailableTasks?.length && <details><summary>已移出的旧任务（{fusion.state.unavailableTasks.length}）</summary><ul>{fusion.state.unavailableTasks.map(t => <li key={t.id}>{t.title} · 原预计 {t.estimatedMinutes} 分钟</li>)}</ul><p>原任务信息随全科备份保存，已不占用今日预算。</p></details>}
  </section>
}

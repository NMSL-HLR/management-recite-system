import legacyIndex from '../data/generated/management-legacy-index.json'
import { content, getItem } from '../content'
import { EvidenceBadge } from '../components/render'
import { buildDashboard } from '../engine/stats'
import { useApp } from '../state/store'

const oldTitle = (id: string) => (legacyIndex as Record<string, { title: string }>)[id]?.title

export function Archive() {
  const app = useApp()
  const dash = buildDashboard(content.items, app.state.attempts, app.now)
  const byChapter = new Map<string, { independent: number; minor_omission: number; cue_dependent: number; relearned: number }>()
  for (const attempt of app.state.attempts) {
    const item = getItem(attempt.itemId)
    const key = item?.chapter || '旧版教材（不计入新版题目成绩）'
    const row = byChapter.get(key) || { independent: 0, minor_omission: 0, cue_dependent: 0, relearned: 0 }
    row[attempt.evidenceState] += 1
    byChapter.set(key, row)
  }
  return (
    <div className="stack">
      <h1>学习档案</h1>
      <p className="muted">包含新旧教材历史。旧 A/B 册成绩保留，不计入 ultimate 新题；未完成旧草稿与考试可在管理学详细设置的迁移待查查看。</p>
      {app.state.notes.some(n => !getItem(n.itemId)) && <section className="card"><h2>旧版批注</h2>{app.state.notes.filter(n => !getItem(n.itemId)).map(n => <details key={n.itemId}><summary>{oldTitle(n.itemId) || n.itemId}</summary><pre>{n.text}</pre></details>)}</section>}
      <section className="card">
        <h2>按天的证据</h2><p className="muted">色条与计数依次为：独立提取 / 基本提取 / 提示依赖 / 重新学习；次数不代表掌握比例。</p>
        {dash.byDay.length === 0 ? <p className="muted">还没有记录。</p> : (
          <ul className="bars">
            {dash.byDay.map((day) => (
              <li key={day.day}>
                <span>{day.day}</span>
                <i className="evidence-independent" style={{ flex: day.independent || 0.001 }} title={`独立 ${day.independent}`} />
                <i className="evidence-minor_omission" style={{ flex: day.minor_omission || 0.001 }} title={`基本 ${day.minor_omission}`} />
                <i className="evidence-cue_dependent" style={{ flex: day.cue_dependent || 0.001 }} title={`提示 ${day.cue_dependent}`} />
                <i className="evidence-relearned" style={{ flex: day.relearned || 0.001 }} title={`重学 ${day.relearned}`} />
                <small>{day.independent}/{day.minor_omission}/{day.cue_dependent}/{day.relearned}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>章节分布</h2>
        <ul className="plain">
          {[...byChapter.entries()].map(([chapter, row]) => (
            <li key={chapter}>{chapter} · 独立 {row.independent} · 基本 {row.minor_omission} · 提示 {row.cue_dependent} · 重学 {row.relearned}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>草稿历史</h2>
        <ul className="drafts">
          {[...app.state.attempts].reverse().slice(0, 30).map((attempt) => {
            const item = getItem(attempt.itemId)
            return (
              <li key={attempt.id}>
                <header>
                  <strong>{item?.title || `旧版 · ${oldTitle(attempt.itemId) || attempt.itemId}`}</strong>
                  <EvidenceBadge state={attempt.evidenceState} />
                  <small>{new Date(attempt.finishedAt).toLocaleString()}</small>
                </header>
                <details><summary>查看本次草稿</summary><pre>{attempt.preRevealDraft?.text || '（无揭晓前草稿）'}</pre>
                {attempt.restatementText ? <p>撤提示后：{attempt.restatementText}</p> : null}</details>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

import { AnswerReview, HandwritingHelp } from '../components/AnswerReview'
import { localTime } from '../browser/format'
import type { ReactNode } from 'react'
import { RecallTimer } from '../components/RecallTimer'
import { CoachNext } from '../components/CoachNext'
import { content, getItem } from '../content'
import { assessExamReadiness } from '../engine/evidence'
import { DataTable, EvidenceBadge, RedlineCard, SectionList, Signals } from '../components/render'
import { HINT_LABEL } from '../engine/labels'
import { useApp } from '../state/store'
import type { StudyItem } from '../types'

export function Recall() {
  const app = useApp()
  const recall = app.state.recall
  if (!recall) {
    const queue = content.items.filter((item) => item.coreA || (item.kind === 'skeleton' && !item.fullTextForLookup)).slice(0, 12)
    return (
      <div className="stack">
        <h1>主动提取</h1>
        <p>先写揭晓前的骨架。提示只来自已确认的 B 册关系，或这道题自己的源文小标题。</p>
        <ul className="plain">
          {queue.map((item) => (
            <li key={item.id}>
              <button className="linkish" type="button" onClick={() => app.startRecallItem(item.id)}>{item.chapter} · {item.title}</button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const item = getItem(recall.itemId)
  if (!item) return <p>题目不在当前资料里。</p>
  const ctx = app.hintFor(item.id)
  const related = ctx.confirmedSkeletonIds.map((id) => getItem(id)).filter((row): row is StudyItem => Boolean(row))
  const redlines = ctx.confirmedRedlineIds.map((id) => getItem(id)).filter((row): row is StudyItem => Boolean(row))
  const readiness = assessExamReadiness(item.checkPoints, recall.checkedPointIds)
  const stepLabels = ['无提示', '已确认B骨架', '源文小标题', ctx.keywords.length ? '已审核关键词' : '关键词（跳过）', '对照原文', '撤提示复述']
  const activeStep = recallStepIndex(recall.phase)
  return (
    <div className="stack recall-page">
      <header className="page-head">
        <div>
          <p className="kicker">{item.source === 'A' ? (item.coreA ? 'A册完整题' : 'A册附录完整题') : item.fullTextForLookup ? 'B册骨架题 · 全文供查阅' : item.kind === 'redline' ? '答题红线' : 'B册骨架题'}</p>
          <h1>{item.title}</h1>
          <Signals item={item} />
        </div>
        <div className="actions">
          {app.state.settings.showTimer ? <RecallTimer startedAt={recall.startedAt} finishedAt={recall.phase === 'done' ? recall.result?.finishedAt : undefined} /> : null}
          <button className="btn ghost" type="button" onClick={() => app.setView('today')}>回到今日，稍后继续</button>
        </div>
      </header>
      {['b_skeleton', 'headings', 'keywords'].includes(recall.phase) && recall.frozenDraft && <details className="card"><summary>查看已冻结的草稿</summary><pre className="frozen-draft">{recall.frozenDraft.text || '（空）'}</pre></details>}
      <ol className="steps">
        {stepLabels.map((label, index) => (
          <li key={label} className={index === activeStep ? 'on' : index < activeStep ? 'done' : ''}>{label}</li>
        ))}
      </ol>
      {recall.phase === 'draft' ? (
        <section className="card">
          <h2>闭卷草稿</h2><HandwritingHelp />
          <p className="muted">现在只留题目。先把能想起的骨架写下来，揭晓后不能回改这一稿。Ctrl+Enter 可提交；直接看全文会按原规则记录为重新学习。</p>
          <textarea aria-label="闭卷草稿" value={recall.draft} onChange={(event) => app.patchRecall({ draft: event.target.value })} rows={10} onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); app.recallSubmit() } }} placeholder={'1. 定义\n2. 特点\n3. 过程\n4. 体育例证'} />
          <div className="actions">
            <button className="btn primary" type="button" onClick={app.recallSubmit}>无提示交卷，去核对</button>
            <button className="btn" type="button" onClick={app.recallHint}>需要提示</button>
            <button className="btn ghost" type="button" onClick={app.recallReveal}>直接看完整原文</button>
          </div>
        </section>
      ) : null}
      {recall.phase === 'b_skeleton' ? (
        <HintPane title="已确认的 B 册骨架（源文）" onMore={app.recallHint} onReady={app.recallCompare} onFull={app.recallReveal}>
          {related.map((row) => (
            <article key={row.id}>
              <h3>{row.title}</h3>
              <ul>{row.reviewedHeadingHints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
            </article>
          ))}
        </HintPane>
      ) : null}
      {recall.phase === 'headings' ? (
        <HintPane title="小标题提示（源文）" onMore={app.recallHint} onReady={app.recallCompare} onFull={app.recallReveal}>
          <ol>{item.reviewedHeadingHints.map((hint) => <li key={hint}>{hint}</li>)}</ol>
          {!ctx.keywords.length ? <p className="muted">这道题没有已审核关键词，下一级就是完整原文。</p> : null}
        </HintPane>
      ) : null}
      {recall.phase === 'keywords' ? (
        <HintPane title="关键词提示（已审核源文）" onMore={app.recallHint} onReady={app.recallCompare} onFull={app.recallReveal}>
          <ul>{ctx.keywords.map((word) => <li key={word}>{word}</li>)}</ul>
        </HintPane>
      ) : null}
      {recall.phase === 'compare' ? (
        <section className="stack">
          <AnswerReview key={`${recall.itemId}:${recall.startedAt}`} item={item} draft={recall.frozenDraft?.text ?? ''} checked={recall.checkedPointIds} onChange={checkedPointIds => app.patchRecall({ checkedPointIds })} disabled={app.storageBlocked} onContinue={app.recallRestate} continueLabel="核对完成，去撤提示复述" />
          <div className="compare">
            <article className="card draft-pane">
              <h2>揭晓前草稿</h2>
              <pre className="frozen-draft">{recall.frozenDraft?.text || '（空）'}</pre>
            </article>
            <article className="card">
              <h2>原资料</h2>
              {item.kind === 'redline' ? <RedlineCard item={item} /> : <SectionList sections={item.sections} />}
              {item.tables.map((table, index) => <DataTable key={index} table={table} />)}
            </article>
          </div>
          <article className="card">
            <h2>逐点核对</h2>
            <p className="muted">已核对 {item.checkPoints.filter(p => recall.checkedPointIds.includes(p.id)).length} / {item.checkPoints.length} 项</p>
            <p className="muted">勾的是揭晓前草稿里已经有的，不是看完答案后的感觉。</p>
            <button className="btn ghost" type="button" onClick={() => app.patchRecall({ checkedPointIds: [...new Set([...recall.checkedPointIds, ...item.checkPoints.filter((p) => p.level === 1 && p.role !== 'sports' && p.role !== 'expansion').map((p) => p.id)])] })}>主体小标题都写到了</button>
<button className="btn ghost" type="button" onClick={() => app.patchRecall({ checkedPointIds: [] })}>清空本轮核对勾选</button>
            {groups(item).map(([group, points]) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                {points.map((point) => (
                  <label key={point.id} className="check">
                    <input
                      type="checkbox"
                      checked={recall.checkedPointIds.includes(point.id)}
                      onChange={(event) => {
                        const set = new Set(recall.checkedPointIds)
                        if (event.target.checked) set.add(point.id)
                        else set.delete(point.id)
                        app.patchRecall({ checkedPointIds: [...set] })
                      }}
                    />
                    <span>{point.role === 'expansion' ? '扩展 · ' : point.role === 'sports' ? '体育例证 · ' : ''}{point.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <label className="field">术语写错（一行一条，写你写成的词）
              <textarea rows={3} value={recall.termErrorDraft} onChange={(event) => app.patchRecall({ termErrorDraft: event.target.value })} />
            </label>
            <aside className={`warnbox ${readiness.examReady ? '' : ''}`}>
              <strong>答案完整性（考场参考，≠ 记忆证据）</strong>
              <p>{readiness.message}</p>
              {readiness.sportsExampleMissing ? <p className="muted">体育例证：尚未确认写出</p> : null}
              {readiness.examReady ? <p className="muted">考场答案要素：已齐备</p> : <p className="muted">考场答案要素：仍有缺口</p>}
            </aside>
            {redlines.length ? (
              <fieldset>
                <legend>已确认的相关红线</legend>
                {redlines.map((row) => (
                  <label key={row.id} className="check">
                    <input
                      type="checkbox"
                      checked={recall.redlineErrorIds.includes(row.title)}
                      onChange={(event) => {
                        const set = new Set(recall.redlineErrorIds)
                        if (event.target.checked) set.add(row.title)
                        else set.delete(row.title)
                        app.patchRecall({ redlineErrorIds: [...set] })
                      }}
                    />
                    <span>我踩了：{row.title}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="actions">
              <button className="btn primary" type="button" onClick={app.recallRestate}>进入撤提示复述</button>
            </div>
          </article>
        </section>
      ) : null}
      {recall.phase === 'restate' ? (
        <section className="card">
          <h2>撤掉提示后再写一遍</h2>
          <p>只留题目。这里通过，也只说明刚看完能重现，不会把本轮改成首次无提示独立提取。</p>
          <h3>{item.title}</h3><HandwritingHelp />
          <textarea rows={8} value={recall.restatement} onChange={(event) => app.patchRecall({ restatement: event.target.value })} />
          <div className="choice">
            <span>主观信心（1 很没把握 · 2 较没把握 · 3 一般 · 4 较有把握 · 5 很有把握）</span>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button key={n} type="button" aria-pressed={(recall.selfConfidence ?? 3) === n} className={(recall.selfConfidence ?? 3) === n ? 'btn primary' : 'btn'} onClick={() => app.patchRecall({ selfConfidence: n })}>{n}</button>
            ))}
          </div>
          <p className="muted">未选择时按原规则记录为 3（一般把握）；主观信心不改变证据等级。</p>
          <div className="choice">
            <button type="button" className={recall.postRevealNoHintPassed === true ? 'btn primary' : 'btn'} onClick={() => app.patchRecall({ postRevealNoHintPassed: true })}>复述通过</button>
            <button type="button" className={recall.postRevealNoHintPassed === false ? 'btn primary' : 'btn'} onClick={() => app.patchRecall({ postRevealNoHintPassed: false })}>复述没通过</button>
          </div>
          <label className="field">备注
            <input value={recall.userNote} onChange={(event) => app.patchRecall({ userNote: event.target.value })} />
          </label>
          <button className="btn primary" type="button" onClick={app.recallCommit} disabled={recall.postRevealNoHintPassed === undefined}>记下这一轮</button>
        </section>
      ) : null}
      {recall.phase === 'done' && recall.result ? (
        <section className="card">
          <h2>本轮记录</h2>
          <EvidenceBadge state={recall.result.evidenceState} />
          <p>最高提示：{HINT_LABEL[recall.result.highestHintUsed]}。撤提示复述：{recall.result.postRevealNoHintPassed ? '通过' : '未通过或未记'}。信心 {recall.result.selfConfidence}。这三项分开保存。</p>
          {recall.result.sportsExampleMissing ? <p className="muted">本轮体育例证未核对，与上方提取证据等级分开记录。</p> : null}
          <p className="muted">主观信心不能把本轮改成独立提取。</p>
          <p>下次复测：{recall.result.dueAt ? localTime(recall.result.dueAt) : '未安排'}。</p>
          <CoachNext />
          <details><summary>回看本轮答题评审</summary><AnswerReview item={item} draft={recall.result.preRevealDraft?.text ?? ''} checked={recall.result.checkedPointIds} /></details>
        </section>
      ) : null}
      {recall.phase !== 'draft' && recall.frozenDraft ? <p className="muted">揭晓前草稿已冻结。</p> : null}
      {app.state.settings.showTimer && recall.phase !== 'done' && <p className="muted">用时从本轮开始累计，包含暂离页面的时间。</p>}
      <p className="muted">一次只完成当前这一题。候选关系 {ctx.candidateRelationIds.length} 条未进入提示链。</p>
    </div>
  )
}

function HintPane({ title, children, onMore, onReady, onFull }: { title: string; children: ReactNode; onMore: () => void; onReady: () => void; onFull: () => void }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
      <div className="actions">
        <button className="btn primary" type="button" onClick={onReady}>想起来了，去核对</button>
        <button className="btn" type="button" onClick={onMore}>还需要下一级</button>
        <button className="btn ghost" type="button" onClick={onFull}>看完整原文</button>
      </div>
    </section>
  )
}

function recallStepIndex(phase: string): number {
  switch (phase) {
    case 'draft':
      return 0
    case 'b_skeleton':
      return 1
    case 'headings':
      return 2
    case 'keywords':
      return 3
    case 'compare':
      return 4
    case 'restate':
    case 'done':
      return 5
    default:
      return 0
  }
}

function groups(item: StudyItem) {
  const map = new Map<string, StudyItem['checkPoints']>()
  for (const point of item.checkPoints) {
    const list = map.get(point.group) || []
    list.push(point)
    map.set(point.group, list)
  }
  return [...map.entries()]
}

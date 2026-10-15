import { AnswerReview, HandwritingHelp } from '../components/AnswerReview'
import { durationClock } from '../browser/format'
import { downloadText, localDateStamp } from '../browser/download'
import { useEffect, useMemo, useState } from 'react'
import { content, getItem } from '../content'
import { advanceExamQuestion, createExamState, examQuestionStartedAt, finalizeQuestionDuration, questionRemainSeconds } from '../engine/exam'
import { DataTable, SectionList } from '../components/render'
import { mulberry32 } from '../engine/dayplan'
import { rankItems } from '../engine/priority'
import { useApp } from '../state/store'
import type { ExamState, StudyItem } from '../types'

export function Exam() {
  const app = useApp()
  const exam = app.state.exam
  const [clock, setClock] = useState(() => Date.now())
  const [downloadError, setDownloadError] = useState('')
  const [ending, setEnding] = useState(false)
  useEffect(() => {
    if (!exam) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [exam?.id])
  if (!exam) return <ExamSetup />
  const item = getItem(exam.itemIds[exam.index])
  if (!item) return <p>题目缺失。</p>
  const answer = exam.answers[item.id] || { text: '', revealed: false }
  const remain = answer.revealed && answer.durationSeconds !== undefined && exam.limitSeconds !== null
    ? exam.limitSeconds - answer.durationSeconds : questionRemainSeconds(exam, Math.max(clock, exam.questionStartedAt ?? exam.startedAt))
  const update = (partial: Partial<ExamState>) => app.patchExam({ ...exam, ...partial })
  const exportAnswers = () => {
    try { downloadExam(exam); setDownloadError('') }
    catch { setDownloadError('作答下载未能发起，请检查下载权限后重试；当前作答仍保留。') }
  }
  const goNext = () => app.patchExam(advanceExamQuestion(exam, Date.now()))
  const reveal = () => {
    const now = Date.now()
    const sealed = finalizeQuestionDuration(answer, examQuestionStartedAt(exam), now)
    update({ answers: { ...exam.answers, [item.id]: { ...sealed, revealed: true } } })
  }
  return (
    <div className="stack exam-page">
      <header className="page-head">
        <div>
          <p className="kicker">{exam.title} · {exam.index + 1}/{exam.itemIds.length}</p>
          <h1>{item.title}</h1>
        </div>
        {remain !== null ? <strong className={remain < 0 ? 'timer late' : 'timer'}>{remain >= 0 ? durationClock(remain) : `超时 ${durationClock(-remain)}`}</strong> : null}
      </header>
      {!answer.revealed ? <p className="muted">切换页面不会暂停计时。作答会自动保存；对照原文后，本题作答冻结。</p> : null}
      {answer.durationSeconds !== undefined && answer.revealed ? (
        <p className="muted">本题用时 {answer.durationSeconds} 秒（对照原文时封存）。</p>
      ) : null}
      {!answer.revealed && <HandwritingHelp />}
      <textarea
        rows={12}
        value={answer.text}
        readOnly={answer.revealed}
        aria-label={answer.revealed ? '已冻结的闭卷作答' : '闭卷作答'}
        onChange={(event) => update({ answers: { ...exam.answers, [item.id]: { ...answer, text: event.target.value } } })}
        placeholder="限时书面骨架。程序不按字符相似度打分。"
      />
      {answer.revealed && <p className="muted">作答已冻结，保留揭晓答案前的真实输出。</p>}
      <div className="actions">
        {!answer.revealed ? (
          <button className="btn primary" type="button" onClick={reveal}>对照原文</button>
        ) : (
          <button className="btn primary" type="button" onClick={exam.index >= exam.itemIds.length - 1 ? () => setEnding(true) : goNext}>{exam.index >= exam.itemIds.length - 1 ? '完成本次考试' : '下一题'}</button>
        )}
        <button className="btn ghost" type="button" onClick={exportAnswers}>导出本次作答</button>
        <button className="btn ghost" type="button" onClick={() => setEnding(true)}>结束</button>
      </div>
      {downloadError && <p className="warnbox" role="alert">{downloadError}</p>}
      {ending && <section className="warnbox" role="region" aria-label="结束考试确认"><h2>结束并清除本次考试？</h2><p>本次作答不会自动成为学习档案。请先导出要保留的作答；取消可继续当前考试。</p><div className="actions"><button className="btn" onClick={() => setEnding(false)}>继续考试</button><button className="btn" onClick={exportAnswers}>先导出本次作答</button><button className="btn danger" onClick={() => { setEnding(false); app.patchExam(null) }}>确认结束并清除</button></div></section>}
      {answer.revealed && <AnswerReview key={`${exam.id}:${item.id}`} item={item} draft={answer.text} />}
      {answer.revealed ? (
        <div className="compare">
          <article className="card"><h2>我的作答</h2><pre>{answer.text || '（空）'}</pre></article>
          <article className="card"><h2>原资料</h2><SectionList sections={item.sections.length ? item.sections : [{ id: 't', title: item.title, sourceText: item.originalMarkdown, layer: 'normal' }]} />{item.tables.map((table, index) => <DataTable key={index} table={table} />)}</article>
        </div>
      ) : null}
    </div>
  )
}

function ExamSetup() {
  const app = useApp()
  const [minutes, setMinutes] = useState(String(app.state.settings.day.writingMinutes))
  const validMinutes = minutes.trim() !== '' && Number.isFinite(Number(minutes)) && Number(minutes) >= 1
  const pool = useMemo(() => content.items, [])
  const start = (title: string, items: StudyItem[], limit: number | null) => {
    const rnd = mulberry32(Date.now() % 100000)
    const shuffled = [...items]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      const tmp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = tmp
    }
    const picked = shuffled.slice(0, 8)
    const now = Date.now()
    const exam = createExamState({
      id: `exam-${now}`,
      title,
      itemIds: picked.map((item) => item.id),
      index: 0,
      startedAt: now,
      questionStartedAt: now,
      limitSeconds: limit ? limit * 60 : null,
      answers: Object.fromEntries(picked.map((item) => [item.id, { text: '', revealed: false }])),
    })
    app.startExam(exam)
  }
  const due = rankItems(pool, app.state.attempts, app.now, content.relations, app.state.relationOverrides).filter((row) => row.tier === 1).map((row) => row.item)
  const wrong = pool.filter((item) => {
    const latest = app.state.attempts.filter((a) => a.itemId === item.id).sort((a, b) => b.finishedAt - a.finishedAt)[0]
    return latest && (latest.evidenceState === 'cue_dependent' || latest.evidenceState === 'relearned')
  })
  return (
    <div className="stack">
      <h1>闭卷考试</h1>
      <p>题目跨章节打乱。限时写作只保留原文对照，不生成分数，也不生成主动提取成绩；不计入全科今日预算。</p>
      <label className="field">每题分钟
        <input type="number" min={1} value={minutes} aria-invalid={!validMinutes} onChange={(event) => setMinutes(event.target.value)} />
      </label>
      {!validMinutes && <p role="status">限时写作需要至少 1 分钟；其他考试模式不受影响。</p>}
      {!due.length && <p className="muted">当前没有到期题，“到期题”暂不可用。</p>}
      {!wrong.length && <p className="muted">尚无提示依赖或重学记录，“错题”暂不可用。</p>}
      <div className="actions">
        <button className="btn primary" type="button" onClick={() => start('随机 A 题', pool.filter((item) => item.coreA), null)}>随机 A 题</button>
        <button className="btn" type="button" onClick={() => start('随机 B 骨架', pool.filter((item) => item.source === 'B' && item.kind === 'skeleton'), null)}>随机 B 骨架</button>
        <button className="btn" type="button" onClick={() => start('到期题', due, null)} disabled={!due.length}>到期题</button>
        <button className="btn" type="button" onClick={() => start('提示依赖与重学', wrong, null)} disabled={!wrong.length}>错题</button>
        <button className="btn" type="button" disabled={!validMinutes} onClick={() => start('限时写作', pool.filter((item) => item.coreA), Number(minutes))}>A 题限时写作</button>
      </div>
    </div>
  )
}

function downloadExam(exam: ExamState) {
  const lines = [exam.title, new Date(exam.startedAt).toISOString(), '']
  for (const id of exam.itemIds) {
    const item = getItem(id)
    const answer = exam.answers[id]
    lines.push(`# ${item?.title || id}`, answer?.text || '', answer?.durationSeconds !== undefined ? `用时 ${answer.durationSeconds}s` : '', '')
  }
  downloadText(lines.join('\n'), `pku346-exam-${localDateStamp()}.txt`)
}

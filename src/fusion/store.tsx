import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppApiOverride, useApp } from '../state/store'
import { content } from '../content'
import { DATA_KEY } from '../engine/storage'
import { addGeneralPoint, reviewGeneral } from '../general/data'
import { defaultPersisted } from '../state/defaults'
import { installPhysiology } from '../general/textbook'
import type { Rating } from '../general/types'
import { beginTask, decide, finishTask, lockChapters, reconcileMrc, defaultFusion, adoptAlphaDay } from './planner'
import { inspectFusionImport, loadPlatform, makeEnvelope, validateMrcSnapshot, validatePlatform, writeBundle, type FusionImportPlan } from './transfer'
import { FUSION_BACKUP_KEY, PLATFORM_KEY, JOURNAL_KEY, type Candidate, type FusionState, type GeneralSession, type Panel, type SubjectPolicy } from './types'

interface FusionApi {
  state: FusionState
  decision: ReturnType<typeof decide>
  panel: Panel
  message: string | null
  blocked: boolean
  importPlan: FusionImportPlan | null
  open: (panel: Panel) => void
  start: (candidate?: Candidate) => void
  closeDay: () => void
  setMinutes: (minutes: number) => void
  setPolicy: (subject: string, patch: Partial<SubjectPolicy>) => void
  patchSession: (patch: Partial<GeneralSession>) => void
  reveal: () => void
  rate: (rating: Rating) => void
  addPoint: (input: { subject: string; title: string; content: string; checklist: string[]; chapter: string }) => boolean
  stageImport: (raw: string) => void
  confirmImport: () => void
  cancelImport: () => void
  exportAll: () => void
  exportGeneral: () => void
  rollback: () => void
  dismiss: () => void
}
const Ctx = createContext<FusionApi | null>(null)
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function FusionProvider({ children, recoveryMessage }: { children: ReactNode; recoveryMessage: string | null }) {
  const mrc = useApp()
  const loaded = useMemo(() => {
    const loaded = loadPlatform(localStorage, Date.now())
    if (!loaded.blocked && !localStorage.getItem(PLATFORM_KEY)) loaded.state = adoptAlphaDay(loaded.state, mrc.state, Date.now())
    const general = loaded.blocked || mrc.storageBlocked ? loaded.state.general : installPhysiology(loaded.state.general, Date.now())
    return { ...loaded, state: { ...loaded.state, general }, needsSave: general !== loaded.state.general }
  }, [])
  const [state, setState] = useState(loaded.state)
  const ref = useRef(state)
  const textbookPending = useRef(loaded.needsSave)
  const [blocked, setBlocked] = useState(loaded.blocked || Boolean(recoveryMessage?.includes('失败')))
  const blockedRef = useRef(blocked)
  const [panel, setPanel] = useState<Panel>('today')
  const [message, setMessage] = useState<string | null>(recoveryMessage ?? loaded.warning)
  const [importPlan, setImportPlan] = useState<FusionImportPlan | null>(null)
  const importRevision = useRef('')
  const renderNow = Date.now()
  const prepared = lockChapters(reconcileMrc(state, mrc.state, renderNow), mrc.state, renderNow)

  function persist(next: FusionState, recovery = false): boolean {
    if (blockedRef.current && !recovery) { setMessage('本地记录受保护，请先导出备份并恢复数据。'); return false }
    try {
      if (localStorage.getItem(JOURNAL_KEY)) throw new Error('存在未完成导入恢复日志，请重新打开程序')
      localStorage.setItem(PLATFORM_KEY, JSON.stringify(next))
      ref.current = next; setState(next)
      return true
    } catch (error) { setMessage(`保存失败，当前操作未提交：${error instanceof Error ? error.message : String(error)}。请导出备份。`); return false }
  }
  useEffect(() => {
    if ((prepared !== state || textbookPending.current) && !blockedRef.current && persist(prepared)) textbookPending.current = false
    // Reconcile original MRC results after their own successful write; no second Attempt is generated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, mrc.state, mrc.now])

  const current = () => lockChapters(reconcileMrc(ref.current, mrc.state, Date.now()), mrc.state, Date.now())
  const open = (next: Panel) => { setPanel(next) }
  const start = (chosen?: Candidate) => {
    if (blockedRef.current || mrc.storageBlocked) { setMessage('本地存储受保护，请先恢复数据再训练。'); return }
    const before = current()
    const decision = decide(before, mrc.state, Date.now())
    if (decision.kind === 'resume') {
      if (!persist(before)) return
      if (decision.task.module === 'mrc') {
        if (!mrc.openModuleRecall(decision.task.itemId, decision.task.startedAt)) { setMessage('管理学草稿与当前任务冲突，原草稿已保留，请导出备份。'); return }
        mrc.setView('recall')
      }
      setPanel(decision.task.module === 'mrc' ? 'mrc' : 'general'); return
    }
    const candidate = chosen ?? (decision.kind === 'next' ? decision.candidate : null)
    if (!candidate) { setPanel('today'); return }
    const next = beginTask(before, candidate, Date.now())
    if (next === before || !next.active) { setMessage('这项训练不在今日配额内，或剩余预算不足。可以在设置中调整。'); setPanel('today'); return }
    if (!persist(next)) return
    if (candidate.module === 'mrc' && !mrc.openModuleRecall(candidate.itemId, next.active.startedAt)) {
      // Keep the reservation recoverable if rollback storage also fails.
      persist(before); setMessage('管理学训练未能开始，草稿没有被覆盖。'); return
    }
    setPanel(candidate.module === 'mrc' ? 'mrc' : 'general')
  }
  const openMrcItem = (itemId: string) => {
    const item = content.items.find(i => i.id === itemId)
    if (!item || item.kind === 'reference') { setMessage('这条资料用于查询，不自动生成训练。'); return }
    const hasAttempt = mrc.state.attempts.some(a => a.itemId === itemId)
    start({ module: 'mrc', itemId, title: item.title, subject: '体育管理学', chapterKey: `mrc::${item.chapterId}`, isNew: !hasAttempt,
      reason: '你选择了这道管理学题，仍按原提示链记录真实表现。', estimatedMinutes: item.coreA || item.appendixFullAnswer ? 15 : item.kind === 'redline' ? 5 : 10, dueAt: Date.now(), tier: 0 })
  }
  const api: FusionApi = {
    state: prepared, decision: decide(prepared, mrc.state, renderNow), panel, message,
    blocked: blocked || mrc.storageBlocked, importPlan, open, start,
    closeDay: () => { const next = current(); if (next.active?.status === 'in_progress') { setMessage('当前训练已暂停，仍可继续；完成后再收工。'); return } if (persist({ ...next, day: { ...next.day, closed: true } })) setPanel('today') },
    setMinutes: minutes => {
      if (![15, 30, 45, 60, 90, 120, 180].includes(minutes)) return
      const next = current(); persist({ ...next, settings: { ...next.settings, minutes }, day: { ...next.day, budgetMinutes: minutes, closed: minutes > next.day.budgetMinutes ? false : next.day.closed } })
    },
    setPolicy: (subject, patch) => {
      const next = current()
      const policy = { ...(Object.hasOwn(next.settings.subjects, subject) ? next.settings.subjects[subject] : { weight: 1, newCap: 3, chapterCap: 3 }), ...patch }
      if (!Number.isInteger(policy.newCap) || policy.newCap < 0 || policy.newCap > 50 || !Number.isInteger(policy.chapterCap) || policy.chapterCap < 0 || policy.chapterCap > 20 || !Number.isFinite(policy.weight) || policy.weight < 1 || policy.weight > 10) return
      const selected = { ...next.day.selectedChapters }
      delete selected[subject] // Explicit policy change is the only same-day scope reset.
      persist(lockChapters({ ...next, settings: { ...next.settings, subjects: { ...next.settings.subjects, [subject]: policy } }, day: { ...next.day, selectedChapters: selected } }, mrc.state, Date.now()))
    },
    patchSession: patch => {
      const next = current(); if (!next.session || next.session.phase === 'done') return
      const allowed: Partial<GeneralSession> = next.session.phase === 'draft' ? { draft: patch.draft ?? next.session.draft } : { checked: patch.checked ?? next.session.checked }
      persist({ ...next, session: { ...next.session, ...allowed } })
    },
    reveal: () => { const next = current(); if (next.session?.phase === 'draft') persist({ ...next, session: { ...next.session, frozenDraft: next.session.draft, phase: 'compare' } }) },
    rate: rating => {
      const next = current()
      if (![1, 2, 3, 4].includes(rating) || !next.session || next.session.phase !== 'compare' || !next.active || next.active.module !== 'general' || next.active.status !== 'in_progress') return
      const resultId = `review-${next.active.id}`
      const now = Date.now()
      try {
        const general = reviewGeneral(next.general, next.active.itemId, rating, next.session.checked, resultId, now,
          { draft: next.session.frozenDraft ?? '', startedAt: next.active.startedAt })
        persist(finishTask({ ...next, general, session: { ...next.session, phase: 'done', rating, resultId } }, resultId, now))
      } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    },
    addPoint: input => {
      try { const next = current(); return persist({ ...next, general: addGeneralPoint(next.general, input, Date.now()) }) }
      catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return false }
    },
    stageImport: raw => {
      try { const next = current(); const plan = inspectFusionImport(raw, next, mrc.state); importRevision.current = JSON.stringify([ref.current, mrc.state]); setImportPlan(plan) }
      catch (error) { setImportPlan(null); setMessage(error instanceof Error ? error.message : '备份无法解析。') }
    },
    confirmImport: () => {
      if (!importPlan) return
      if (importRevision.current !== JSON.stringify([ref.current, mrc.state])) { setMessage('预览后学习记录已变化，请重新选择备份预览。'); setImportPlan(null); return }
      const platform = { ...importPlan.platform, general: installPhysiology(importPlan.platform.general, Date.now()) }
      const wrote = writeBundle(localStorage, platform, importPlan.mrc)
      if (!wrote.ok) { setMessage(wrote.error ?? '导入失败'); if (localStorage.getItem(JOURNAL_KEY)) { blockedRef.current = true; setBlocked(true); window.location.reload() } return }
      if (wrote.needsRecovery) { window.location.reload(); return }
      ref.current = platform; setState(platform); mrc.adoptMrcState(importPlan.mrc)
      blockedRef.current = false; setBlocked(false); setImportPlan(null); setPanel('today'); setMessage('导入完成，导入前的数据已备份，可在设置中回滚。')
    },
    cancelImport: () => setImportPlan(null),
    exportAll: () => {
      if (blockedRef.current || mrc.storageBlocked) {
        const raw: Record<string, string | null> = {}
        for (const key of [PLATFORM_KEY, DATA_KEY, JOURNAL_KEY, FUSION_BACKUP_KEY, 'ms346_points_v1', 'ms346_logs_v1', 'ms346_logs_archive_v1', 'ms346_subjects_v1', 'ms346_settings_v1', 'ms346_confusion_sets_v1']) {
          try { raw[key] = localStorage.getItem(key) } catch { raw[key] = null }
        }
        downloadJson({ format: '346-fusion-recovery', raw }, '346-Protected-Raw-Recovery.json')
        setMessage('已导出受保护的原始存储。该文件用于恢复排查，不能作为正常整包导入；原记录仍未覆盖。')
      } else downloadJson(makeEnvelope(ref.current, mrc.state), `346-Fusion-${new Date().toISOString().slice(0, 10)}.json`)
    },
    exportGeneral: () => { if (blockedRef.current) { api.exportAll(); return } downloadJson(ref.current.general, '346-memory-module.json') },
    rollback: () => {
      try {
        const raw = localStorage.getItem(FUSION_BACKUP_KEY)
        if (!raw) throw new Error('没有找到整包导入前备份。')
        const previous = JSON.parse(raw)
        if (!previous || typeof previous !== 'object' || ![PLATFORM_KEY, DATA_KEY].every(key => previous[key] === null || typeof previous[key] === 'string')) throw new Error('导入前备份结构不完整，当前数据未改动。')
        const platform = previous[PLATFORM_KEY] ? validatePlatform(JSON.parse(previous[PLATFORM_KEY])) : defaultFusion(Date.now())
        platform.general = installPhysiology(platform.general, Date.now())
        const mrcState = previous[DATA_KEY] ? validateMrcSnapshot(JSON.parse(previous[DATA_KEY]), mrc.state) : defaultPersisted()
        const wrote = writeBundle(localStorage, platform, mrcState, false)
        if (wrote.needsRecovery || (!wrote.ok && localStorage.getItem(JOURNAL_KEY))) { window.location.reload(); return }
        if (!wrote.ok) throw new Error(wrote.error)
        ref.current = platform; setState(platform); mrc.adoptMrcState(mrcState); blockedRef.current = false; setBlocked(false); setImportPlan(null); setPanel('today'); setMessage('已恢复整包导入前的两个模块记录。')
      } catch (error) { setMessage(error instanceof Error ? error.message : '回滚失败') }
    },
    dismiss: () => setMessage(null),
  }
  const override = { ...mrc, stageImport: (raw: string) => { api.stageImport(raw); setPanel('settings') }, confirmImport: api.confirmImport, cancelImport: api.cancelImport, rollback: api.rollback,
    setLibrary: (partial: Parameters<typeof mrc.setLibrary>[0]) => { mrc.setLibrary(partial); setPanel('mrc') },
    setView: (view: typeof mrc.state.view) => { if (view === 'today') setPanel('today'); else { mrc.setView(view); setPanel('mrc') } },
    startRecallItem: openMrcItem, startQueue: (ids: string[]) => { if (ids[0]) openMrcItem(ids[0]) }, startCoach: () => start(),
    recallNext: () => start(), closeCoachDay: api.closeDay, setCoachBudget: api.setMinutes }
  return <Ctx.Provider value={api}><AppApiOverride value={override}>{children}</AppApiOverride></Ctx.Provider>
}
export function useFusion(): FusionApi {
  const value = useContext(Ctx); if (!value) throw new Error('FusionProvider missing'); return value
}
export function useOptionalFusion(): FusionApi | null { return useContext(Ctx) }

import { applyTextbookChanges } from '../general/revisions'
import { policyPack, physiologyPack } from '../general/textbook'
import { downloadJson, localDateStamp } from '../browser/download'
import { collectRecovery } from '../browser/recovery'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppApiOverride, useApp } from '../state/store'
import { content } from '../content'
import { DATA_KEY } from '../engine/storage'
import { addGeneralPoint, reviewGeneral } from '../general/data'
import { defaultPersisted } from '../state/defaults'
import { installBuiltInTextbooks } from '../general/textbook'
import type { Rating } from '../general/types'
import { beginTask, decide, finishTask, lockChapters, reconcileMrc, defaultFusion, adoptAlphaDay, selectSubjects, preparePractice, beginPractice } from './planner'
import { inspectFusionImport, loadPlatform, makeEnvelope, validateMrcSnapshot, validatePlatform, writeBundle, type FusionImportPlan } from './transfer'
import { FUSION_BACKUP_KEY, PLATFORM_KEY, JOURNAL_KEY, type Candidate, type FusionState, type GeneralSession, type PracticeScope, type Panel, type SubjectPolicy } from './types'

interface FusionApi {
  state: FusionState
  decision: ReturnType<typeof decide>
  panel: Panel
  message: string | null
  blocked: boolean
  importPlan: FusionImportPlan | null
  open: (panel: Panel) => void
  start: (candidate?: Candidate) => void
  setSubjects: (subjects: string[] | null) => void
  requestPractice: (scope: PracticeScope) => void
  practicePreview: ReturnType<typeof preparePractice> | null
  confirmPractice: () => void
  cancelPractice: () => void
  endPractice: () => void
  closeDay: () => void
  reopenDay: () => void
  setMinutes: (minutes: number, scope?: 'today' | 'daily') => void
  setPolicy: (subject: string, patch: Partial<SubjectPolicy>) => boolean
  libraryDraft: LibraryDraft
  setLibraryDraft: (draft: LibraryDraft) => void
  patchSession: (patch: Partial<GeneralSession>) => void
  reveal: () => void
  rate: (rating: Rating) => void
  addPoint: (input: { subject: string; title: string; content: string; checklist: string[]; chapter: string }) => boolean
  stageImport: (raw: string) => void
  confirmImport: () => void
  selectedRevisions: string[]
  selectRevision: (id: string, selected: boolean) => void
  previewBuiltIn: (kind: 'physiology' | 'policy') => void
  cancelImport: () => void
  lastExportRequestedAt: number
  exportAll: () => void
  exportGeneral: () => void
  rollback: () => void
  rollbackRequested: boolean
  confirmRollback: () => void
  cancelRollback: () => void
  resumeNotice: string | null
  cancelResume: () => void
  dismiss: () => void
}
export interface LibraryDraft { subject: string; title: string; content: string; checklist: string; chapter: string }
export const emptyLibraryDraft: LibraryDraft = { subject: '运动生理学', title: '', content: '', checklist: '', chapter: '' }
const Ctx = createContext<FusionApi | null>(null)

export function FusionProvider({ children, recoveryMessage }: { children: ReactNode; recoveryMessage: string | null }) {
  const mrc = useApp()
  const loaded = useMemo(() => {
    const loaded = loadPlatform(localStorage, Date.now())
    if (!loaded.blocked && !localStorage.getItem(PLATFORM_KEY)) loaded.state = adoptAlphaDay(loaded.state, mrc.state, Date.now())
    const general = loaded.blocked || mrc.storageBlocked ? loaded.state.general : installBuiltInTextbooks(loaded.state.general, Date.now())
    return { ...loaded, state: { ...loaded.state, general }, needsSave: general !== loaded.state.general }
  }, [])
  const [state, setState] = useState(loaded.state)
  const ref = useRef(state)
  const textbookPending = useRef(loaded.needsSave)
  const [blocked, setBlocked] = useState(loaded.blocked || Boolean(recoveryMessage?.includes('失败')))
  const blockedRef = useRef(blocked)
  const [panel, setPanel] = useState<Panel>('today')
  const [practiceRequest, setPracticeRequest] = useState<PracticeScope | null>(null)
  const [resumeNotice, setResumeNotice] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(recoveryMessage ?? loaded.warning)
  const [lastExportRequestedAt, setLastExportRequestedAt] = useState(() => {
    try { const value = Number(localStorage.getItem('346-fusion-last-export-request-v1')); return Number.isFinite(value) && value > 0 ? value : 0 } catch { return 0 }
  })
  useEffect(() => {
    if (!['导入完成，导入前的数据已备份，可在设置中回滚。', '已恢复整包导入前的两个模块记录。', '已发起全科备份下载，请在浏览器下载列表中确认文件。'].includes(message ?? '')) return
    const timer = setTimeout(() => setMessage(null), 8000)
    return () => clearTimeout(timer)
  }, [message])
  const [importPlan, setImportPlan] = useState<FusionImportPlan | null>(null)
  const [selectedRevisions, setSelectedRevisions] = useState<string[]>([])
  const [rollbackRequested, setRollbackRequested] = useState(false)
  const [libraryDraft, setLibraryDraft] = useState<LibraryDraft>(emptyLibraryDraft)
  const hasLibraryDraft = Boolean(libraryDraft.title || libraryDraft.content || libraryDraft.checklist || libraryDraft.chapter)
  useEffect(() => {
    if (!hasLibraryDraft) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [hasLibraryDraft])
  const importRevision = useRef('')
  const renderNow = Date.now()
  const prepared = lockChapters(reconcileMrc(state, mrc.state, renderNow), mrc.state, renderNow)

  function persist(next: FusionState, recovery = false): boolean {
    if ((blockedRef.current || mrc.storageBlocked) && !recovery) { setMessage('本地记录受保护，请先导出备份并恢复数据。'); return false }
    try {
      if (localStorage.getItem(JOURNAL_KEY)) throw new Error('存在未完成导入恢复日志，请重新打开程序')
      validatePlatform(next, ref.current.general)
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
      if (chosen && (chosen.module !== decision.task.module || chosen.itemId !== decision.task.itemId)) {
        setResumeNotice(`《${decision.task.title}》还未完成，草稿已保留。请先完成它，再开始《${chosen.title}》。`)
        return
      }
      setResumeNotice(null)
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
  const requestPractice = (scope: PracticeScope) => {
    if (blockedRef.current || mrc.storageBlocked) { setMessage('本地记录受保护，请先恢复数据再训练。'); return }
    const before = current()
    if (before.active?.status === 'in_progress') {
      if (scope.kind === 'item' && scope.module === before.active.module && scope.itemIds[0] === before.active.itemId) { start(); return }
      setResumeNotice(`《${before.active.title}》还未完成，草稿已保留。请先完成它，再开始《${scope.title}》。`); return
    }
    setPracticeRequest(scope)
  }
  const openMrcItem = (itemId: string) => {
    const item = content.items.find(i => i.id === itemId)
    if (item) requestPractice({ module: 'mrc', kind: 'item', title: item.title, itemIds: [itemId] })
  }
  const api: FusionApi = {
    state: prepared, decision: decide(prepared, mrc.state, renderNow), panel, message,
    blocked: blocked || mrc.storageBlocked, importPlan, open, start, libraryDraft, setLibraryDraft,
    resumeNotice, cancelResume: () => setResumeNotice(null),
    setSubjects: subjects => {
      const before = current(), next = selectSubjects(before, subjects)
      if (next === before) { setMessage('请至少选择一个科目，或使用自动安排。'); return }
      if (persist(next)) setMessage(before.active?.status === 'in_progress' ? '科目选择已保存。先继续当前草稿，完成后按新范围推荐。' : null)
    },
    requestPractice,
    practicePreview: practiceRequest ? preparePractice(prepared, mrc.state, practiceRequest, renderNow) : null,
    cancelPractice: () => setPracticeRequest(null),
    confirmPractice: () => {
      if (!practiceRequest) return
      const before = current()
      if (before.active?.status === 'in_progress') { setPracticeRequest(null); requestPractice(practiceRequest); return }
      const next = beginPractice(before, mrc.state, practiceRequest, Date.now())
      if (next === before || !next.active) { setMessage('当前范围没有可开始的题目，或追加后超出每日600分钟上限。原安排未改动。'); return }
      if (!persist(next)) return
      if (next.active.module === 'mrc' && !mrc.openModuleRecall(next.active.itemId, next.active.startedAt)) {
        persist(before); setMessage('管理学训练未能开始，草稿没有被覆盖。'); return
      }
      setPracticeRequest(null); setMessage(null); setPanel(next.active.module === 'mrc' ? 'mrc' : 'general')
    },
    endPractice: () => {
      const before = current(), { practice: _practice, ...day } = before.day
      if (persist({ ...before, day })) setPanel('today')
    },
    closeDay: () => { const next = current(); if (next.active?.status === 'in_progress') { setMessage('当前训练已暂停，仍可继续；完成后再收工。'); return } if (persist({ ...next, day: { ...next.day, closed: true } })) setPanel('today') },
    reopenDay: () => { const next = current(); if (persist({ ...next, day: { ...next.day, closed: false } })) setPanel('today') },
    setMinutes: (minutes, scope = 'today') => {
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 600) { setMessage('预算需要是 15–600 分钟的整数，原设置未改动。'); return }
      const next = current(); persist({ ...next, settings: scope === 'daily' ? { ...next.settings, minutes } : next.settings, day: { ...next.day, budgetMinutes: minutes } })
    },
    setPolicy: (subject, patch) => {
      const next = current()
      const policy = { ...(Object.hasOwn(next.settings.subjects, subject) ? next.settings.subjects[subject] : { weight: 1, newCap: 3, chapterCap: 3 }), ...patch }
      if (!Number.isInteger(policy.newCap) || policy.newCap < 0 || policy.newCap > 50 || !Number.isInteger(policy.chapterCap) || policy.chapterCap < 0 || policy.chapterCap > 20 || !Number.isFinite(policy.weight) || policy.weight < 1 || policy.weight > 10) return false
      const selected = { ...next.day.selectedChapters }
      if (patch.newCap !== undefined || patch.chapterCap !== undefined) delete selected[subject]
      return persist(lockChapters({ ...next, settings: { ...next.settings, subjects: { ...next.settings.subjects, [subject]: policy } }, day: { ...next.day, selectedChapters: selected } }, mrc.state, Date.now()))
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
    selectedRevisions,
    selectRevision: (id, selected) => setSelectedRevisions(prev => selected ? [...new Set([...prev, id])] : prev.filter(x => x !== id)),
    previewBuiltIn: kind => api.stageImport(JSON.stringify(kind === 'physiology' ? { ...physiologyPack, referencePoints: [] } : policyPack)),
    stageImport: raw => {
      setSelectedRevisions([])
      try { const next = current(); const plan = inspectFusionImport(raw, next, mrc.state); importRevision.current = JSON.stringify([ref.current, mrc.state]); setImportPlan(plan) }
      catch (error) { setImportPlan(null); setMessage(error instanceof Error ? error.message : '备份无法解析。') }
    },
    confirmImport: () => {
      if (!importPlan) return
      if (importRevision.current !== JSON.stringify([ref.current, mrc.state])) { setMessage('预览后学习记录已变化，请重新选择备份预览。'); setImportPlan(null); return }
      let revised = importPlan.platform.general
      try {
        if (importPlan.textbook) revised = applyTextbookChanges(ref.current.general, importPlan.textbook.points, importPlan.textbook.packId, selectedRevisions, ref.current.active?.status === 'in_progress' ? ref.current.active.itemId : undefined)
      } catch (error) { setMessage(error instanceof Error ? error.message : '教材修订无法应用'); return }
      const platform = { ...importPlan.platform, general: installBuiltInTextbooks(revised, Date.now()) }
      if (importPlan.kind === '教材资料') {
        // New material can enter today's chapter scope without clearing completed work or budgets.
        const selected = { ...platform.day.selectedChapters }
        for (const point of importPlan.textbook?.points ?? []) if (selectedRevisions.includes(point.id) || !ref.current.general.points.some(p => p.id === point.id)) delete selected[point.subject]
        platform.day = { ...platform.day, selectedChapters: selected }
      }
      const wrote = writeBundle(localStorage, platform, importPlan.mrc)
      if (!wrote.ok) { setMessage(wrote.error ?? '导入失败'); if (localStorage.getItem(JOURNAL_KEY)) { blockedRef.current = true; setBlocked(true); window.location.reload() } return }
      if (wrote.needsRecovery) { window.location.reload(); return }
      ref.current = platform; setState(platform); mrc.adoptMrcState(importPlan.mrc)
      blockedRef.current = false; setBlocked(false); setImportPlan(null); setPanel('today'); setMessage('导入完成，导入前的数据已备份，可在设置中回滚。')
    },
    cancelImport: () => setImportPlan(null),
    lastExportRequestedAt,
    exportAll: () => {
      try {
        if (blockedRef.current || mrc.storageBlocked) {
          const recovery = collectRecovery(key => localStorage.getItem(key))
          if (!Object.keys(recovery.raw).length) { setMessage('无法读取原始存储，未生成空备份。请保留浏览器数据并恢复存储访问。'); return }
          downloadJson(recovery, `346-Protected-Raw-Recovery-${localDateStamp()}.json`)
          setMessage(`已发起原始存储下载${Object.keys(recovery.readErrors).length ? '（有读取失败项，详见文件）' : ''}。请检查下载列表；该文件供恢复排查，不能作为正常整包导入。`)
        } else {
          downloadJson(makeEnvelope(ref.current, mrc.state), `346-Fusion-${localDateStamp()}.json`)
          const requestedAt = Date.now(); setLastExportRequestedAt(requestedAt)
          setMessage('已发起全科备份下载，请在浏览器下载列表中确认文件。')
          try { localStorage.setItem('346-fusion-last-export-request-v1', String(requestedAt)) }
          catch { setMessage('下载已发起，但无法保存导出时间。请在浏览器下载列表中确认备份文件。') }
        }
      } catch { setMessage('备份下载未能发起，当前记录未改动。请检查下载权限后重试。') }
    },
    exportGeneral: () => {
      if (blockedRef.current || mrc.storageBlocked) { api.exportAll(); return }
      try { downloadJson(ref.current.general, '346-memory-module.json') }
      catch { setMessage('备份下载未能发起，当前记录未改动。请检查下载权限后重试。') }
    },
    rollbackRequested,
    rollback: () => setRollbackRequested(true),
    cancelRollback: () => setRollbackRequested(false),
    confirmRollback: () => {
      setRollbackRequested(false)
      try {
        const raw = localStorage.getItem(FUSION_BACKUP_KEY)
        if (!raw) throw new Error('没有找到整包导入前备份。')
        const previous = JSON.parse(raw)
        if (!previous || typeof previous !== 'object' || ![PLATFORM_KEY, DATA_KEY].every(key => previous[key] === null || typeof previous[key] === 'string')) throw new Error('导入前备份结构不完整，当前数据未改动。')
        const platform = previous[PLATFORM_KEY] ? validatePlatform(JSON.parse(previous[PLATFORM_KEY])) : defaultFusion(Date.now())
        platform.general = installBuiltInTextbooks(platform.general, Date.now())
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
    exportJson: () => { if (mrc.storageBlocked) api.exportAll(); else mrc.exportJson() },
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

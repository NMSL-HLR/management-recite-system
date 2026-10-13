import { describe, expect, it } from 'vitest'
import { defaultPersisted } from '../src/state/defaults'
import { createPoint } from '../src/general/scheduler'
import { normalizeGeneral, reviewGeneral } from '../src/general/data'
import { defaultFusion } from '../src/fusion/planner'
import { inspectFusionImport, makeEnvelope, recoverImport, validateMrcSnapshot, validatePlatform, writeBundle } from '../src/fusion/transfer'
import { memoryKv, DATA_KEY } from '../src/engine/storage'
import { JOURNAL_KEY, PLATFORM_KEY } from '../src/fusion/types'
const now = 1791885600000
const point = () => ({ ...createPoint({ subject: '运动生理学', title: '第一章', content: '原文', tags: [], checklist: ['要点'] }, now), id: 'p' })

describe('UI audit: malformed backups and merge regressions', () => {
  it('rejects a numeric chapter override before planner .trim can crash', () => {
    expect(() => normalizeGeneral({ points: [{ ...point(), quotaChapterOverride: 123 }] })).toThrow()
  })
  it('rejects non-renderable log drafts instead of crashing Records', () => {
    const data = reviewGeneral({ ...defaultFusion(now).general, points: [point()] }, 'p', 3, [], 'log', now)
    expect(() => normalizeGeneral({ ...data, logs: [{ ...data.logs[0], preRevealDraft: {} }] })).toThrow()
  })
  it('preserves prior settings omitted from a partial legacy import', () => {
    const s = defaultFusion(now); s.general.settings = { standardTargetRetention: 0.97, extendedTargetRetention: 0.98 }
    const first = inspectFusionImport(JSON.stringify({ points: [point()] }), s, defaultPersisted())
    expect(first.platform.general.settings).toEqual(s.general.settings)
    const second = inspectFusionImport(JSON.stringify({ points: [], settings: { standardTargetRetention: 0.91 } }), s, defaultPersisted())
    expect(second.platform.general.settings).toEqual({ standardTargetRetention: 0.91, extendedTargetRetention: 0.98 })
  })
  it('does not duplicate a log when it moves from current to archive on reimport', () => {
    const s = defaultFusion(now)
    s.general = reviewGeneral({ ...s.general, points: [point()] }, 'p', 3, [], 'log', now)
    const incoming = { ...s.general, logs: [], logsArchive: s.general.logs }
    const result = inspectFusionImport(JSON.stringify(incoming), s, defaultPersisted()).platform.general
    expect([...result.logs, ...result.logsArchive]).toHaveLength(1)
    expect(result.logsArchive[0].id).toBe('log')
  })
  it('rejects invalid MRC note bodies and exam answers at the import boundary', () => {
    const a = defaultPersisted()
    const broken = { ...a, notes: [{ itemId: 'a', text: { broken: true }, updatedAt: now }] }
    expect(() => validateMrcSnapshot(broken, a)).toThrow()
    expect(() => inspectFusionImport(JSON.stringify(broken), defaultFusion(now), a)).toThrow()
    const exam = { id: 'exam', title: '考试', itemIds: [], index: 0, startedAt: now, limitSeconds: null, answers: { a: { text: {}, revealed: false } } }
    expect(() => validateMrcSnapshot({ ...a, exam }, a)).toThrow()
  })
  it('rejects unsafe schedule settings without changing valid original intervals', () => {
    const a = defaultPersisted()
    expect(() => inspectFusionImport(JSON.stringify({ ...a, settings: { ...a.settings, gaps: { ...a.settings.gaps, cueMin: -1 } } }), defaultFusion(now), a)).toThrow()
    expect(validateMrcSnapshot(a, a).settings.gaps).toEqual(a.settings.gaps)
  })
  it('rejects an invalid task module object instead of string-coercing it', () => {
    const s = defaultFusion(now)
    const t = { id: 'x', itemId: 'p', subject: '运动生理学', title: '题', chapterKey: 'k', reason: '', isNew: true, module: ['general'], status: 'in_progress', estimatedMinutes: 10, startedAt: now }
    expect(() => validatePlatform({ ...s, day: { ...s.day, tasks: [t] }, active: t, session: null })).toThrow()
  })
  it('validates both recovery values before writing either storage key', () => {
    const kv = memoryKv(); kv.setItem(PLATFORM_KEY, 'current-platform'); kv.setItem(DATA_KEY, 'current-mrc')
    kv.setItem(JOURNAL_KEY, JSON.stringify({ phase: 'pending', previous: { [PLATFORM_KEY]: 'old-platform', [DATA_KEY]: 123 }, next: {} }))
    expect(recoverImport(kv)).toContain('失败')
    expect(kv.getItem(PLATFORM_KEY)).toBe('current-platform'); expect(kv.getItem(DATA_KEY)).toBe('current-mrc')
  })
  it('roundtrips a valid prior full export without changing data versions', () => {
    const s = defaultFusion(now), a = defaultPersisted()
    const plan = inspectFusionImport(JSON.stringify(makeEnvelope(s, a)), s, a)
    expect(plan.mrc).toEqual(a); expect(plan.platform).toEqual(s)
  })
  it('requires recovery before any further edits when committed journal cleanup fails', () => {
    const base = memoryKv()
    const kv = { ...base, removeItem: () => { throw new Error('cleanup failed') } }
    const result = writeBundle(kv, defaultFusion(now), defaultPersisted())
    expect(result).toEqual({ ok: true, needsRecovery: true })
    expect(JSON.parse(base.getItem(JOURNAL_KEY)!).phase).toBe('committed')
    expect(recoverImport(base)).toContain('恢复')
    expect(base.getItem(JOURNAL_KEY)).toBeNull()
  })
})

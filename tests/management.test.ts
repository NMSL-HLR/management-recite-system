import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { content } from '../src/content'
import legacy from '../src/data/generated/content.json'
import type { ContentBundle } from '../src/types'
import { defaultPersisted } from '../src/state/defaults'
import { reconcileContent, type RecoveryEntry } from '../src/state/contentRecovery'
import { commitAttempt, startRecall, buildHintContext } from '../src/engine/recall'
import { defaultFusion, decide, lockChapters, retireUnavailableMrc } from '../src/fusion/planner'
import { inspectFusionImport, makeEnvelope } from '../src/fusion/transfer'
import { MANAGEMENT } from '../src/fusion/types'
import { coachInput } from '../src/coach/recallAdapter'
import { buildCandidates } from '../src/coach/candidates'

const old = legacy as ContentBundle
const source = readFileSync('sources/管理学_ultimate.md', 'utf8')
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const normalize = (s: string) => s.replace(/^### .+$/gm, '').replace(/\\(?=[.*])/g, '').replace(/\s+/g, '')
const now = new Date(2026, 9, 21, 10).getTime()
function oldState() {
  const item = old.items.find(i => i.coreA)!
  const state = defaultPersisted()
  const recall = { ...startRecall(item.id, now), draft: '旧版未完成草稿', userNote: '旧版批注' }
  const attempt = commitAttempt({ ...startRecall(item.id, now - 10000), checkedPointIds: item.checkPoints.map(p => p.id), phase: 'restate' }, item, now - 1000, state.settings.gaps, [])
  return { ...state, contentVersion: old.meta.contentVersion, sourceHashes: old.meta.sourceHashes, recall, recallQueue: [item.id], attempts: [attempt], notes: [{ itemId: item.id, text: '原笔记', updatedAt: now }], bookmarks: [item.id], exam: { id: 'old-exam', title: '旧考试', itemIds: [item.id], index: 0, startedAt: now, limitSeconds: null, answers: { [item.id]: { text: '原考试作答', revealed: false } } } }
}

describe('management ultimate replacement', () => {
  it('contains exactly 56 numbered main questions and 22 source appendix groups', () => {
    expect(content.items).toHaveLength(78)
    expect(content.items.filter(i => i.coreA).map(i => Number(i.title.slice(0, 2)))).toEqual(Array.from({ length: 56 }, (_, i) => i + 1))
    expect(content.items.filter(i => i.kind === 'reference').map(i => Number(i.title.slice(1, 3)))).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    expect(content.chapters.filter(c => c.isChapter)).toHaveLength(10)
    expect(content.meta.schemaVersion).toBe(old.meta.schemaVersion)
    expect(content.meta.sourceHashes).toEqual({ A: hash(source), B: hash(source.slice(source.indexOf('# 附录'))) })
  })
  it('preserves every answer paragraph and heading without adding claims or fabricated PDF pages', () => {
    const ids = new Set<string>()
    for (const item of content.items) {
      expect(source).toContain(item.originalMarkdown)
      expect(normalize(item.sections.map(s => s.sourceText).join('\n'))).toBe(normalize(item.originalMarkdown))
      expect(item.pdfPages).toEqual([])
      expect(old.items.some(i => i.id === item.id)).toBe(false)
      for (const cp of item.checkPoints) {
        expect(ids.has(cp.id)).toBe(false); ids.add(cp.id)
        expect(normalize(item.originalMarkdown) + item.reviewedHeadingHints.join('')).toContain(normalize(cp.sourceText))
      }
      expect(item.reviewedHeadingHints).toEqual([...item.originalMarkdown.matchAll(/^### (.+)$/gm)].map(m => m[1]))
    }
  })
  it('does not turn guide, appendix or presumed relations into training tasks', () => {
    const candidates = buildCandidates(coachInput(defaultPersisted()), now)
    expect(candidates).toHaveLength(56)
    expect(candidates.every(c => c.item.coreA)).toBe(true)
    expect(candidates[0].item.id).toBe(content.items[0].id)
    expect(content.relations).toEqual([]); expect(content.keywords).toEqual([])
    const hints = buildHintContext(content.items[0], content.relations, content.keywords, {}, {}, [])
    expect(hints.confirmedSkeletonIds).toEqual([]); expect(hints.keywords).toEqual([]); expect(hints.hasHeadings).toBe(true)
  })
  it('keeps old attempts, notes and drafts while giving new questions no inherited evidence', () => {
    const before = oldState(), snapshot = structuredClone(before)
    const next = reconcileContent(before)
    expect(before).toEqual(snapshot)
    expect(next.attempts).toEqual(before.attempts); expect(next.notes).toEqual(before.notes); expect(next.bookmarks).toEqual(before.bookmarks)
    expect(next.recall).toBeNull(); expect(next.exam).toBeNull()
    const rows = next.migrationReview as RecoveryEntry[]
    expect(rows.find(r => r.recovery?.recall)?.recovery?.recall).toEqual(before.recall)
    expect(rows.find(r => r.recovery?.exam)?.recovery?.exam).toEqual(before.exam)
    expect(buildCandidates(coachInput(next), now).every(c => !c.latest)).toBe(true)
    expect(reconcileContent(next)).toBe(next)
  })
  it('restores a real legacy-version full envelope without discarding other subjects or metadata', () => {
    const before = oldState(), platform = defaultFusion(now)
    const next = inspectFusionImport(JSON.stringify(makeEnvelope(platform, before)), defaultFusion(now), defaultPersisted())
    expect(next.mrc.attempts).toEqual(before.attempts)
    expect(next.platform.general).toEqual(platform.general)
    expect(next.mrc.sourceHashes).toEqual(content.meta.sourceHashes)
    expect(JSON.stringify(next.mrc.migrationReview)).toContain('旧版未完成草稿')
    expect(inspectFusionImport(JSON.stringify(makeEnvelope(next.platform, next.mrc)), defaultFusion(now), defaultPersisted()).mrc).toEqual(next.mrc)
  })
  it('clears obsolete daily chapter and manual scopes so new material can be scheduled immediately', () => {
    const platform = defaultFusion(now)
    platform.day.subjects = [MANAGEMENT]
    platform.day.selectedChapters = { [MANAGEMENT]: ['mrc::a-ch1'], 运动生理学: ['keep'] }
    platform.day.practice = { module: 'mrc', kind: 'chapter', title: '旧章', itemIds: [old.items[0].id] }
    const cleaned = retireUnavailableMrc(platform)
    expect(cleaned.day.practice).toBeUndefined()
    expect(cleaned.day.selectedChapters[MANAGEMENT]).toBeUndefined()
    expect(cleaned.day.selectedChapters['运动生理学']).toEqual(['keep'])
    expect(cleaned.day.budgetMinutes).toBe(platform.day.budgetMinutes)
    expect(retireUnavailableMrc(cleaned)).toBe(cleaned)
    expect(decide(lockChapters(cleaned, defaultPersisted(), now), defaultPersisted(), now).kind).toBe('next')
  })
  it('still rejects unsupported full-backup versions and invalid records', () => {
    const platform = defaultFusion(now)
    expect(() => inspectFusionImport(JSON.stringify(makeEnvelope(platform, { ...oldState(), contentVersion: 'future-v2' })), platform, defaultPersisted())).toThrow()
    expect(() => inspectFusionImport(JSON.stringify(makeEnvelope(platform, { ...oldState(), schemaVersion: 2 })), platform, defaultPersisted())).toThrow()
    const invalid = oldState(); invalid.attempts[0].dueAt = -1
    expect(() => inspectFusionImport(JSON.stringify(makeEnvelope(platform, invalid)), platform, defaultPersisted())).toThrow()
  })
})

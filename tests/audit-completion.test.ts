import { describe, expect, it } from 'vitest'
import { applyTextbookChanges, textbookChanges } from '../src/general/revisions'
import { installBuiltInTextbooks, physiologyPack } from '../src/general/textbook'
import { emptyGeneral } from '../src/general/data'
import { validateMrcFields } from '../src/fusion/validateMrc'
import { defaultPersisted } from '../src/state/defaults'
import { defaultFusion } from '../src/fusion/planner'
import { validatePlatform, writeBundle } from '../src/fusion/transfer'
import { memoryKv, DATA_KEY } from '../src/engine/storage'
import { startRecall } from '../src/engine/recall'
import { content } from '../src/content'
import { durationClock, waitTime } from '../src/browser/format'
import { scriptForHtml } from '../scripts/single-file'

const now = Date.now()
describe('textbook revision without progress reset', () => {
  it('previews same-ID edits; selection updates only source fields and preserves old evidence verbatim', () => {
    const data = installBuiltInTextbooks(emptyGeneral(), now)
    const before = data.points.find(p => p.sourcePackId === physiologyPack.packId)!
    before.totalReviews = 8; before.dueDate = now + 86400000; before.leaks = [{ label: '旧遗漏', due: now - 100 }]
    before.userNote = '私人批注'; before.tags = [{ label: '自定义', color: 'red' }]
    const fresh = { ...before, content: '本次教材勘误', checklist: ['新要点'], sourceHash: 'revision-hash', totalReviews: 0, dueDate: 0, tags: [], leaks: [] }
    const changes = textbookChanges(data, [fresh], physiologyPack.packId)
    expect(changes).toHaveLength(1)
    expect(applyTextbookChanges(data, [fresh], physiologyPack.packId, []).points.find(p => p.id === before.id)).toEqual(before)
    const updated = applyTextbookChanges(data, [fresh], physiologyPack.packId, [before.id])
    const point = updated.points.find(p => p.id === before.id)!
    expect(point).toEqual({ ...before, content: fresh.content, checklist: fresh.checklist, sourceHash: fresh.sourceHash })
    expect(updated.logs).toBe(data.logs)
    expect(updated.logsArchive).toBe(data.logsArchive)
    expect(textbookChanges(updated, [fresh], physiologyPack.packId)).toEqual([])
  })
  it('blocks active-question changes and ID collisions from another source', () => {
    const data = installBuiltInTextbooks(emptyGeneral(), now), old = data.points[0]
    const fresh = { ...old, content: '更正' }
    expect(textbookChanges(data, [fresh], physiologyPack.packId, old.id)[0].blocked).toBe(true)
    expect(() => applyTextbookChanges(data, [fresh], physiologyPack.packId, [old.id], old.id)).toThrow('尚未完成')
    expect(() => textbookChanges(data, [{ ...fresh, sourcePackId: 'other' }], 'other')).toThrow('冲突')
    expect(data.points[0]).toBe(old)
  })
})

describe('write boundaries', () => {
  it('rejects invalid drafts before any backup, journal or data write', () => {
    const p = defaultFusion(now), m = defaultPersisted(), kv = memoryKv()
    kv.setItem(DATA_KEY, 'last-good')
    m.recall = startRecall(content.items[0].id, now)
    Object.assign(m.recall, { checkedPointIds: null })
    const writes: string[] = []
    expect(writeBundle({ ...kv, setItem: (k, v) => { writes.push(k); kv.setItem(k, v) } }, p, m).ok).toBe(false)
    expect(writes).toEqual([])
    expect(kv.getItem(DATA_KEY)).toBe('last-good')
  })
  it('validates a new draft even when immutable historical attempts are already trusted', () => {
    const previous = defaultPersisted()
    const next = { ...previous, recall: startRecall(content.items[0].id, now) }
    Object.assign(next.recall, { selfConfidence: 9 })
    expect(() => validateMrcFields(next, previous)).toThrow()
    const platform = defaultFusion(now)
    expect(() => validatePlatform({ ...platform, session: { checked: null } }, platform.general)).toThrow()
  })
})

it('formats hours and days without long minute counts', () => {
  expect(durationClock(7201)).toBe('2:00:01')
  expect(durationClock(61)).toBe('1:01')
  expect(waitTime(now + 4000 * 60000, now)).toBe('3 天')
})
it('embeds source strings containing HTML closing tags without terminating the script', () => {
  const source = '"</script><script>alert(1)</script><!--"'
  const safe = scriptForHtml(source)
  expect(safe.toLowerCase()).not.toContain('</script')
  expect(JSON.parse(safe.replaceAll('\\x3c', '\\u003c'))).toBe(JSON.parse(source))
})

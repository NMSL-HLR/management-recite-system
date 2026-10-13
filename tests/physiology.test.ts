import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { physiologyPack, installPhysiology } from '../src/general/textbook'
import { emptyGeneral, reviewGeneral } from '../src/general/data'
import { allCandidates, beginTask, defaultFusion, lockChapters } from '../src/fusion/planner'
import { inspectFusionImport } from '../src/fusion/transfer'
import { defaultPersisted } from '../src/state/defaults'
const now = new Date(2026, 9, 13, 10).getTime()
const raw = readFileSync('sources/physiology/运动生理学-最终版.md')
const text = raw.toString('utf8').replace(/\r\n?/g, '\n')
const incoming = readFileSync('346_Physiology_Import.json', 'utf8')

describe('physiology textbook import', () => {
  it('preserves original bytes/hash and every question body without generated additions', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(physiologyPack.sourceHash)
    const questions = [...text.matchAll(/^### (.+)\n/gm)]
    expect(questions).toHaveLength(60); expect(physiologyPack.chapters).toHaveLength(8)
    expect(physiologyPack.chapterNotes['第八章 运动过程中人体机能变化规律']).toBe('（赛前状态→进入工作状态→稳定状态→疲劳状态→恢复状态）')
    for (const [i, q] of questions.entries()) {
      const tail = text.slice(q.index! + q[0].length)
      const nextHeading = tail.search(/^#{2,3} /m)
      const body = (nextHeading === -1 ? tail : tail.slice(0, nextHeading)).trim()
      expect(physiologyPack.points[i].title).toBe(q[1])
      expect(physiologyPack.points[i].content).toBe(body)
      expect(physiologyPack.points[i].checklist).toEqual([...new Set([...body.matchAll(/^#### (.+)$/gm)].map(m => m[1]))])
    }
  })
  it('installs 60 unique items once, blocks all four incomplete answers', () => {
    const general = installPhysiology(emptyGeneral(), now)
    expect(new Set(general.points.map(p => p.id)).size).toBe(60)
    expect(installPhysiology(general, now + 60000)).toBe(general)
    const state = { ...defaultFusion(now), general }
    const candidates = allCandidates(state, defaultPersisted(), now).filter(p => p.module === 'general')
    expect(candidates).toHaveLength(56)
    expect(candidates[0].title).toBe(physiologyPack.points[0].title)
    for (const c of candidates) expect(general.points.find(p => p.id === c.itemId)!.trainingBlocked).toBe(false)
  })
  it('preserves prior grades, due dates, drafts and daily reservations on additive import', () => {
    const base = defaultFusion(now)
    base.general = installPhysiology(emptyGeneral(), now)
    const first = base.general.points[0]
    base.general = reviewGeneral(base.general, first.id, 3, first.checklist!, 'old-result', now)
    const state = lockChapters(base, defaultPersisted(), now)
    const chosen = allCandidates(state, defaultPersisted(), now).find(p => p.module === 'general')!
    const active = beginTask(state, chosen, now)
    active.session!.draft = '正在写的草稿'
    const imported = inspectFusionImport(incoming, active, defaultPersisted()).platform
    expect(imported.general.points).toEqual(active.general.points)
    expect(imported.general.logs).toEqual(active.general.logs)
    expect(imported.day).toEqual(active.day); expect(imported.session).toEqual(active.session)
  })
  it('imports complete metadata and keeps incomplete questions outside older builds training points', () => {
    const file = JSON.parse(incoming)
    expect(file.points).toHaveLength(56); expect(file.referencePoints).toHaveLength(4)
    const plan = inspectFusionImport(incoming, defaultFusion(now), defaultPersisted())
    expect(plan.platform.general.points).toHaveLength(60)
    expect(plan.platform.general.points.filter(p => p.trainingBlocked)).toHaveLength(4)
    expect(installPhysiology(plan.platform.general, now)).toBe(plan.platform.general)
  })
  it('does not overwrite an existing same-id record while installing missing textbook items', () => {
    const complete = installPhysiology(emptyGeneral(), now)
    const existing = { ...complete.points[0], content: '用户自己的修订', totalReviews: 7, dueDate: now + 123456 }
    const before = { ...emptyGeneral(), points: [existing] }
    const after = installPhysiology(before, now)
    expect(after.points[0]).toBe(existing); expect(after.points).toHaveLength(60)
  })
  it('recognizes personal history exported by an older build that retained the textbook format', () => {
    const file = JSON.parse(incoming)
    const general = { ...emptyGeneral(), ...file }
    const reviewed = reviewGeneral(general, general.points[0].id, 3, [], 'legacy-progress', now)
    const plan = inspectFusionImport(JSON.stringify(reviewed), defaultFusion(now), defaultPersisted())
    expect(plan.kind).toBe('旧记忆引擎')
    expect(plan.platform.general.logs[0].id).toBe('legacy-progress')
    expect(plan.platform.general.points.find(p => p.id === general.points[0].id)!.totalReviews).toBe(1)
    expect(plan.platform.general.points).toHaveLength(60)
  })
})

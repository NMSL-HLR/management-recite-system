import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const sha = s => createHash('sha256').update(s).digest('hex')
const clean = s => s.replace(/^<a [^>]+><\/a>\s*$/gm, '').replace(/^---\s*$/gm, '').trim()
const plain = s => s.replace(/\*\*/g, '').trim()
for (const spec of [
  { file: '运动生理学.md', subject: '运动生理学', packId: 'physiology-20261029', prefix: 'phys-20261029', chapterLevel: 2, questionLevel: 3, headingLevel: 4, count: 73, chapters: 9, out: 'physiology/physiology', export: '346_Physiology_Import.json' },
  { file: '体育概论_40题优先背诵专册.md', subject: '体育概论', packId: 'sports-overview-20261029', prefix: 'overview-20261029', chapterLevel: 1, questionLevel: 2, headingLevel: 3, count: 40, chapters: 10, out: 'policy/policy', export: '346_Sports_Policy_Import.json' },
]) {
  const sourceFile = `sources/${spec.file}`, raw = readFileSync(sourceFile, 'utf8')
  const text = raw.replace(/\r\n?/g, '\n'), sourceHash = sha(raw)
  const headers = [...text.matchAll(new RegExp(`^(#{${spec.chapterLevel},${spec.questionLevel}}) (.+)$`, 'gm'))]
  const points = [], chapters = [], chapterNotes = {}; let chapter = '', firstChapter = -1
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (h[1].length === spec.chapterLevel) {
      if (!/^第.+章|^附录/.test(h[2])) { chapter = ''; continue }
      chapter = h[2]; chapters.push(chapter); if (firstChapter < 0) firstChapter = h.index
      const note = clean(text.slice(h.index + h[0].length, headers[i+1]?.index ?? text.length)); if (note) chapterNotes[chapter] = note
      continue
    }
    if (!chapter) continue
    const rawSourceContent = text.slice(h.index + h[0].length, headers[i+1]?.index ?? text.length).trim()
    const content = clean(rawSourceContent)
    // Learning tips and source citations remain visible, but are not answer requirements.
    const reviewContent = content.split(/\n\s*\n/).filter(p => !/^(记忆提示|来源说明|原总册第)/.test(p.trim())).join('\n\n')
    let checklist = [...reviewContent.matchAll(new RegExp(`^#{${spec.headingLevel}} (.+)$`, 'gm'))].map(m => m[1])
    const paragraphChecklist = checklist.length === 0
    if (!checklist.length) checklist = reviewContent.split('\n').filter(l => /^\d+[.．、 ]/.test(l)).map(l => plain(l).split(/[。\n]/)[0])
    assert.ok(content && checklist.length, `No answer/checklist: ${h[2]}`)
    assert.equal(new Set(checklist).size, checklist.length, `Duplicate checkpoints: ${h[2]}`)
    points.push({ id: `${spec.prefix}-${String(points.length + 1).padStart(3,'0')}`, subject: spec.subject, title: h[2], content, rawSourceContent, checklist, paragraphChecklist, tags: [], leaks: [], quotaChapterOverride: chapter, sourcePackId: spec.packId, sourceHash, sourceRevision: '2026-10-29', sourceQuestionHash: sha(content), sourceOrder: points.length+1, sourceLine: text.slice(0,h.index).split('\n').length, trainingBlocked: false,
      createdAt: 0, dueDate: 0, difficulty: 5, stability: 0.4, interval: 0, repetitions: 0, totalReviews: 0, lapses: 0, state: 'new' })
  }
  assert.equal(points.length, spec.count); assert.equal(chapters.length, spec.chapters)
  const pack = { format: '346-textbook', packVersion: 1, packId: spec.packId, revision: '2026-10-29', title: spec.file.replace('.md',''), sourceFile, sourceHash, preface: clean(text.slice(0,firstChapter)), chapters, chapterNotes, points, logs: [], logsArchive: [], subjects: [spec.subject], settings: {} }
  writeFileSync(`src/data/${spec.out}.json`, JSON.stringify(pack,null,2)+'\n')
  writeFileSync(spec.export, JSON.stringify({...pack, referencePoints: []},null,2)+'\n')
  writeFileSync(`reports/${spec.out.split('/')[0]}-20261029-import.json`, JSON.stringify({ sourceFile, sourceHash, total: points.length, chapters, items: points.map(p=>({id:p.id,title:p.title,checklist:p.checklist})) },null,2)+'\n')
  console.log(`${spec.subject}: ${points.length} trainable modules, ${chapters.length} chapters`)
}

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

// A/B are compatibility slots: main questions / short appendix, not the old books.
const raw = readFileSync('sources/管理学_ultimate.md', 'utf8')
const hash = text => createHash('sha256').update(text).digest('hex')
const clean = text => text.replace(/(\d+)\\\.[ \t]*\n?/g, '$1. ').replace(/\\([*])/g, '$1').trim()
const plain = text => clean(text).replace(/\*\*/g, '')
const start = raw.indexOf('# 第一章')
const appendixStart = raw.indexOf('# 附录')
assert.ok(start > 0 && appendixStart > start)
const main = raw.slice(start, appendixStart)
const appendix = raw.slice(appendixStart)
const chapters = [], items = [], pages = []
const guide = raw.slice(0, raw.indexOf('# 目')).trim()
chapters.push({ id: 'ultimate-guide', source: 'A', title: '使用说明', index: 0, isAppendix: false, isChapter: false, isGuide: true, intro: clean(guide), flow: [] })
pages.push({ source: 'A', page: 0, anchor: 'ultimate-guide', markdown: guide })
// Explicit source excerpts reviewed for sporting application where the author did
// not use “例如”. These classify existing paragraphs; they never add answer text.
const sportsExcerpts = [
  '体育情境不同', '教练临场换人时', '赛事筹备可先确定目标',
  '主教练临时委托助理教练', '运动队应把成绩目标与队员成长',
  '对运动员而言', '运动员管理中', '运动队的奖励应说明',
  '运动队开展训练方案讨论时', '赛事的赛前设施检查',
  '赛时调度缺岗志愿者', '赛后评估、赛季复盘',
  '运动队应维持基本训练秩序', '运动队更换训练管理方式时',
]
for (const quote of sportsExcerpts) assert.ok(raw.includes(quote), `Missing reviewed excerpt: ${quote}`)
const chapterMatches = [...main.matchAll(/^# (.+)$/gm)]
function addItem(title, body, chapter, number, reference = false) {
  const id = `mgt-ultimate-202610-${reference ? 'a' : 'q'}${String(number).padStart(2, '0')}`
  const originalMarkdown = body.trim()
  const sections = [], checkPoints = []
  const parts = [...originalMarkdown.matchAll(/^### (.+)$/gm)]
  const blocks = parts.length ? parts.map((m, i) => ({ title: m[1], text: originalMarkdown.slice(m.index + m[0].length, parts[i + 1]?.index ?? originalMarkdown.length).trim() })) : [{ title: '', text: originalMarkdown }]
  for (const [bi, block] of blocks.entries()) {
    if (block.title) checkPoints.push({ id: `${id}-h${bi}`, level: 1, label: block.title, sourceText: block.title, group: block.title, role: 'heading' })
    const paragraphs = clean(block.text).split(/\n\s*\n/).filter(Boolean)
    for (const [pi, paragraph] of paragraphs.entries()) {
      const text = paragraph.replace(/([^\n])\n([^\n])/g, '$1$2')
      sections.push({ id: `${id}-s${bi}-${pi}`, ...(block.title ? { title: block.title } : {}), sourceText: text, layer: reference ? 'normal' : 'short_answer' })
      if (reference) continue
      const label = plain(text)
      checkPoints.push({ id: `${id}-p${bi}-${pi}`, level: 2, label, sourceText: text, group: block.title, role: 'point' })
      // Separate completeness checkpoint; keep the original theory point as well.
      // Only concrete sporting context in the source; never generate an example.
      if (sportsExcerpts.some(quote => text.includes(quote)) || (/(运动队|运动员|教练|场馆|办赛|赛事|健身|俱乐部)/.test(text) && /例如|如，|如：|比如|运动队只有|场馆既要|办赛时|体育情境|体育应用|体育实践/.test(text + block.title))) {
        checkPoints.push({ id: `${id}-sport${bi}-${pi}`, level: 2, label: `体育情境：${label}`, sourceText: text, group: block.title, role: 'sports' })
      }
    }
  }
  items.push({ id, source: chapter.source, kind: reference ? 'reference' : 'full_answer', chapterId: chapter.id, chapter: chapter.title, chapterIndex: chapter.index, title, pdfPages: [], anchor: id,
    originalMarkdown, sections, tables: [], reviewedHeadingHints: parts.map(m => m[1]), reviewedKeywordHints: [], redlineIds: [], confirmedRelatedIds: [], candidateRelatedIds: [], sourceSignals: [], checkPoints,
    coreA: !reference, appendixFullAnswer: false, fullTextForLookup: false })
  chapter.flow.push({ type: 'item', itemId: id })
  pages.push({ source: chapter.source, page: number, anchor: id, markdown: `${title}\n\n${originalMarkdown}` })
}
for (const [ci, m] of chapterMatches.entries()) {
  const body = main.slice(m.index + m[0].length, chapterMatches[ci + 1]?.index ?? main.length)
  const chapter = { id: `ultimate-c${ci + 1}`, source: 'A', title: m[1], index: ci + 1, isAppendix: false, isChapter: true, isGuide: false, intro: '', flow: [] }
  chapters.push(chapter)
  const matches = [...body.matchAll(/^## (\d{2})[　 ]+(.+)$/gm)]
  assert.ok(matches.length, chapter.title)
  for (const [i, q] of matches.entries()) addItem(`${q[1]}　${q[2]}`, body.slice(q.index + q[0].length, matches[i + 1]?.index ?? body.length), chapter, Number(q[1]))
}
const chapter = { id: 'ultimate-appendix', source: 'B', title: '附录　名词解释与低频补漏', index: 11, isAppendix: true, isChapter: false, isGuide: false, intro: '', flow: [] }
chapters.push(chapter)
const matches = [...appendix.matchAll(/^A(\d{2})[　 ]+(.+)$/gm)]
chapter.intro = clean(appendix.slice(appendix.indexOf('\n') + 1, matches[0].index))
for (const [i, q] of matches.entries()) addItem(`A${q[1]}　${q[2]}`, appendix.slice(q.index + q[0].length, matches[i + 1]?.index ?? appendix.length), chapter, Number(q[1]), true)
assert.equal(chapterMatches.length, 10)
assert.equal(items.filter(i => i.coreA).length, 56)
assert.equal(matches.length, 22)
assert.equal(new Set(items.map(i => i.id)).size, 78)
assert.deepEqual(items.filter(i => i.coreA).map(i => Number(i.title.slice(0, 2))), Array.from({ length: 56 }, (_, i) => i + 1))
assert.ok(items.every(i => i.sections.length && i.originalMarkdown))
const content = { meta: { schemaVersion: 1, contentVersion: '2026-10-21-management-ultimate-v1', sourceHashes: { A: hash(raw), B: hash(appendix) }, builtAt: '2026-10-21T00:00:00.000Z' }, versionConflict: { aStatement: '正文56题：50道简述题＋6道论述题。', bStatement: '附录22组用于名解与辨析，仅供查阅。', resolution: '管理学 ultimate 新版；旧 A/B 册学习记录保留，不继承为新题成绩。' }, chapters, items, pages, relations: [], keywords: [] }
writeFileSync('src/data/generated/management-ultimate.json', JSON.stringify(content))
console.log(`Management ultimate: ${items.length} items, 56 trainable, 22 references. SHA256 ${hash(raw)}`)

const legacy = JSON.parse(readFileSync('src/data/generated/content.json', 'utf8'))
writeFileSync('src/data/generated/management-legacy-index.json', JSON.stringify(Object.fromEntries(legacy.items.map(i => [i.id, { title: i.title, chapter: i.chapter }]))))

writeFileSync('reports/management-import.json', JSON.stringify({ source: 'sources/管理学_ultimate.md', sourceHash: hash(raw), contentVersion: content.meta.contentVersion, main: 56, reference: 22, items: items.map(i => ({ id: i.id, title: i.title, kind: i.kind, chapterId: i.chapterId, sections: i.sections.length, checkpoints: i.checkPoints.length, sportsCheckpoints: i.checkPoints.filter(p => p.role === 'sports').map(p => ({ id: p.id, sourceText: p.sourceText })) })) }, null, 2) + '\n')

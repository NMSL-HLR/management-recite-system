import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = readFileSync(join(root, 'sources/physiology/运动生理学-最终版.md'))
const sha = value => createHash('sha256').update(value).digest('hex')
const text = raw.toString('utf8').replace(/\r\n?/g, '\n')
const headings = [...text.matchAll(/^(#{2,3}) (.+)$/gm)]
let chapter = ''
const chapters = [], points = []
const chapterNotes = {}
const packId = 'physiology-final-v1'
const sourceHash = sha(raw)
for (let i = 0; i < headings.length; i++) {
  const h = headings[i]
  if (h[1] === '##') {
    chapter = h[2]; chapters.push(chapter)
    const note = text.slice(h.index + h[0].length, headings[i + 1]?.index ?? text.length).trim()
    if (note) chapterNotes[chapter] = note
    continue
  }
  if (!chapter) throw new Error('题目缺少章节')
  const body = text.slice(h.index + h[0].length, headings[i + 1]?.index ?? text.length).trim()
  if (!body) throw new Error(`空正文：${h[2]}`)
  const checklist = [...new Set([...body.matchAll(/^#### (.+)$/gm)].map(m => m[1]))]
  const trainingBlocked = /内容待补充/.test(body)
  points.push({
    id: `phys-${sha(`${packId}\n${chapter}\n${h[2]}`).slice(0, 24)}`,
    subject: '运动生理学', title: h[2], content: body, checklist, tags: [], leaks: [],
    quotaChapterOverride: chapter, sourcePackId: packId, sourceHash,
    sourceQuestionHash: sha(body), sourceOrder: points.length + 1,
    sourceLine: text.slice(0, h.index).split('\n').length,
    trainingBlocked,
    createdAt: 0, dueDate: 0, difficulty: 5, stability: 0.4, interval: 0,
    repetitions: 0, totalReviews: 0, lapses: 0, state: 'new',
  })
}
if (chapters.length !== 8 || points.length !== 60 || new Set(points.map(p => p.id)).size !== 60) throw new Error('章节、题目数或唯一标识不符合原稿')
const pack = { format: '346-textbook', packVersion: 1, packId, title: '《运动生理学》最终版', sourceHash,
  preface: text.slice(0, headings[0].index).trim(), chapters, chapterNotes, points, logs: [], logsArchive: [], subjects: ['运动生理学'], settings: {} }
const serialized = JSON.stringify(pack, null, 2) + '\n'
writeFileSync(join(root, 'src/data/physiology/physiology.json'), serialized)
const blocked = points.filter(p => p.trainingBlocked)
// Older fusion builds ignore the reference appendix, so incomplete questions cannot become training tasks there.
writeFileSync(join(root, '346_Physiology_Import.json'), JSON.stringify({ ...pack, points: points.filter(p => !p.trainingBlocked), referencePoints: blocked }, null, 2) + '\n')
const report = { sourceHash, chapters: chapters.map(title => ({ title, count: points.filter(p => p.quotaChapterOverride === title).length })),
  total: points.length, trainable: points.length - blocked.length, referenceOnly: blocked.map(p => ({ id: p.id, title: p.title, chapter: p.quotaChapterOverride })),
  preservation: '原文件逐字节归档；正文仅统一换行并去掉题目边界空行；不补写、不纠错、不移动原章节。核对项只取原文四级标题。' }
writeFileSync(join(root, 'reports/physiology-import.json'), JSON.stringify(report, null, 2) + '\n')
process.stdout.write(JSON.stringify({ questions: points.length, trainable: points.length - blocked.length, referenceOnly: blocked.length }) + '\n')

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const raw = readFileSync('sources/policy/政策热点班_第一至第五讲_一点一两句背诵版.md')
const text = raw.toString('utf8').replace(/\r\n?/g, '\n')
const sha = value => createHash('sha256').update(value).digest('hex')
const sourceHash = sha(raw), packId = 'sports-policy-lectures-1-5-v1'
const headings = [...text.matchAll(/^(#{2,4}) (.+)$/gm)]
const points = [], chapters = []
let chapter = ''
for (let i = 0; i < headings.length; i++) {
  const h = headings[i]
  if (h[1] === '##' && /^第.+讲｜/.test(h[2])) { chapter = h[2]; chapters.push(chapter); continue }
  const reference = h[1] === '###' && h[2].startsWith('B｜')
  if (!chapter || (!reference && h[1] !== '####')) continue
  const body = text.slice(h.index + h[0].length, headings[i + 1]?.index ?? text.length).trim()
  if (!body) throw new Error('Empty policy content')
  points.push({ id: `policy-${sha(`${packId}\n${chapter}\n${h[2]}`).slice(0,24)}`, subject: '体育概论', title: reference ? `${chapter}｜补漏骨架` : h[2], content: body,
    checklist: reference ? [] : [...new Set([...body.matchAll(/^\d+\.\s+([^。\n]+)。/gm)].map(m => m[1]))],
    quotaChapterOverride: chapter, sourcePackId: packId, sourceHash, sourceQuestionHash: sha(body), sourceOrder: points.length + 1, sourceLine: text.slice(0,h.index).split('\n').length,
    trainingBlocked: reference, ...(reference ? { referenceReason: '补漏查询，不自动安排训练' } : {}),
    tags: [], leaks: [], createdAt: 0, dueDate: 0, difficulty: 5, stability: 0.4, interval: 0, repetitions: 0, totalReviews: 0, lapses: 0, state: 'new' })
}
if (chapters.length !== 5 || points.length !== 20 || points.filter(p => !p.trainingBlocked).length !== 15 || new Set(points.map(p=>p.id)).size !== 20) throw new Error('Policy source structure mismatch')
const firstLecture = headings.find(h => h[1] === '##' && /^第.+讲｜/.test(h[2]))
const pack = { format: '346-textbook', packVersion: 1, packId, title: '政策热点班｜第一至第五讲｜一点一两句背诵版', sourceHash, preface: text.slice(0,firstLecture.index).trim(), chapters, points, logs: [], logsArchive: [], subjects: ['体育概论'], settings: {} }
writeFileSync('src/data/policy/policy.json', JSON.stringify(pack,null,2)+'\n')
writeFileSync('346_Sports_Policy_Import.json', JSON.stringify({...pack, points: points.filter(p=>!p.trainingBlocked), referencePoints: points.filter(p=>p.trainingBlocked)},null,2)+'\n')
writeFileSync('reports/policy-import.json', JSON.stringify({sourceHash, chapters, trainable:15, reference:5, total:20},null,2)+'\n')
console.log('Sports policy: 5 lectures, 15 training questions, 5 reference outlines.')

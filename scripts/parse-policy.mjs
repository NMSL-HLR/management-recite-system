import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const sourceFile = 'sources/policy/政策热点班_第一至第六讲_一句话积木骨架版_2026-10-18.md'
const raw = readFileSync(sourceFile), text = raw.toString('utf8').replace(/\r\n?/g, '\n')
const sha = value => createHash('sha256').update(value).digest('hex')
// Stable lineage: keep old IDs for the same 15 homework topics and five lookup outlines.
const packId = 'sports-policy-lectures-1-5-v1', revision = '2026-10-18-blocks-1-6', sourceHash = sha(raw)
const old = readFileSync('sources/policy/政策热点班_第一至第五讲_一点一两句背诵版.md', 'utf8')
const oldHeaders = [...old.matchAll(/^(#{2,4}) (.+)$/gm)]
const oldIds = new Map(); let oldChapter = '', oldNumber = 0
for (const h of oldHeaders) {
  if (h[1] === '##' && /^第.+讲｜/.test(h[2])) { oldChapter = h[2]; oldNumber = 0 }
  else if (h[1] === '####' || (h[1] === '###' && h[2].startsWith('B｜'))) {
    const key = `${oldChapter}/${h[1] === '####' ? ++oldNumber : 'reference'}`
    oldIds.set(key, { id: `policy-${sha(`${packId}\n${oldChapter}\n${h[2]}`).slice(0,24)}`, title: h[2] })
  }
}
const anchors = [...text.matchAll(/^<span id="(bm_ch[1-6]|bm_shared|bm_end)" class="anchor"><\/span>\*\*(.+)\*\*$/gm)]
const clean = value => value.replace(/^> ?/gm, '').replace(/\*\*/g, '').trim()
const points = [], chapters = [], mappings = []
function add(title, body, chapter, key, reference, offset) {
  const previous = oldIds.get(key), content = clean(body)
  const labels = reference ? [] : [...content.matchAll(/^\d+\.\s+([^：\n]+)：/gm)].map(m => m[1])
  if (!content || (!reference && !labels.length) || new Set(labels).size !== labels.length) throw Error(`Invalid policy block: ${title}`)
  const id = previous?.id ?? `policy-${sha(`${packId}\n${key}`).slice(0,24)}`
  points.push({ id, subject: '体育概论', title, content, checklist: labels, rawSourceContent: body.trim(),
    quotaChapterOverride: chapter, sourcePackId: packId, sourceRevision: revision, sourceHash, sourceQuestionHash: sha(content), sourceOrder: points.length + 1, sourceLine: text.slice(0, offset).split('\n').length,
    trainingBlocked: reference, ...(reference ? { referenceReason: '积木查询，不自动安排训练' } : {}),
    tags: [], leaks: [], createdAt: 0, dueDate: 0, difficulty: 5, stability: 0.4, interval: 0, repetitions: 0, totalReviews: 0, lapses: 0, state: 'new' })
  if (previous) mappings.push({ id, before: previous.title, after: title, chapter })
}
for (let i = 0; i < anchors.length; i++) {
  const a = anchors[i], chapter = a[2], start = a.index + a[0].length
  const block = text.slice(start, anchors[i + 1]?.index ?? text.length)
  chapters.push(chapter)
  if (/^bm_ch/.test(a[1])) {
    const homework = [...block.matchAll(/^\*\*(作业[一二三]：.+)\*\*$/gm)]
    const reference = /^\*\*B．.+\*\*$/m.exec(block)
    if (homework.length !== 3 || !reference || reference.index <= homework[2].index) throw Error(`Lecture structure mismatch: ${chapter}`)
    homework.forEach((h, n) => add(h[1], block.slice(h.index + h[0].length, homework[n+1]?.index ?? reference.index), chapter, `${chapter}/${n+1}`, false, start + h.index))
    add(`${chapter}｜积木查询`, block.slice(reference.index), chapter, `${chapter}/reference`, true, start + reference.index)
  } else add(chapter, block, chapter, `${chapter}/reference`, true, start)
}
const trainable = points.filter(p => !p.trainingBlocked).length, reference = points.length - trainable
if (anchors.length !== 8 || trainable !== 18 || reference !== 8 || mappings.length !== 20 || new Set(points.map(p=>p.id)).size !== 26) throw Error('Policy source structure mismatch')
const pack = { format: '346-textbook', packVersion: 1, packId, revision, title: '政策热点班｜第一至第六讲｜一句话积木骨架版', sourceHash, sourceFile, preface: clean(text.slice(0,anchors[0].index).replace(/<span[^>]*><\/span>/g, '')), chapters, points, logs: [], logsArchive: [], subjects: ['体育概论'], settings: {} }
writeFileSync('src/data/policy/policy.json', JSON.stringify(pack,null,2)+'\n')
writeFileSync('346_Sports_Policy_Import.json', JSON.stringify({...pack, points: points.filter(p=>!p.trainingBlocked), referencePoints: points.filter(p=>p.trainingBlocked)},null,2)+'\n')
writeFileSync('reports/policy-import.json', JSON.stringify({sourceHash, revision, chapters, trainable, reference, total:points.length, mappings, numberedBlocks: [...text.matchAll(/^> \*\*\d+\./gm)].length},null,2)+'\n')
console.log(`Sports policy: 6 lectures, ${trainable} training questions, ${reference} reference blocks.`)

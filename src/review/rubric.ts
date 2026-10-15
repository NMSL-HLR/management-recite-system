import type { StudyItem } from '../types'
import type { GeneralPoint } from '../fusion/types'
import type { ReviewPoint } from './types'
import { canonical, plain } from './text'

export function mrcRubric(item: StudyItem): ReviewPoint[] {
  return item.checkPoints.map(p => ({ id: p.id, label: p.label, reference: p.sourceText,
    group: p.group, role: /原资料提示|教材思考题|来源说明/.test(p.sourceText) ? 'reference' : p.role,
    confirmable: true, source: `${item.source}册 · ${item.chapter} · PDF ${item.pdfPages.join('、')}页` }))
}

function headingKind(line: string): { kind: string; level: number } | null {
  const text = line.normalize('NFKC').replace(/\*\*/g, '').trim()
  const md = text.match(/^(#{1,6})\s/)
  if (md) return { kind: 'markdown', level: md[1].length }
  if (/^\d+(?:\.\s+|、)/.test(text)) return { kind: 'number', level: 0 }
  if (/^\([一二三四五六七八九十百零]+\)/.test(text)) return { kind: 'chinese-parenthesis', level: 0 }
  if (/^\(\d+\)/.test(text)) return { kind: 'number-parenthesis', level: 0 }
  return null
}

/** Use only unambiguous headings from this question. Never attach the whole answer to each label. */
export function generalRubric(point: Pick<GeneralPoint, 'content' | 'checklist' | 'subject' | 'title'>): ReviewPoint[] {
  const labels = [...new Set(point.checklist ?? [])]
  if (!labels.length) return [{ id: 'whole-answer', label: '整题原文（未设置核对点）', reference: point.content,
    group: '整题核对', role: 'point', confirmable: false, source: `${point.subject} · ${point.title}` }]
  const lines = point.content.split('\n')
  const starts = labels.map(label => {
    const target = canonical(label)
    const matches = lines.flatMap((line, index) => target.length >= 2 && canonical(line).startsWith(target) ? [index] : [])
    return matches.length === 1 ? matches[0] : -1
  })
  return labels.map((label, i) => {
    const start = starts[i]
    let end = start < 0 ? -1 : Math.min(lines.length, ...starts.filter(n => n > start))
    const heading = start < 0 ? null : headingKind(lines[start])
    for (let n = start + 1; start >= 0 && n < end; n++) {
      const other = headingKind(lines[n])
      if (heading && other?.kind === heading.kind && other.level <= heading.level) { end = n; break }
    }
    let reference = start < 0 ? '' : lines.slice(start, end).join('\n').trim()
    // The heading is not sufficient evidence for its explanation; review the body if present.
    if (reference && canonical(lines[start]) === canonical(label)) reference = lines.slice(start + 1, end).join('\n').trim()
    else if (reference) {
      const line = plain(lines[start]), cleanLabel = plain(label)
      if (line.startsWith(cleanLabel)) reference = [line.slice(cleanLabel.length).replace(/^[。:：\s]+/, ''), ...lines.slice(start + 1, end)].join('\n').trim()
    }
    return { id: label, label, reference, group: point.subject, role: 'point', confirmable: true, source: `${point.subject} · ${point.title} · ${label}` }
  })
}

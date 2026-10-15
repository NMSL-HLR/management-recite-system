/** Keep wording, polarity, numbers and chemical signs; remove formatting, never "correct" OCR. */
export function plain(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\*\*|__/g, '')
    .split('\n').map(line => line.replace(/^\s*(?:#{1,6}\s+|\*\s+|[-+]\s+(?=[^\s\d０-９.．]))/, '')
      .replace(/^\s*(?:[（(][一二三四五六七八九十百零\d０-９]+[）)]|[一二三四五六七八九十百零]+[、.]|[\d０-９]+[、.．]\s+|[①②③④⑤⑥⑦⑧⑨⑩])\s*/, '').trim()).join('\n').trim()
}
export function canonical(text: string): string {
  return plain(text.normalize('NFKC')).toLowerCase().replace(/[−–]/g, '-').replace(/[^\p{L}\p{N}+<>=≤≥≠%*\/×÷^.:→←↑↓-]/gu, '')
}
export function clauses(text: string): string[] {
  return plain(text).split(/(?<=[。！？!?；;])|\n+/u).map(s => s.trim()).filter(s => canonical(s).length > 0)
}
export function grams(text: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + 1 < text.length; i++) out.add(text.slice(i, i + 2))
  return out
}

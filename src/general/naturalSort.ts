/**
 * 章节感知的自然排序：
 * 识别"第X章"（X 为中文数字或阿拉伯数字，支持到 999），按章节数值排序；
 * 无章节号的标题排在有章节号的之后，其余按中文 locale + 数字感知比较
 * （保证"名词解释2"排在"名词解释10"前面）。
 */

const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

/** 解析中文/阿拉伯数字（0~999），无法解析返回 null */
export function parseChineseNumber(input: string): number | null {
  const s = input.trim()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (!s) return null
  let rest = s
  let result = 0
  let matched = false

  const bai = rest.indexOf('百')
  if (bai >= 0) {
    const h = rest.slice(0, bai)
    result += (h ? (CN_DIGITS[h] ?? NaN) : 1) * 100
    rest = rest.slice(bai + 1)
    matched = true
  }
  const shi = rest.indexOf('十')
  if (shi >= 0) {
    const t = rest.slice(0, shi)
    result += (t ? (CN_DIGITS[t] ?? NaN) : 1) * 10
    rest = rest.slice(shi + 1)
    matched = true
  }
  if (rest) {
    const d = CN_DIGITS[rest]
    if (d === undefined) {
      // 存在无法识别的尾字（如"零"以外的字符）
      if (!matched) return null
    } else {
      result += d
      matched = true
    }
  }
  if (Number.isNaN(result) || !matched) return null
  return result
}

/** 从标题提取章节号："第十六章 xxx" → 16；无章节返回 null */
export function chapterNumber(title: string): number | null {
  const m = title.match(/第\s*([一二两三四五六七八九十百零\d]+)\s*章/)
  return m ? parseChineseNumber(m[1]) : null
}

/** 章节感知比较器：先比章节号，再比标题（数字感知） */
export function naturalTitleCompare(a: string, b: string): number {
  const ca = chapterNumber(a)
  const cb = chapterNumber(b)
  if (ca !== null && cb !== null && ca !== cb) return ca - cb
  if (ca !== null && cb === null) return -1
  if (ca === null && cb !== null) return 1
  return a.localeCompare(b, 'zh-Hans-CN', { numeric: true })
}


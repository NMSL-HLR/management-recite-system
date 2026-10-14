/** Calendar date in the user's browser, not the UTC date used by timestamps. */
export function localDateStamp(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Keep the URL alive until the browser has consumed the download request. */
export function downloadText(text: string, name: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.hidden = true
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function downloadJson(value: unknown, name: string) {
  downloadText(JSON.stringify(value, null, 2), name, 'application/json;charset=utf-8')
}

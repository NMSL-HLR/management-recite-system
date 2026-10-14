/** Keep a browser-managed exclusive lock until this document is destroyed. No lease expiry races. */
export function startExclusiveSession(start: () => void, blocked: (message: string) => void) {
  if (!navigator.locks) {
    blocked('此浏览器不支持安全的多窗口写入保护。请使用当前版 Chrome、Edge、Firefox 或 Safari；仍可备份原始数据。')
    return
  }
  void navigator.locks.request('346-fusion-single-writer-v1', { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) { blocked('另一个窗口正在使用这份学习记录。本窗口未启动训练或写入；关闭另一个窗口后，可重新打开本页。'); return }
    start()
    await new Promise<void>(() => { /* Browser releases the lock when the document closes. */ })
  }).catch(() => blocked('浏览器无法建立安全写入会话。请保留当前数据，备份后在受支持的浏览器中重新打开。'))
}

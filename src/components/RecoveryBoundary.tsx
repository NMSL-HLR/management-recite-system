import { Component, useState, type ReactNode } from 'react'
import { downloadJson, localDateStamp } from '../browser/download'
import { collectRecovery } from '../browser/recovery'

/** Outside both providers, so recovery does not need a functioning application store. */
export function RecoveryScreen({ message }: { message: string }) {
  const [feedback, setFeedback] = useState('')
  const backup = () => {
    try {
      const recovery = collectRecovery(key => window.localStorage.getItem(key))
      if (!Object.keys(recovery.raw).length) {
        setFeedback('浏览器拒绝读取本地存储，未生成空备份。请保留当前文件与浏览器数据，恢复存储访问后重试。')
        return
      }
      downloadJson(recovery, `346-Recovery-${localDateStamp()}.json`)
      setFeedback(Object.keys(recovery.readErrors).length
        ? '已发起部分原始数据下载；文件中标明了读取失败的项目。请检查浏览器下载列表。'
        : '已发起原始数据下载，请检查浏览器下载列表。该文件供恢复排查，不能直接作为全科整包导入。')
    } catch { setFeedback('备份下载未能发起。请保留当前文件与浏览器数据，检查下载权限后重试。') }
  }
  return <main className="recovery-screen stack">
    <h1>学习界面暂时无法继续</h1>
    <p>{message}</p>
    <p>当前训练界面已停止运行。请先备份再尝试重新打开；不要清除浏览器数据。</p>
    <p className="muted">原始备份保留浏览器已存储的数据，不能保证包含尚未保存的输入，也不会修复或覆盖原记录。</p>
    <div className="actions"><button className="btn primary" onClick={backup}>备份原始数据</button><button className="btn" onClick={() => window.location.reload()}>重新打开</button></div>
    {feedback && <p role="status">{feedback}</p>}
  </main>
}

export class RecoveryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <RecoveryScreen message="页面发生异常，已切换到独立恢复界面。" /> : this.props.children
  }
}

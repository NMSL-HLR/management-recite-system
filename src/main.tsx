import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FusionApp } from './fusion/FusionApp'
import { FusionProvider } from './fusion/store'
import { recoverImport } from './fusion/transfer'
import { AppProvider } from './state/store'
import './styles.css'
import './fusion/memory-theme.css'

let recoveryMessage: string | null = null
try { recoveryMessage = recoverImport(localStorage) } catch { recoveryMessage = '本地存储访问失败，请换到允许本地存储的浏览器后重新打开。' }
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {recoveryMessage?.includes('失败') ? <main><h1>学习记录受保护</h1><p>{recoveryMessage}</p><p>程序已暂停写入。请释放浏览器存储空间后重新打开，恢复完成后再继续训练。</p></main> : <AppProvider>
      <FusionProvider recoveryMessage={recoveryMessage}><FusionApp /></FusionProvider>
    </AppProvider>}
  </StrictMode>,
)

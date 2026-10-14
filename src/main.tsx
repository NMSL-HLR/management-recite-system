import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FusionApp } from './fusion/FusionApp'
import { FusionProvider } from './fusion/store'
import { recoverImport } from './fusion/transfer'
import { AppProvider } from './state/store'
import { RecoveryBoundary, RecoveryScreen } from './components/RecoveryBoundary'
import './styles.css'
import './fusion/memory-theme.css'

let recoveryMessage: string | null = null
try { recoveryMessage = recoverImport(localStorage) } catch { recoveryMessage = '本地存储访问失败，请换到允许本地存储的浏览器后重新打开。' }
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecoveryBoundary>
      {recoveryMessage?.includes('失败') ? <RecoveryScreen message={recoveryMessage} /> : <AppProvider>
        <FusionProvider recoveryMessage={recoveryMessage}><FusionApp /></FusionProvider>
      </AppProvider>}
    </RecoveryBoundary>
  </StrictMode>,
)

import { useLayoutEffect, useState } from 'react'

export type Skin = 'neo' | 'hmos' | 'gba'
export const SKINS: Record<Skin, { label: string; next: Skin }> = {
  neo: { label: '灵像素', next: 'hmos' }, hmos: { label: '通透风', next: 'gba' }, gba: { label: '像素风', next: 'neo' },
}
const KEY = '346-fusion-theme-v1'
export function useMemoryTheme() {
  const [skin, setSkin] = useState<Skin>(() => {
    try {
      const stored = localStorage.getItem(KEY) ?? localStorage.getItem('ms346_theme_v1')
      if (stored === 'neo' || stored === 'hmos' || stored === 'gba') return stored
    } catch { /* Rendering still works when preference storage is unavailable. */ }
    return 'neo'
  })
  const [warning, setWarning] = useState('')
  useLayoutEffect(() => { document.documentElement.dataset.skin = skin }, [skin])
  const cycle = () => {
    const next = SKINS[skin].next
    setSkin(next)
    try { localStorage.setItem(KEY, next); setWarning('') }
    catch { setWarning('主题已切换，但未能保存偏好；重新打开后可能恢复默认。') }
  }
  return { skin, cycle, warning }
}

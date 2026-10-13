type IconName = 'today' | 'library' | 'records' | 'settings' | 'palette' | 'arrow' | 'clock' | 'check' | 'book'
const paths: Record<IconName, string> = {
  today: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2m3 11 3 3 5-5',
  library: 'M12 5v16M12 5C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 1',
  records: 'M4 3v18h17M9 16V9m5 7V5m5 11v-5',
  settings: 'M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6m-4 4v6',
  palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3c-1-2 0-3 2-3h2c4 0 4-5 1-8a10 10 0 0 0-7-4M7 9h.01M11 6h.01M16 8h.01M6 14h.01',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  clock: 'M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  check: 'm7 12 3 3 7-7m4 4a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  book: 'M4 4h13a3 3 0 0 1 3 3v14H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3m-3 14a3 3 0 0 1 3-3h14M8 8h7',
}
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

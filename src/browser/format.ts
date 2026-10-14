export function durationClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` : `${minutes}:${String(total % 60).padStart(2, '0')}`
}
export function localTime(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(time)
}
export function waitTime(time: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((time - now) / 60000))
  return minutes < 60 ? `${minutes} 分钟` : minutes < 1440 ? `${Math.ceil(minutes / 60)} 小时` : `${Math.ceil(minutes / 1440)} 天`
}

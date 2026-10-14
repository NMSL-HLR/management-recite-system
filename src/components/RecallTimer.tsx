import { durationClock } from '../browser/format'
import { useEffect, useState } from 'react'

/** Display-only clock; it never writes state or changes the engine's timing. */
export function RecallTimer({ startedAt, finishedAt }: { startedAt: number; finishedAt?: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (finishedAt !== undefined) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, finishedAt])
  const elapsed = Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000))
  return <strong className="timer" aria-label="本轮用时">{durationClock(elapsed)}</strong>
}

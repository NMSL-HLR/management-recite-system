import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadJson, localDateStamp } from '../src/browser/download'
import { collectRecovery, RECOVERY_KEYS } from '../src/browser/recovery'
import { DATA_KEY, memoryKv } from '../src/engine/storage'
import { JOURNAL_KEY } from '../src/fusion/types'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('independent recovery and downloads', () => {
  it('preserves damaged JSON and unfinished journals verbatim without writing', () => {
    const kv = memoryKv()
    kv.setItem(DATA_KEY, '{damaged, still valuable')
    kv.setItem(JOURNAL_KEY, '{unfinished transaction')
    const snapshot = RECOVERY_KEYS.map(key => kv.getItem(key))
    const recovery = collectRecovery(kv.getItem)
    expect(recovery.raw[DATA_KEY]).toBe('{damaged, still valuable')
    expect(recovery.raw[JOURNAL_KEY]).toBe('{unfinished transaction')
    expect(RECOVERY_KEYS.map(key => kv.getItem(key))).toEqual(snapshot)
    expect(recovery.readErrors).toEqual({})
  })

  it('distinguishes unavailable storage from an absent key and keeps readable values', () => {
    const recovery = collectRecovery(key => {
      if (key === DATA_KEY) throw new Error('access denied')
      return key === JOURNAL_KEY ? 'valuable journal' : null
    })
    expect(recovery.raw).not.toHaveProperty(DATA_KEY)
    expect(recovery.readErrors[DATA_KEY]).toBe('access denied')
    expect(recovery.raw[JOURNAL_KEY]).toBe('valuable journal')
    expect(Object.keys(collectRecovery(() => { throw new Error('blocked') }).raw)).toHaveLength(0)
  })

  it('uses the browser calendar date across UTC midnight and year boundaries', () => {
    const previous = process.env.TZ
    try {
      process.env.TZ = 'Asia/Shanghai'
      expect(localDateStamp(new Date('2026-10-13T17:00:00Z'))).toBe('2026-10-14')
      expect(localDateStamp(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01')
      process.env.TZ = 'America/Los_Angeles'
      expect(localDateStamp(new Date('2026-10-14T01:00:00Z'))).toBe('2026-10-13')
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
  })

  it('keeps the blob URL alive after click and releases it later, including click failure', () => {
    vi.useFakeTimers()
    const remove = vi.fn(), click = vi.fn(), appendChild = vi.fn(), revokeObjectURL = vi.fn()
    vi.stubGlobal('document', { createElement: () => ({ remove, click }), body: { appendChild } })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:backup', revokeObjectURL })
    downloadJson({ draft: '保留原稿' }, 'backup.json')
    expect(appendChild).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
    click.mockImplementation(() => { throw new Error('download blocked') })
    expect(() => downloadJson({}, 'backup.json')).toThrow('download blocked')
    expect(remove).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})

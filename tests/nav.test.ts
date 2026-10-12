import { describe, expect, it } from 'vitest'
import { NAV } from '../src/nav'

describe('navigation', () => {
  it('makes training the default among four primary destinations', () => {
    expect(NAV.map((row) => row.id)).toEqual([
      'today',
      'library',
      'archive',
      'settings',
    ])
    expect(NAV[0]?.label).toBe('今日训练')
  })
})

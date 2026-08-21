import { describe, it, expect } from 'vitest'
import { cutsPerMinute } from '../src/lib/media/probe'

describe('cutsPerMinute', () => {
  it('scales cuts to a per-minute rate', () => {
    expect(cutsPerMinute(3, 8)).toBeCloseTo(22.5)
    expect(cutsPerMinute(30, 30)).toBe(60)
  })
  it('returns null when duration is unknown or zero', () => {
    expect(cutsPerMinute(5, null)).toBeNull()
    expect(cutsPerMinute(5, 0)).toBeNull()
  })
})

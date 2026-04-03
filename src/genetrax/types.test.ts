import { describe, it, expect } from 'vitest'
import { DEFAULT_OPTIONS } from './types'

describe('DEFAULT_OPTIONS', () => {
  it('has expected default values', () => {
    expect(DEFAULT_OPTIONS.minid).toBe(80)
    expect(DEFAULT_OPTIONS.mincov).toBe(80)
    expect(DEFAULT_OPTIONS.evalue).toBe(1e-20)
  })

  it('minid and mincov are in valid percentage range', () => {
    expect(DEFAULT_OPTIONS.minid).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_OPTIONS.minid).toBeLessThanOrEqual(100)
    expect(DEFAULT_OPTIONS.mincov).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_OPTIONS.mincov).toBeLessThanOrEqual(100)
  })
})

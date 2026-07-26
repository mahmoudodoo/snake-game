import { describe, expect, it } from 'vitest'
import { tickIntervalForScore } from './difficulty'
import { TICK_INTERVAL_MIN_MS, TICK_INTERVAL_START_MS } from './constants'

describe('tickIntervalForScore', () => {
  it('starts at the base interval', () => {
    expect(tickIntervalForScore(0)).toBe(TICK_INTERVAL_START_MS)
  })

  it('speeds up as the score climbs', () => {
    expect(tickIntervalForScore(5)).toBeLessThan(tickIntervalForScore(0))
  })

  it('never drops below the floor, however long the game runs', () => {
    expect(tickIntervalForScore(10_000)).toBe(TICK_INTERVAL_MIN_MS)
  })
})

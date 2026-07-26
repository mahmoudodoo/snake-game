import { describe, expect, it } from 'vitest'
import { nextRandom, randomInt } from './rng'

describe('nextRandom', () => {
  it('is deterministic for a given seed', () => {
    expect(nextRandom(42)).toEqual(nextRandom(42))
  })

  it('produces values in [0, 1)', () => {
    let seed = 7
    for (let i = 0; i < 500; i++) {
      const result = nextRandom(seed)
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(result.value).toBeLessThan(1)
      seed = result.seed
    }
  })

  it('advances the seed so successive calls differ', () => {
    const first = nextRandom(1)
    const second = nextRandom(first.seed)
    expect(second.value).not.toBe(first.value)
  })
})

describe('randomInt', () => {
  it('stays within [0, maxExclusive)', () => {
    let seed = 99
    for (let i = 0; i < 500; i++) {
      const result = randomInt(seed, 10)
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(result.value).toBeLessThan(10)
      expect(Number.isInteger(result.value)).toBe(true)
      seed = result.seed
    }
  })
})

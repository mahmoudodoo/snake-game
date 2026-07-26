import { describe, expect, it } from 'vitest'
import { DELTA, OPPOSITE, cellKey, isInBounds, sameCell, translate } from './grid'
import type { Direction, GameConfig } from './types'

const config: GameConfig = { cols: 10, rows: 10, foodCount: 1 }
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

describe('DELTA', () => {
  it('moves exactly one cell along one axis', () => {
    for (const dir of DIRECTIONS) {
      const delta = DELTA[dir]
      expect(Math.abs(delta.x) + Math.abs(delta.y)).toBe(1)
    }
  })

  it('treats up as negative y — canvas rows grow downward', () => {
    expect(DELTA.up).toEqual({ x: 0, y: -1 })
    expect(DELTA.down).toEqual({ x: 0, y: 1 })
  })
})

describe('OPPOSITE', () => {
  it('is an involution: the opposite of the opposite is the original', () => {
    for (const dir of DIRECTIONS) {
      expect(OPPOSITE[OPPOSITE[dir]]).toBe(dir)
    }
  })

  it('cancels out its own delta', () => {
    for (const dir of DIRECTIONS) {
      const forward = DELTA[dir]
      const back = DELTA[OPPOSITE[dir]]
      expect({ x: forward.x + back.x, y: forward.y + back.y }).toEqual({ x: 0, y: 0 })
    }
  })
})

describe('cellKey', () => {
  it('collides only for identical cells', () => {
    expect(cellKey({ x: 1, y: 2 })).toBe(cellKey({ x: 1, y: 2 }))
    expect(cellKey({ x: 1, y: 2 })).not.toBe(cellKey({ x: 2, y: 1 }))
  })

  it('does not confuse {1,23} with {12,3}', () => {
    expect(cellKey({ x: 1, y: 23 })).not.toBe(cellKey({ x: 12, y: 3 }))
  })
})

describe('sameCell', () => {
  it('compares by value, not identity', () => {
    expect(sameCell({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true)
    expect(sameCell({ x: 3, y: 4 }, { x: 4, y: 3 })).toBe(false)
  })
})

describe('translate', () => {
  it('returns a new cell one step along the heading', () => {
    const start = { x: 5, y: 5 }
    expect(translate(start, 'right')).toEqual({ x: 6, y: 5 })
    expect(translate(start, 'up')).toEqual({ x: 5, y: 4 })
    expect(start).toEqual({ x: 5, y: 5 }) // input untouched
  })
})

describe('isInBounds', () => {
  it('accepts both corners of the board', () => {
    expect(isInBounds({ x: 0, y: 0 }, config)).toBe(true)
    expect(isInBounds({ x: 9, y: 9 }, config)).toBe(true)
  })

  it('rejects cells one step past any edge', () => {
    expect(isInBounds({ x: -1, y: 0 }, config)).toBe(false)
    expect(isInBounds({ x: 0, y: -1 }, config)).toBe(false)
    expect(isInBounds({ x: 10, y: 0 }, config)).toBe(false)
    expect(isInBounds({ x: 0, y: 10 }, config)).toBe(false)
  })
})

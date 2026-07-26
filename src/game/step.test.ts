import { describe, expect, it } from 'vitest'
import { resolveDirection, step } from './step'
import type { Direction, GameConfig, GameState, Snake, Vec2 } from './types'

const config: GameConfig = { cols: 10, rows: 10, foodCount: 0 }

function snake(id: string, body: readonly Vec2[], dir: Direction = 'right'): Snake {
  return { id, name: id, color: '#fff', body, dir, alive: true, score: 0 }
}

function stateOf(players: readonly Snake[], food: readonly Vec2[] = []): GameState {
  return { tick: 0, status: 'playing', players, food, rngSeed: 1, winnerId: null }
}

describe('resolveDirection', () => {
  it('rejects a 180° reversal into its own neck', () => {
    expect(resolveDirection('right', 'left')).toBe('right')
  })

  it('accepts a perpendicular turn', () => {
    expect(resolveDirection('right', 'up')).toBe('up')
  })

  it('keeps heading when no input arrived', () => {
    expect(resolveDirection('down', undefined)).toBe('down')
  })
})

describe('step', () => {
  it('advances the head and drags the tail', () => {
    const next = step(stateOf([snake('a', [{ x: 1, y: 1 }, { x: 0, y: 1 }])]), config, {})
    expect(next.players[0]?.body).toEqual([{ x: 2, y: 1 }, { x: 1, y: 1 }])
    expect(next.tick).toBe(1)
  })

  it('grows and scores when the head lands on food', () => {
    const start = stateOf([snake('a', [{ x: 1, y: 1 }, { x: 0, y: 1 }])], [{ x: 2, y: 1 }])
    const next = step(start, config, {})
    expect(next.players[0]?.score).toBe(1)
    expect(next.players[0]?.body).toHaveLength(3)
    expect(next.food).toEqual([])
  })

  it('lets a snake follow the tail cell it is vacating', () => {
    // Head {2,2} turning right into {3,2}, which the tail leaves on this tick.
    const coiled = snake(
      'a',
      [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }],
      'right',
    )
    const next = step(stateOf([coiled]), config, {})
    expect(next.players[0]?.alive).toBe(true)
  })

  it('ends a solo run when the snake leaves the board', () => {
    const next = step(stateOf([snake('a', [{ x: 9, y: 5 }, { x: 8, y: 5 }])]), config, {})
    expect(next.players[0]?.alive).toBe(false)
    expect(next.status).toBe('over')
  })

  it('declares the last snake standing the winner', () => {
    const next = step(
      stateOf([
        snake('a', [{ x: 9, y: 5 }, { x: 8, y: 5 }]), // into the wall
        snake('b', [{ x: 1, y: 1 }, { x: 0, y: 1 }]), // safe
      ]),
      config,
      {},
    )
    expect(next.status).toBe('over')
    expect(next.winnerId).toBe('b')
  })

  it('applies per-player input independently', () => {
    const next = step(
      stateOf([
        snake('a', [{ x: 1, y: 1 }, { x: 0, y: 1 }]),
        snake('b', [{ x: 1, y: 5 }, { x: 0, y: 5 }]),
      ]),
      config,
      { a: 'up' },
    )
    expect(next.players[0]?.body[0]).toEqual({ x: 1, y: 0 })
    expect(next.players[1]?.body[0]).toEqual({ x: 2, y: 5 })
  })

  it('is a no-op once the game is over', () => {
    const over: GameState = { ...stateOf([snake('a', [{ x: 1, y: 1 }])]), status: 'over' }
    expect(step(over, config, {})).toBe(over)
  })

  it('refills food up to the configured count', () => {
    const withFood: GameConfig = { ...config, foodCount: 2 }
    const start = stateOf([snake('a', [{ x: 1, y: 1 }, { x: 0, y: 1 }])], [{ x: 2, y: 1 }])
    const next = step(start, withFood, {})
    expect(next.food).toHaveLength(2)
  })

  it('produces identical results for identical seeds', () => {
    const withFood: GameConfig = { ...config, foodCount: 1 }
    const start = stateOf([snake('a', [{ x: 1, y: 1 }, { x: 0, y: 1 }])], [{ x: 2, y: 1 }])
    expect(step(start, withFood, {})).toEqual(step(start, withFood, {}))
  })
})

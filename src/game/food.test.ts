import { describe, expect, it } from 'vitest'
import { occupiedCells, spawnFood } from './food'
import { cellKey } from './grid'
import type { GameConfig, Snake, Vec2 } from './types'

const config: GameConfig = { cols: 10, rows: 10, foodCount: 1 }

function snake(id: string, body: readonly Vec2[]): Snake {
  return { id, name: id, color: '#fff', body, dir: 'right', alive: true, score: 0 }
}

describe('occupiedCells', () => {
  it('counts living bodies and existing food', () => {
    const taken = occupiedCells([snake('a', [{ x: 1, y: 1 }])], [{ x: 5, y: 5 }])
    expect(taken.has(cellKey({ x: 1, y: 1 }))).toBe(true)
    expect(taken.has(cellKey({ x: 5, y: 5 }))).toBe(true)
  })

  it('frees up the cells of a dead snake', () => {
    const dead: Snake = { ...snake('a', [{ x: 1, y: 1 }]), alive: false }
    expect(occupiedCells([dead], []).has(cellKey({ x: 1, y: 1 }))).toBe(false)
  })
})

describe('spawnFood', () => {
  it('never lands on an occupied cell', () => {
    const body = Array.from({ length: 10 }, (_, x) => ({ x, y: 0 }))
    const players = [snake('a', body)]
    let seed = 3

    for (let i = 0; i < 200; i++) {
      const spawn = spawnFood(config, players, [{ x: 0, y: 1 }], seed)
      expect(spawn.cell).not.toBeNull()
      const taken = occupiedCells(players, [{ x: 0, y: 1 }])
      expect(taken.has(cellKey(spawn.cell ?? { x: -1, y: -1 }))).toBe(false)
      seed = spawn.seed
    }
  })

  it('is reproducible from the same seed', () => {
    expect(spawnFood(config, [], [], 123)).toEqual(spawnFood(config, [], [], 123))
  })

  it('returns null rather than looping when the board is full', () => {
    const tiny: GameConfig = { cols: 2, rows: 2, foodCount: 1 }
    const full = snake('a', [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ])
    expect(spawnFood(tiny, [full], [], 1).cell).toBeNull()
  })
})

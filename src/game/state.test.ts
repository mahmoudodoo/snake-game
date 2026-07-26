import { describe, expect, it } from 'vitest'
import { START_LENGTH } from './constants'
import { occupiedCells } from './food'
import { cellKey, isInBounds } from './grid'
import { DEFAULT_CONFIG, createInitialState } from './state'
import type { PlayerSeed } from './state'
import type { GameConfig } from './types'

const config: GameConfig = { cols: 10, rows: 10, foodCount: 1 }

const solo: readonly PlayerSeed[] = [{ id: 'local', name: 'You', color: '#3fb950' }]

const duo: readonly PlayerSeed[] = [
  { id: 'a', name: 'A', color: '#3fb950' },
  { id: 'b', name: 'B', color: '#58a6ff' },
]

describe('DEFAULT_CONFIG', () => {
  it('describes a board with room to play and one food on it', () => {
    expect(DEFAULT_CONFIG.cols).toBeGreaterThan(START_LENGTH)
    expect(DEFAULT_CONFIG.rows).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.foodCount).toBeGreaterThan(0)
  })
})

describe('createInitialState', () => {
  it('starts a solo run alive, scoreless and playing', () => {
    const state = createInitialState(config, solo, 1)
    expect(state.tick).toBe(0)
    expect(state.status).toBe('playing')
    expect(state.winnerId).toBeNull()
    expect(state.players).toHaveLength(1)
    expect(state.players[0]?.alive).toBe(true)
    expect(state.players[0]?.score).toBe(0)
  })

  it('carries each seed through to its snake', () => {
    const state = createInitialState(config, solo, 1)
    expect(state.players[0]?.id).toBe('local')
    expect(state.players[0]?.name).toBe('You')
    expect(state.players[0]?.color).toBe('#3fb950')
  })

  it('spawns a body of START_LENGTH with the head in front', () => {
    const body = createInitialState(config, solo, 1).players[0]?.body ?? []
    expect(body).toHaveLength(START_LENGTH)
    expect(body[0]?.x).toBeGreaterThan(body[1]?.x ?? Infinity)
    expect(new Set(body.map(cellKey)).size).toBe(START_LENGTH)
  })

  it('faces right with the whole body on the board', () => {
    const snake = createInitialState(config, solo, 1).players[0]
    expect(snake?.dir).toBe('right')
    for (const cell of snake?.body ?? []) {
      expect(isInBounds(cell, config)).toBe(true)
    }
  })

  it('leaves runway ahead so the first tick cannot kill you', () => {
    const head = createInitialState(config, solo, 1).players[0]?.body[0]
    expect(head?.x).toBeLessThan(config.cols - 1)
  })

  it('spawns the configured amount of food, never under a snake', () => {
    const withFood: GameConfig = { ...config, foodCount: 3 }
    const state = createInitialState(withFood, solo, 1)
    expect(state.food).toHaveLength(3)

    const bodies = occupiedCells(state.players, [])
    for (const cell of state.food) {
      expect(bodies.has(cellKey(cell))).toBe(false)
      expect(isInBounds(cell, withFood)).toBe(true)
    }
    expect(new Set(state.food.map(cellKey)).size).toBe(3)
  })

  it('places food somewhere different as the seed changes', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 25; seed++) {
      const cell = createInitialState(config, solo, seed).food[0]
      if (cell) seen.add(cellKey(cell))
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('replays identically from the same seed', () => {
    expect(createInitialState(config, solo, 4242)).toEqual(createInitialState(config, solo, 4242))
  })

  it('separates multiple players onto their own rows', () => {
    const state = createInitialState(config, duo, 1)
    const rows = state.players.map((player) => player.body[0]?.y)
    expect(new Set(rows).size).toBe(2)
    expect(occupiedCells(state.players, []).size).toBe(duo.length * START_LENGTH)
  })
})

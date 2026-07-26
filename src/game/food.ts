import { cellKey } from './grid'
import { randomInt } from './rng'
import type { GameConfig, Snake, Vec2 } from './types'

export interface FoodSpawn {
  /** null when the board is completely full — a win condition, not an error. */
  readonly cell: Vec2 | null
  readonly seed: number
}

export function occupiedCells(players: readonly Snake[], food: readonly Vec2[]): Set<string> {
  const taken = new Set<string>()
  for (const snake of players) {
    if (!snake.alive) continue
    for (const cell of snake.body) taken.add(cellKey(cell))
  }
  for (const cell of food) taken.add(cellKey(cell))
  return taken
}

/**
 * Picks a free cell uniformly.
 *
 * Enumerates the free list rather than retrying random cells until one is empty:
 * rejection sampling degrades badly on a crowded board and can spin forever on a
 * full one, which is exactly when a long match needs it most.
 */
export function spawnFood(
  config: GameConfig,
  players: readonly Snake[],
  food: readonly Vec2[],
  seed: number,
): FoodSpawn {
  const taken = occupiedCells(players, food)
  const free: Vec2[] = []

  for (let y = 0; y < config.rows; y++) {
    for (let x = 0; x < config.cols; x++) {
      const cell = { x, y }
      if (!taken.has(cellKey(cell))) free.push(cell)
    }
  }

  if (free.length === 0) return { cell: null, seed }

  const pick = randomInt(seed, free.length)
  return { cell: free[pick.value] ?? null, seed: pick.seed }
}

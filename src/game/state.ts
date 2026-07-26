import { GRID_COLS, GRID_ROWS, START_LENGTH } from './constants'
import { spawnFood } from './food'
import type { GameConfig, GameState, PlayerId, Snake, Vec2 } from './types'

export interface PlayerSeed {
  readonly id: PlayerId
  readonly name: string
  readonly color: string
}

export const DEFAULT_CONFIG: GameConfig = {
  cols: GRID_COLS,
  rows: GRID_ROWS,
  foodCount: 1,
}

/**
 * Spaces players evenly down the board, all facing right with clear runway
 * ahead, so nobody starts in a position they cannot survive.
 */
function spawnSnake(config: GameConfig, seed: PlayerSeed, index: number, total: number): Snake {
  const row = Math.floor(((index + 1) * config.rows) / (total + 1))
  const headX = Math.floor(config.cols / 4)
  const body: Vec2[] = Array.from({ length: START_LENGTH }, (_, offset) => ({
    x: headX - offset,
    y: row,
  }))

  return {
    id: seed.id,
    name: seed.name,
    color: seed.color,
    body,
    dir: 'right',
    alive: true,
    score: 0,
  }
}

export function createInitialState(
  config: GameConfig,
  seeds: readonly PlayerSeed[],
  rngSeed: number,
): GameState {
  const players = seeds.map((seed, index) => spawnSnake(config, seed, index, seeds.length))

  let seed = rngSeed
  let food: Vec2[] = []
  while (food.length < config.foodCount) {
    const spawn = spawnFood(config, players, food, seed)
    seed = spawn.seed
    if (spawn.cell === null) break
    food = [...food, spawn.cell]
  }

  return {
    tick: 0,
    status: 'playing',
    players,
    food,
    rngSeed: seed,
    winnerId: null,
  }
}

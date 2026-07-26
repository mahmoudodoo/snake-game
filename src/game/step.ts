import { detectCollisions } from './collision'
import { spawnFood } from './food'
import { OPPOSITE, cellKey, translate } from './grid'
import type { Direction, GameConfig, GameState, InputMap, Snake } from './types'

/**
 * A 180° turn would drive the head straight into the neck, so it is rejected.
 * Validated against the *simulated* direction, never a queued one — otherwise a
 * fast up-then-left-then-down in a single tick kills you.
 */
export function resolveDirection(current: Direction, requested: Direction | undefined): Direction {
  if (requested === undefined || requested === OPPOSITE[current]) return current
  return requested
}

/**
 * Advances the world by exactly one tick.
 *
 * Pure: no DOM, no Date.now(), no Math.random(). The host calls this and ships
 * the result; clients never call it at all.
 */
export function step(state: GameState, config: GameConfig, inputs: InputMap): GameState {
  if (state.status !== 'playing') return state

  const foodKeys = new Set(state.food.map(cellKey))
  const eaten = new Set<string>()

  // 1. Move every living snake, growing where it lands on food.
  const moved: Snake[] = state.players.map((snake) => {
    if (!snake.alive) return snake

    const head = snake.body[0]
    if (!head) return snake

    const dir = resolveDirection(snake.dir, inputs[snake.id])
    const nextHead = translate(head, dir)
    const key = cellKey(nextHead)
    const ate = foodKeys.has(key)
    if (ate) eaten.add(key)

    // Dropping the tail before collision detection is what lets a snake follow
    // its own tail into the cell that tail is vacating.
    const body = ate ? [nextHead, ...snake.body] : [nextHead, ...snake.body.slice(0, -1)]

    return { ...snake, dir, body, score: ate ? snake.score + 1 : snake.score }
  })

  // 2. Detect, then apply consequences.
  const dead = new Set(detectCollisions(config, moved).map((c) => c.playerId))
  const players = moved.map((snake) => (dead.has(snake.id) ? { ...snake, alive: false } : snake))

  // 3. Replace what was eaten.
  let seed = state.rngSeed
  let food = state.food.filter((cell) => !eaten.has(cellKey(cell)))
  while (food.length < config.foodCount) {
    const spawn = spawnFood(config, players, food, seed)
    seed = spawn.seed
    if (spawn.cell === null) break // board is full
    food = [...food, spawn.cell]
  }

  // 4. Solo runs end when you die; a match ends when one snake is left.
  const alive = players.filter((snake) => snake.alive)
  const isMatch = state.players.length > 1
  const over = isMatch ? alive.length <= 1 : alive.length === 0

  return {
    tick: state.tick + 1,
    status: over ? 'over' : 'playing',
    players,
    food,
    rngSeed: seed,
    winnerId: over && isMatch ? (alive[0]?.id ?? null) : null,
  }
}

import type { Direction, GameConfig, Vec2 } from './types'

export const DELTA: Readonly<Record<Direction, Vec2>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

/** Stable string key for Set/Map lookups — cheaper than scanning arrays of Vec2. */
export function cellKey(cell: Vec2): string {
  return `${cell.x},${cell.y}`
}

export function sameCell(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y
}

export function translate(pos: Vec2, dir: Direction): Vec2 {
  const delta = DELTA[dir]
  return { x: pos.x + delta.x, y: pos.y + delta.y }
}

export function isInBounds(cell: Vec2, config: GameConfig): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < config.cols && cell.y < config.rows
}

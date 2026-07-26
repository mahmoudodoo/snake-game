import { isInBounds, sameCell } from './grid'
import type { GameConfig, PlayerId, Snake, Vec2 } from './types'

export type CollisionKind = 'wall' | 'self' | 'snake' | 'head-on'

export interface Collision {
  readonly playerId: PlayerId
  readonly kind: CollisionKind
  /** The other snake involved, for 'snake' and 'head-on'. */
  readonly withId?: PlayerId
}

export function hitsWall(head: Vec2, config: GameConfig): boolean {
  return !isInBounds(head, config)
}

/** True when the head has run into its own body (the head cell itself excluded). */
export function hitsSelf(snake: Snake): boolean {
  const head = snake.body[0]
  if (!head) return false
  return snake.body.slice(1).some((cell) => sameCell(cell, head))
}

export function hitsSnake(head: Vec2, other: Snake): boolean {
  return other.body.some((cell) => sameCell(cell, head))
}

/** Both heads entering the same cell on the same tick. Symmetric: both die. */
export function headOnCollision(a: Snake, b: Snake): boolean {
  const headA = a.body[0]
  const headB = b.body[0]
  return headA !== undefined && headB !== undefined && sameCell(headA, headB)
}

/**
 * Reports what happened this tick without deciding what it means.
 *
 * Consequences (death, scoring, last-snake-standing) belong to step(); keeping
 * detection separate is what makes the simultaneous cases — head-on swaps, a
 * snake entering the cell another is vacating — testable in isolation.
 *
 * Snakes must already have been moved: this reads post-move bodies, so a snake
 * following its own vacated tail is correctly treated as safe.
 */
export function detectCollisions(
  config: GameConfig,
  snakes: readonly Snake[],
): readonly Collision[] {
  const collisions: Collision[] = []
  const living = snakes.filter((snake) => snake.alive)

  for (const snake of living) {
    const head = snake.body[0]
    if (!head) continue

    if (hitsWall(head, config)) {
      collisions.push({ playerId: snake.id, kind: 'wall' })
      continue
    }

    if (hitsSelf(snake)) {
      collisions.push({ playerId: snake.id, kind: 'self' })
      continue
    }

    for (const other of living) {
      if (other.id === snake.id) continue

      // Check head-on first: it is also a body hit, but both snakes must die.
      if (headOnCollision(snake, other)) {
        collisions.push({ playerId: snake.id, kind: 'head-on', withId: other.id })
        break
      }
      if (hitsSnake(head, other)) {
        collisions.push({ playerId: snake.id, kind: 'snake', withId: other.id })
        break
      }
    }
  }

  return collisions
}

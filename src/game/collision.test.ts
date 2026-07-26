import { describe, expect, it } from 'vitest'
import { detectCollisions, headOnCollision, hitsSelf, hitsWall } from './collision'
import type { GameConfig, Snake, Vec2 } from './types'

const config: GameConfig = { cols: 10, rows: 10, foodCount: 0 }

function snake(id: string, body: readonly Vec2[]): Snake {
  return { id, name: id, color: '#fff', body, dir: 'right', alive: true, score: 0 }
}

describe('hitsWall', () => {
  it.each([
    ['left', { x: -1, y: 5 }],
    ['right', { x: 10, y: 5 }],
    ['top', { x: 5, y: -1 }],
    ['bottom', { x: 5, y: 10 }],
  ])('catches the %s edge', (_edge, head) => {
    expect(hitsWall(head, config)).toBe(true)
  })

  it('allows cells inside the board', () => {
    expect(hitsWall({ x: 0, y: 0 }, config)).toBe(false)
    expect(hitsWall({ x: 9, y: 9 }, config)).toBe(false)
  })
})

describe('hitsSelf', () => {
  it('detects the head re-entering its own body', () => {
    const looped = snake('a', [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ])
    expect(hitsSelf(looped)).toBe(true)
  })

  it('does not flag a straight snake', () => {
    expect(hitsSelf(snake('a', [{ x: 2, y: 2 }, { x: 1, y: 2 }]))).toBe(false)
  })
})

describe('headOnCollision', () => {
  it('is symmetric when both heads enter the same cell', () => {
    const a = snake('a', [{ x: 5, y: 5 }, { x: 4, y: 5 }])
    const b = snake('b', [{ x: 5, y: 5 }, { x: 6, y: 5 }])
    expect(headOnCollision(a, b)).toBe(true)
    expect(headOnCollision(b, a)).toBe(true)
  })
})

describe('detectCollisions', () => {
  it('kills both snakes in a head-on', () => {
    const found = detectCollisions(config, [
      snake('a', [{ x: 5, y: 5 }, { x: 4, y: 5 }]),
      snake('b', [{ x: 5, y: 5 }, { x: 6, y: 5 }]),
    ])
    expect(found.map((c) => c.playerId).sort()).toEqual(['a', 'b'])
    expect(found.every((c) => c.kind === 'head-on')).toBe(true)
  })

  it('kills only the snake that runs into another body', () => {
    const found = detectCollisions(config, [
      snake('a', [{ x: 5, y: 5 }, { x: 4, y: 5 }]),
      snake('b', [{ x: 6, y: 5 }, { x: 5, y: 5 }]),
    ])
    expect(found).toEqual([{ playerId: 'a', kind: 'snake', withId: 'b' }])
  })

  it('ignores snakes that are already dead', () => {
    const dead: Snake = { ...snake('b', [{ x: 5, y: 5 }]), alive: false }
    const found = detectCollisions(config, [snake('a', [{ x: 5, y: 5 }, { x: 4, y: 5 }]), dead])
    expect(found).toEqual([])
  })

  it('reports nothing when everyone is clear', () => {
    const found = detectCollisions(config, [
      snake('a', [{ x: 1, y: 1 }, { x: 0, y: 1 }]),
      snake('b', [{ x: 8, y: 8 }, { x: 7, y: 8 }]),
    ])
    expect(found).toEqual([])
  })
})

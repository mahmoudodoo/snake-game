// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createHud } from './hud'
import type { GameState, Snake } from '../game/types'

let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
  document.body.replaceChildren(root)
})

function snake(id: string, score: number): Snake {
  return {
    id,
    name: id,
    color: '#3fb950',
    body: [{ x: 1, y: 1 }],
    dir: 'right',
    alive: true,
    score,
  }
}

function stateOf(players: readonly Snake[]): GameState {
  return { tick: 0, status: 'playing', players, food: [], rngSeed: 1, winnerId: null }
}

describe('createHud', () => {
  it('shows a zero score before the first bite', () => {
    createHud(root).update(stateOf([snake('local', 0)]), 150)
    expect(root.textContent).toContain('Score 0')
  })

  it('reflects the score after eating', () => {
    const hud = createHud(root)
    hud.update(stateOf([snake('local', 0)]), 150)
    hud.update(stateOf([snake('local', 7)]), 150)
    expect(root.textContent).toContain('Score 7')
    expect(root.textContent).not.toContain('Score 0')
  })

  it('reports the leader in a multiplayer match', () => {
    createHud(root).update(stateOf([snake('a', 2), snake('b', 5)]), 150)
    expect(root.textContent).toContain('Score 5')
  })

  it('shows the current speed derived from the tick interval', () => {
    createHud(root).update(stateOf([snake('local', 0)]), 200)
    expect(root.textContent).toContain('5 ticks/s')
  })

  it('separates score from speed so the two do not read as one number', () => {
    createHud(root).update(stateOf([snake('local', 0)]), 150)
    expect(root.textContent).not.toContain('Score 07')
    expect(/Score (\d+)/.exec(root.textContent ?? '')?.[1]).toBe('0')
  })

  it('shows your own score, not the table leader’s', () => {
    createHud(root, 'you').update(stateOf([snake('ana', 9), snake('you', 2)]), 150)
    expect(root.textContent).toContain('Score 2')
  })

  it('names the player to beat when someone is ahead of you', () => {
    createHud(root, 'you').update(stateOf([snake('ana', 9), snake('you', 2)]), 150)
    expect(root.textContent).toContain('Leader ana 9')
  })

  it('drops the leader line while you are the one ahead', () => {
    createHud(root, 'you').update(stateOf([snake('ana', 1), snake('you', 6)]), 150)
    expect(root.textContent).not.toContain('Leader')
  })

  it('keeps a solo run free of leader clutter', () => {
    createHud(root, 'you').update(stateOf([snake('you', 3)]), 150)
    expect(root.textContent).toContain('Score 3')
    expect(root.textContent).not.toContain('Leader')
  })

  it('announces updates to screen readers without stealing focus', () => {
    createHud(root).update(stateOf([snake('local', 0)]), 150)
    expect(root.getAttribute('role')).toBe('status')
    expect(root.getAttribute('aria-live')).toBe('polite')
  })

  it('replaces its own output rather than appending on every tick', () => {
    root.append(document.createTextNode('stale'))
    const hud = createHud(root)
    const before = root.childElementCount

    for (let score = 0; score < 5; score++) hud.update(stateOf([snake('local', score)]), 150)

    expect(root.childElementCount).toBe(before)
    expect(root.textContent).not.toContain('stale')
  })
})

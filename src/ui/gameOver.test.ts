// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGameOver, headlineFor } from './gameOver'
import type { GameOverHandlers } from './gameOver'
import type { GameState, Snake } from '../game/types'

let root: HTMLElement
let handlers: GameOverHandlers

beforeEach(() => {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  handlers = { onPlayAgain: vi.fn(), onBackToLobby: vi.fn() }
})

function snake(id: string, score: number, alive = true): Snake {
  return { id, name: id, color: '#3fb950', body: [{ x: 1, y: 1 }], dir: 'right', alive, score }
}

function over(players: readonly Snake[], winnerId: string | null = null): GameState {
  return { tick: 10, status: 'over', players, food: [], rngSeed: 1, winnerId }
}

function playing(players: readonly Snake[]): GameState {
  return { tick: 1, status: 'playing', players, food: [], rngSeed: 1, winnerId: null }
}

function buttonNamed(label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((node) => node.textContent === label)
}

describe('headlineFor', () => {
  it('reads plainly for a solo run', () => {
    expect(headlineFor(over([snake('you', 4, false)]), 'you')).toBe('Game over')
  })

  it('congratulates you by name-free second person', () => {
    expect(headlineFor(over([snake('you', 4), snake('bo', 2, false)], 'you'), 'you')).toBe(
      'You win',
    )
  })

  it('names the other winner', () => {
    expect(headlineFor(over([snake('ana', 9), snake('you', 2, false)], 'ana'), 'you')).toBe(
      'ana wins',
    )
  })

  it('handles a match where everyone died on the same tick', () => {
    expect(headlineFor(over([snake('ana', 1, false), snake('bo', 1, false)]), 'bo')).toBe(
      'Nobody survived',
    )
  })
})

describe('createGameOver', () => {
  it('stays hidden while the game is being played', () => {
    createGameOver(root, handlers).update(playing([snake('you', 3)]), 'you')
    expect(root.hidden).toBe(true)
  })

  it('appears when the match ends', () => {
    createGameOver(root, handlers).update(over([snake('you', 3, false)]), 'you')
    expect(root.hidden).toBe(false)
    expect(root.querySelector('.over__headline')?.textContent).toBe('Game over')
  })

  it('reports your own score, not the leader’s', () => {
    createGameOver(root, handlers).update(
      over([snake('ana', 9), snake('you', 2, false)], 'ana'),
      'you',
    )
    expect(root.querySelector('.over__summary')?.textContent).toBe('You scored 2')
  })

  it('shows final standings for a match', () => {
    createGameOver(root, handlers).update(
      over([snake('you', 2, false), snake('ana', 9)], 'ana'),
      'you',
    )

    const names = [...root.querySelectorAll('.player__name')].map((n) => n.textContent)
    expect(names).toEqual(['ana', 'you'])
    expect(root.querySelector<HTMLElement>('.over__standings')?.hidden).toBe(false)
  })

  it('skips the standings table for a solo run', () => {
    createGameOver(root, handlers).update(over([snake('you', 3, false)]), 'you')
    expect(root.querySelector<HTMLElement>('.over__standings')?.hidden).toBe(true)
  })

  it('offers a way back into a game and a way out to the lobby', () => {
    createGameOver(root, handlers).update(over([snake('you', 3, false)]), 'you')

    buttonNamed('Play again')?.click()
    buttonNamed('Back to lobby')?.click()

    expect(handlers.onPlayAgain).toHaveBeenCalledTimes(1)
    expect(handlers.onBackToLobby).toHaveBeenCalledTimes(1)
  })

  it('is a labelled dialog, so it is announced when it opens', () => {
    createGameOver(root, handlers).update(over([snake('you', 3, false)]), 'you')
    expect(root.getAttribute('role')).toBe('dialog')
    expect(root.getAttribute('aria-labelledby')).toBe(
      root.querySelector('.over__headline')?.id ?? '',
    )
  })

  it('takes focus once, not on every update', () => {
    const panel = createGameOver(root, handlers)
    panel.update(over([snake('you', 3, false)]), 'you')
    expect(document.activeElement).toBe(buttonNamed('Play again'))

    buttonNamed('Back to lobby')?.focus()
    panel.update(over([snake('you', 3, false)]), 'you')

    expect(document.activeElement).toBe(buttonNamed('Back to lobby'))
  })

  it('takes focus again after the next match ends', () => {
    const panel = createGameOver(root, handlers)
    panel.update(over([snake('you', 3, false)]), 'you')
    buttonNamed('Back to lobby')?.blur()

    panel.update(playing([snake('you', 0)]), 'you')
    panel.update(over([snake('you', 5, false)]), 'you')

    expect(document.activeElement).toBe(buttonNamed('Play again'))
  })
})

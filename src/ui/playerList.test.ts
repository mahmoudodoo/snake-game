// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPlayerList, toPlayerRows } from './playerList'
import type { PlayerRow } from './playerList'
import type { GameState, Snake } from '../game/types'

let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
  document.body.replaceChildren(root)
})

function row(id: string, overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id,
    name: id,
    color: '#3fb950',
    score: null,
    alive: true,
    isHost: false,
    isYou: false,
    ...overrides,
  }
}

function names(): string[] {
  return [...root.querySelectorAll('.player__name')].map((node) => node.textContent ?? '')
}

function snake(id: string, score: number, alive = true): Snake {
  return { id, name: id, color: '#3fb950', body: [{ x: 1, y: 1 }], dir: 'right', alive, score }
}

function stateOf(players: readonly Snake[]): GameState {
  return { tick: 0, status: 'playing', players, food: [], rngSeed: 1, winnerId: null }
}

describe('createPlayerList', () => {
  it('lists every player in the order given', () => {
    createPlayerList(root).update([row('ana'), row('bo'), row('cy')])
    expect(names()).toEqual(['ana', 'bo', 'cy'])
  })

  it('shows how full the room is', () => {
    createPlayerList(root).update([row('ana'), row('bo')])
    expect(root.querySelector('.players__count')?.textContent).toBe('2/6')
  })

  it('prompts an empty room instead of showing a blank panel', () => {
    const list = createPlayerList(root)
    list.update([])
    expect(root.querySelector<HTMLElement>('.players__empty')?.hidden).toBe(false)

    list.update([row('ana')])
    expect(root.querySelector<HTMLElement>('.players__empty')?.hidden).toBe(true)
  })

  it('marks who you are and who is hosting', () => {
    createPlayerList(root).update([row('ana', { isHost: true }), row('bo', { isYou: true })])
    const badges = [...root.querySelectorAll('.player__badge')].map((n) => n.textContent)
    expect(badges).toEqual(['host', 'you'])
  })

  it('says so in text when a player is out, not just in colour', () => {
    createPlayerList(root).update([row('ana', { alive: false, score: 3 })])
    expect(root.querySelector('.player__badge')?.textContent).toBe('out')
    expect(root.querySelector('.player')?.classList.contains('player--dead')).toBe(true)
  })

  it('hides the score column in the lobby, where nobody has one', () => {
    createPlayerList(root).update([row('ana')])
    expect(root.querySelector<HTMLElement>('.player__score')?.hidden).toBe(true)
  })

  it('shows scores during a match', () => {
    createPlayerList(root).update([row('ana', { score: 4 })])
    const score = root.querySelector<HTMLElement>('.player__score')
    expect(score?.hidden).toBe(false)
    expect(score?.textContent).toBe('4')
  })

  it('reuses a player row across updates rather than rebuilding it', () => {
    const list = createPlayerList(root)
    list.update([row('ana', { score: 0 })])
    const before = root.querySelector('.player')

    list.update([row('ana', { score: 1 })])

    expect(root.querySelector('.player')).toBe(before)
    expect(root.querySelector('.player__score')?.textContent).toBe('1')
  })

  it('reorders in place when the lead changes', () => {
    const list = createPlayerList(root)
    list.update([row('ana', { score: 1 }), row('bo', { score: 0 })])
    const anaRow = root.querySelector('.player')

    list.update([row('bo', { score: 5 }), row('ana', { score: 1 })])

    expect(names()).toEqual(['bo', 'ana'])
    expect(root.querySelectorAll('.player')[1]).toBe(anaRow)
  })

  it('drops a player who leaves the room', () => {
    const list = createPlayerList(root)
    list.update([row('ana'), row('bo')])
    list.update([row('ana')])
    expect(names()).toEqual(['ana'])
  })

  it('does not announce itself, so tick-rate score changes stay out of the ear', () => {
    createPlayerList(root).update([row('ana', { score: 1 })])
    expect(root.querySelector('[aria-live]')).toBeNull()
  })
})

describe('toPlayerRows', () => {
  it('ranks the leader first', () => {
    const rows = toPlayerRows(stateOf([snake('ana', 2), snake('bo', 9)]), null)
    expect(rows.map((r) => r.id)).toEqual(['bo', 'ana'])
  })

  it('sinks eliminated players below everyone still alive', () => {
    const rows = toPlayerRows(stateOf([snake('ana', 9, false), snake('bo', 1)]), null)
    expect(rows.map((r) => r.id)).toEqual(['bo', 'ana'])
  })

  it('breaks ties by name so the order never jitters between ticks', () => {
    const rows = toPlayerRows(stateOf([snake('zoe', 3), snake('ana', 3)]), null)
    expect(rows.map((r) => r.id)).toEqual(['ana', 'zoe'])
  })

  it('tags you and the host', () => {
    const rows = toPlayerRows(stateOf([snake('ana', 0), snake('bo', 0)]), 'bo', 'ana')
    expect(rows.find((r) => r.id === 'bo')?.isYou).toBe(true)
    expect(rows.find((r) => r.id === 'ana')?.isHost).toBe(true)
  })
})

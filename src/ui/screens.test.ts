// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createScreens } from './screens'

let lobby: HTMLElement
let game: HTMLElement

beforeEach(() => {
  lobby = document.createElement('section')
  game = document.createElement('section')
  document.body.replaceChildren(lobby, game)
})

describe('createScreens', () => {
  it('opens on the lobby', () => {
    const screens = createScreens({ lobby, game })
    expect(screens.current()).toBe('lobby')
    expect(lobby.hidden).toBe(false)
    expect(game.hidden).toBe(true)
  })

  it('shows exactly one screen at a time', () => {
    const screens = createScreens({ lobby, game })
    screens.show('game')
    expect(lobby.hidden).toBe(true)
    expect(game.hidden).toBe(false)
  })

  it('returns to the lobby after a match', () => {
    const screens = createScreens({ lobby, game })
    screens.show('game')
    screens.show('lobby')
    expect(screens.current()).toBe('lobby')
    expect(lobby.hidden).toBe(false)
  })

  it('ignores a request for the screen already showing', () => {
    const screens = createScreens({ lobby, game })
    screens.show('lobby')
    expect(lobby.hidden).toBe(false)
    expect(game.hidden).toBe(true)
  })

  it('keeps the hidden screen out of the accessibility tree and tab order', () => {
    const button = document.createElement('button')
    lobby.append(button)

    createScreens({ lobby, game }).show('game')

    // `hidden` is what does this — assert the mechanism, since a CSS-class
    // implementation would leave the button focusable and readable.
    expect(lobby.hidden).toBe(true)
  })
})

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLobby, sanitizeName } from './lobby'
import type { LobbyHandlers, LobbyModel } from './lobby'
import type { PlayerRow } from './playerList'

let root: HTMLElement
let handlers: LobbyHandlers

beforeEach(() => {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  handlers = {
    onPlaySolo: vi.fn(),
    onCreateRoom: vi.fn(),
    onJoinRoom: vi.fn(),
    onStartMatch: vi.fn(),
    onLeaveRoom: vi.fn(),
  }
})

function player(id: string, isHost = false): PlayerRow {
  return { id, name: id, color: '#3fb950', score: null, alive: true, isHost, isYou: false }
}

function model(overrides: Partial<LobbyModel> = {}): LobbyModel {
  return {
    name: 'Player',
    phase: 'home',
    roomId: null,
    inviteUrl: null,
    isHost: false,
    players: [],
    message: null,
    roomDraft: null,
    ...overrides,
  }
}

function buttonNamed(label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((node) => node.textContent === label)
}

describe('sanitizeName', () => {
  it('falls back to a default rather than showing a blank row to everyone', () => {
    expect(sanitizeName('   ')).toBe('Player')
    expect(sanitizeName('')).toBe('Player')
  })

  it('trims and collapses whitespace', () => {
    expect(sanitizeName('  ana   lee ')).toBe('ana lee')
  })

  it('caps the length so one player cannot blow out the roster', () => {
    expect(sanitizeName('x'.repeat(50))).toHaveLength(12)
  })
})

describe('createLobby', () => {
  it('starts on the home controls with the room panel hidden', () => {
    createLobby(root, handlers).update(model())
    expect(root.querySelector<HTMLElement>('.lobby__home')?.hidden).toBe(false)
    expect(root.querySelector<HTMLElement>('.lobby__room')?.hidden).toBe(true)
  })

  it('starts a solo game with the entered name', () => {
    createLobby(root, handlers).update(model())
    root.querySelector<HTMLInputElement>('.field__input')!.value = 'Ana'

    buttonNamed('Play solo')?.click()

    expect(handlers.onPlaySolo).toHaveBeenCalledWith('Ana')
  })

  it('sanitizes the name before it reaches the rest of the app', () => {
    createLobby(root, handlers).update(model())
    root.querySelector<HTMLInputElement>('.field__input')!.value = '   '

    buttonNamed('Create room')?.click()

    expect(handlers.onCreateRoom).toHaveBeenCalledWith('Player')
  })

  it('joins with a code typed in lowercase', () => {
    createLobby(root, handlers).update(model())
    root.querySelector<HTMLInputElement>('.field__input--code')!.value = 'abc234'

    root.querySelector('form')?.requestSubmit()

    expect(handlers.onJoinRoom).toHaveBeenCalledWith('Player', 'ABC234')
  })

  it('explains a malformed code instead of dialling a room that cannot exist', () => {
    createLobby(root, handlers).update(model())
    root.querySelector<HTMLInputElement>('.field__input--code')!.value = 'nope'

    root.querySelector('form')?.requestSubmit()

    expect(handlers.onJoinRoom).not.toHaveBeenCalled()
    expect(root.querySelector('.lobby__status')?.textContent).toContain('6 characters')
  })

  it('shows the code and invite link once a room is open', () => {
    createLobby(root, handlers).update(
      model({
        phase: 'room',
        roomId: 'ABC234',
        inviteUrl: 'http://localhost:5173/#room=ABC234',
        isHost: true,
        players: [player('you', true)],
      }),
    )

    expect(root.querySelector('.room__code')?.textContent).toBe('Room ABC234')
    expect(root.querySelector<HTMLInputElement>('.room__link')?.value).toBe(
      'http://localhost:5173/#room=ABC234',
    )
  })

  it('lists everyone in the room', () => {
    createLobby(root, handlers).update(
      model({ phase: 'room', roomId: 'ABC234', players: [player('ana', true), player('bo')] }),
    )

    const names = [...root.querySelectorAll('.player__name')].map((n) => n.textContent)
    expect(names).toEqual(['ana', 'bo'])
  })

  it('keeps the host from starting a match with nobody to play against', () => {
    createLobby(root, handlers).update(
      model({ phase: 'room', roomId: 'ABC234', isHost: true, players: [player('you', true)] }),
    )

    const start = buttonNamed('Start match')
    expect(start?.hidden).toBe(false)
    expect(start?.disabled).toBe(true)
    expect(start?.title).toContain('2 players')
  })

  it('lets the host start once a second player arrives', () => {
    createLobby(root, handlers).update(
      model({
        phase: 'room',
        roomId: 'ABC234',
        isHost: true,
        players: [player('you', true), player('bo')],
      }),
    )

    const start = buttonNamed('Start match')
    expect(start?.disabled).toBe(false)
    start?.click()
    expect(handlers.onStartMatch).toHaveBeenCalled()
  })

  it('shows a client the disabled start button rather than no button at all', () => {
    createLobby(root, handlers).update(
      model({
        phase: 'room',
        roomId: 'ABC234',
        isHost: false,
        players: [player('ana', true), player('you')],
      }),
    )

    expect(buttonNamed('Start match')?.hidden).toBe(true)
  })

  it('reports leaving a room', () => {
    createLobby(root, handlers).update(model({ phase: 'room', roomId: 'ABC234' }))
    buttonNamed('Leave room')?.click()
    expect(handlers.onLeaveRoom).toHaveBeenCalled()
  })

  it('announces connection progress politely', () => {
    createLobby(root, handlers).update(model({ phase: 'connecting', message: 'Connecting…' }))

    const status = root.querySelector('.lobby__status')
    expect(status?.textContent).toBe('Connecting…')
    expect(status?.getAttribute('aria-live')).toBe('polite')
  })

  it('prefills the code an invite link arrived with', () => {
    createLobby(root, handlers).update(model({ roomDraft: 'ABC234' }))
    expect(root.querySelector<HTMLInputElement>('.field__input--code')?.value).toBe('ABC234')
  })

  it('does not refill a code the player has cleared', () => {
    const lobby = createLobby(root, handlers)
    lobby.update(model({ roomDraft: 'ABC234' }))

    const code = root.querySelector<HTMLInputElement>('.field__input--code')!
    code.value = ''
    lobby.update(model({ roomDraft: 'ABC234', message: 'something else changed' }))

    expect(code.value).toBe('')
  })

  it('takes the name field down in a room, where a rename cannot take effect', () => {
    const lobby = createLobby(root, handlers)
    lobby.update(model())
    expect(root.querySelector<HTMLElement>('.field')?.hidden).toBe(false)

    lobby.update(model({ phase: 'room', roomId: 'ABC234' }))
    expect(root.querySelector<HTMLElement>('.field')?.hidden).toBe(true)
  })

  it('does not overwrite a name the player is still typing', () => {
    const lobby = createLobby(root, handlers)
    lobby.update(model())

    const input = root.querySelector<HTMLInputElement>('.field__input')!
    input.focus()
    input.value = 'Ana-in-progress'

    lobby.update(model({ name: 'Player' }))

    expect(input.value).toBe('Ana-in-progress')
  })

  it('copies the invite link and confirms it', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    createLobby(root, handlers).update(
      model({ phase: 'room', roomId: 'ABC234', inviteUrl: 'http://x/#room=ABC234' }),
    )
    buttonNamed('Copy link')?.click()
    await vi.waitFor(() => expect(buttonNamed('Copied')).toBeDefined())

    expect(writeText).toHaveBeenCalledWith('http://x/#room=ABC234')
    vi.unstubAllGlobals()
  })

  it('falls back to a selectable link where there is no clipboard API', async () => {
    vi.stubGlobal('navigator', {})

    createLobby(root, handlers).update(
      model({ phase: 'room', roomId: 'ABC234', inviteUrl: 'http://x/#room=ABC234' }),
    )
    buttonNamed('Copy link')?.click()
    await vi.waitFor(() => expect(buttonNamed('Press Ctrl+C')).toBeDefined())

    vi.unstubAllGlobals()
  })
})

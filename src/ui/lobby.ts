import { ROOM_ID_LENGTH, normalizeRoomId } from '../network/room'
import { createPlayerList } from './playerList'
import type { PlayerRow } from './playerList'

export const MAX_NAME_LENGTH = 12
const DEFAULT_NAME = 'Player'
const COPIED_FEEDBACK_MS = 1600

/** Minimum players for a match; below that the host can still play solo. */
const MIN_MATCH_PLAYERS = 2

export type LobbyPhase = 'home' | 'connecting' | 'room'

export interface LobbyModel {
  readonly name: string
  readonly phase: LobbyPhase
  readonly roomId: string | null
  readonly inviteUrl: string | null
  readonly isHost: boolean
  readonly players: readonly PlayerRow[]
  /** Progress or error text shown under the controls; null hides the line. */
  readonly message: string | null
  /** Prefills the join field — an invite link arrives with the code already known. */
  readonly roomDraft: string | null
}

/* Callbacks, not methods — declared as properties so they are safe to pass
   around detached from the object (see LoopOptions for the same shape). */
export interface LobbyHandlers {
  readonly onPlaySolo: (name: string) => void
  readonly onCreateRoom: (name: string) => void
  readonly onJoinRoom: (name: string, roomId: string) => void
  readonly onStartMatch: () => void
  readonly onLeaveRoom: () => void
}

export interface Lobby {
  update(model: LobbyModel): void
}

/**
 * Names travel to every other player, so they are trimmed, capped and never
 * empty — an all-whitespace name would render as a blank row in the roster.
 */
export function sanitizeName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  return trimmed === '' ? DEFAULT_NAME : trimmed.slice(0, MAX_NAME_LENGTH)
}

function button(
  label: string,
  className: string,
  type: 'button' | 'submit' = 'button',
): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = type
  element.className = className
  element.textContent = label
  return element
}

function field(labelText: string, input: HTMLInputElement, className: string): HTMLLabelElement {
  const label = document.createElement('label')
  label.className = className
  const caption = document.createElement('span')
  caption.className = 'field__label'
  caption.textContent = labelText
  label.append(caption, input)
  return label
}

function copyToClipboard(text: string): Promise<boolean> {
  // jsdom and any non-secure origin have no clipboard API at all.
  const clipboard: Clipboard | undefined = navigator.clipboard
  if (!clipboard) return Promise.resolve(false)
  return clipboard.writeText(text).then(
    () => true,
    () => false,
  )
}

/**
 * The first screen: pick a name, then play alone or open a room.
 *
 * The lobby owns no game or connection state — it renders a model and reports
 * intent, so the same screen serves the host and everyone who joins.
 */
export function createLobby(root: HTMLElement, handlers: LobbyHandlers): Lobby {
  const title = document.createElement('h1')
  title.className = 'lobby__title'
  title.textContent = 'Snake'

  const tagline = document.createElement('p')
  tagline.className = 'lobby__tagline'
  tagline.textContent = 'Eat, grow, and out-last everyone else.'

  const nameInput = document.createElement('input')
  nameInput.className = 'field__input'
  nameInput.type = 'text'
  nameInput.maxLength = MAX_NAME_LENGTH
  nameInput.placeholder = DEFAULT_NAME
  nameInput.autocomplete = 'off'

  const currentName = (): string => sanitizeName(nameInput.value)

  const soloButton = button('Play solo', 'btn btn--primary')
  soloButton.addEventListener('click', () => {
    handlers.onPlaySolo(currentName())
  })

  const createButton = button('Create room', 'btn')
  createButton.addEventListener('click', () => {
    handlers.onCreateRoom(currentName())
  })

  const codeInput = document.createElement('input')
  codeInput.className = 'field__input field__input--code'
  codeInput.type = 'text'
  codeInput.maxLength = ROOM_ID_LENGTH
  codeInput.placeholder = 'ABC234'
  codeInput.autocapitalize = 'characters'
  codeInput.spellcheck = false

  const joinButton = button('Join', 'btn', 'submit')
  const joinForm = document.createElement('form')
  joinForm.className = 'join'
  joinForm.append(field('Room code', codeInput, 'field field--inline'), joinButton)
  joinForm.addEventListener('submit', (event) => {
    event.preventDefault() // a GET navigation here would reload the app
    const roomId = normalizeRoomId(codeInput.value)
    if (roomId === null) {
      setMessage(`Room codes are ${ROOM_ID_LENGTH} characters, like ABC234.`, true)
      codeInput.focus()
      return
    }
    handlers.onJoinRoom(currentName(), roomId)
  })

  const divider = document.createElement('p')
  divider.className = 'lobby__divider'
  divider.textContent = 'or play together'

  const home = document.createElement('section')
  home.className = 'lobby__home'
  home.append(soloButton, divider, createButton, joinForm)

  const codeLabel = document.createElement('p')
  codeLabel.className = 'room__code'

  const linkInput = document.createElement('input')
  linkInput.className = 'field__input room__link'
  linkInput.type = 'text'
  linkInput.readOnly = true
  linkInput.setAttribute('aria-label', 'Invite link')
  // Selecting on focus makes the manual copy path (no clipboard API) one keystroke.
  linkInput.addEventListener('focus', () => {
    linkInput.select()
  })

  const copyButton = button('Copy link', 'btn btn--ghost')
  let copyTimer = 0
  copyButton.addEventListener('click', () => {
    void copyToClipboard(linkInput.value).then((copied) => {
      copyButton.textContent = copied ? 'Copied' : 'Press Ctrl+C'
      if (!copied) linkInput.select()
      clearTimeout(copyTimer)
      copyTimer = window.setTimeout(() => {
        copyButton.textContent = 'Copy link'
      }, COPIED_FEEDBACK_MS)
    })
  })

  const invite = document.createElement('div')
  invite.className = 'room__invite'
  invite.append(linkInput, copyButton)

  const playersRoot = document.createElement('div')
  playersRoot.className = 'players'
  const playerList = createPlayerList(playersRoot, 'In this room')

  const startButton = button('Start match', 'btn btn--primary')
  startButton.addEventListener('click', () => {
    handlers.onStartMatch()
  })

  const leaveButton = button('Leave room', 'btn btn--ghost')
  leaveButton.addEventListener('click', () => {
    handlers.onLeaveRoom()
  })

  const actions = document.createElement('div')
  actions.className = 'room__actions'
  actions.append(startButton, leaveButton)

  const room = document.createElement('section')
  room.className = 'lobby__room'
  room.append(codeLabel, invite, playersRoot, actions)

  const status = document.createElement('p')
  status.className = 'lobby__status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  function setMessage(text: string | null, isError = false): void {
    status.textContent = text ?? ''
    status.hidden = text === null
    status.classList.toggle('lobby__status--error', isError)
  }

  const nameField = field('Your name', nameInput, 'field')

  root.replaceChildren(title, tagline, nameField, home, room, status)
  setMessage(null)

  // Applied on change only, so a later update cannot refill a field the player
  // has deliberately cleared.
  let appliedDraft: string | null = null

  return {
    update(model: LobbyModel): void {
      // Never overwrite what someone is mid-way through typing.
      if (document.activeElement !== nameInput) nameInput.value = model.name

      if (model.roomDraft !== appliedDraft) {
        appliedDraft = model.roomDraft
        if (model.roomDraft !== null) codeInput.value = model.roomDraft
      }

      const inRoom = model.phase !== 'home'
      home.hidden = inRoom
      room.hidden = !inRoom
      /* The name travels with the connection, so once you are in a room it is no
         longer editable — leaving the field up would promise a rename that only
         reconnecting can deliver. */
      nameField.hidden = inRoom

      codeLabel.textContent = model.roomId === null ? '' : `Room ${model.roomId}`
      linkInput.value = model.inviteUrl ?? ''
      invite.hidden = model.inviteUrl === null

      playerList.update(model.players)

      // Only the host starts the match — clients see the button, disabled, so the
      // wait is legible rather than a missing control.
      const enoughPlayers = model.players.length >= MIN_MATCH_PLAYERS
      startButton.hidden = !model.isHost
      startButton.disabled = !enoughPlayers || model.phase !== 'room'
      startButton.title = enoughPlayers ? '' : `Needs ${MIN_MATCH_PLAYERS} players`

      setMessage(model.message)
    },
  }
}

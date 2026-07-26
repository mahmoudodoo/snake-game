import './style.css'
import { PLAYER_COLORS } from './game/constants'
import { tickIntervalForScore } from './game/difficulty'
import { attachKeyboard } from './game/input'
import type { InputSource } from './game/input'
import { createLoop } from './game/loop'
import { DEFAULT_CONFIG, createInitialState } from './game/state'
import type { PlayerSeed } from './game/state'
import { step } from './game/step'
import type { GameState, PlayerId } from './game/types'
import { createTransport, peerIdForRoom } from './network/peer'
import type { RosterEntry } from './network/protocol'
import { createRoomId, inviteUrl, roomIdFromUrl, withoutRoom } from './network/room'
import { hostRoom, joinRoom } from './network/session'
import type { Session } from './network/session'
import { createGameOver } from './ui/gameOver'
import { createHud } from './ui/hud'
import { createLobby, sanitizeName } from './ui/lobby'
import type { LobbyModel } from './ui/lobby'
import { createPlayerList, toPlayerRows } from './ui/playerList'
import type { PlayerRow } from './ui/playerList'
import { drawGame, resizeCanvas } from './ui/renderer'
import { createScreens } from './ui/screens'

const YOU_ID = 'local'

/**
 * Players can now open a room, share the link and see each other arrive; what
 * the connection does not yet carry is the match itself. Until the loop reads
 * from the host's state frames, "Start match" runs a local simulation on each
 * machine, so say so rather than letting people discover it mid-game.
 */
const SYNC_PENDING = 'Connected. Live match sync is still to come — Start match runs locally.'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

function bootstrap(): void {
  const config = DEFAULT_CONFIG
  const canvas = required<HTMLCanvasElement>('#board')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const rosterPanel = required<HTMLElement>('#players')
  const screens = createScreens({
    lobby: required<HTMLElement>('#lobby'),
    game: required<HTMLElement>('#game'),
  })
  const hud = createHud(required<HTMLElement>('#hud'), YOU_ID)
  const roster = createPlayerList(rosterPanel)

  let seeds: readonly PlayerSeed[] = []
  let state: GameState | null = null
  let input: InputSource | null = null
  let lobbyModel: LobbyModel = {
    name: 'Player',
    phase: 'home',
    roomId: null,
    inviteUrl: null,
    isHost: false,
    players: [],
    message: null,
    roomDraft: null,
  }
  // Seeded from the clock once, here at the edge — everything downstream is pure.
  let seed = Date.now() | 0

  const maxScore = (game: GameState): number =>
    game.players.reduce((top, player) => Math.max(top, player.score), 0)

  const currentInterval = (): number => tickIntervalForScore(state ? maxScore(state) : 0)

  const render = (): void => {
    if (state) drawGame(ctx, resizeCanvas(canvas, ctx), state, config)
  }

  function paint(): void {
    if (!state) return
    hud.update(state, currentInterval())
    roster.update(toPlayerRows(state, YOU_ID, lobbyModel.isHost ? YOU_ID : null))
    // A solo run has no roster worth the sidebar; the HUD already carries the score.
    rosterPanel.hidden = state.players.length < 2
    gameOver.update(state, YOU_ID)
  }

  const loop = createLoop({
    tickInterval: currentInterval,
    onTick: () => {
      if (!state || state.status !== 'playing') return
      state = step(state, config, { [YOU_ID]: input?.drain() })
      paint()
      // Nothing left to simulate behind the dialog — stop burning frames.
      if (state.status === 'over') loop.stop()
    },
    onRender: render,
  })

  function newGame(): void {
    state = createInitialState(config, seeds, seed)
    seed = state.rngSeed
    paint()
    render()
    loop.start()
  }

  function enterGame(players: readonly PlayerSeed[]): void {
    seeds = players
    screens.show('game')
    input ??= attachKeyboard()
    input.onRestart(() => {
      if (state?.status === 'over') newGame()
    })
    newGame()
  }

  function leaveGame(): void {
    loop.stop()
    input?.detach()
    input = null
    state = null
    screens.show('lobby')
    renderLobby()
  }

  function setLobby(changes: Partial<LobbyModel>): void {
    lobbyModel = { ...lobbyModel, ...changes }
    renderLobby()
  }

  function renderLobby(): void {
    lobby.update(lobbyModel)
  }

  let session: Session | null = null

  function closeSession(): void {
    session?.close()
    session = null
  }

  /**
   * Puts the current room in the address bar so the link is shareable straight
   * from there, and takes it out again on the way home.
   *
   * replaceState, not pushState: Back should leave the game, not walk backwards
   * through rooms you have already left. It also never fires `hashchange`, which
   * is what keeps this from re-triggering the listener below.
   */
  function syncUrl(roomId: string | null): void {
    const href = window.location.href
    const next = roomId === null ? withoutRoom(href) : inviteUrl(roomId, href)
    if (next !== href) window.history.replaceState(null, '', next)
  }

  /** Nobody has a score in the lobby, so every row is alive and unscored. */
  function rosterRows(roster: readonly RosterEntry[], selfId: PlayerId | null): PlayerRow[] {
    return roster.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      score: null,
      alive: true,
      isHost: entry.isHost,
      isYou: entry.id === selfId,
    }))
  }

  function bindSession(active: Session): void {
    session = active

    active.onRosterChange((roster) => {
      setLobby({ players: rosterRows(roster, active.selfId) })
    })

    active.onStatusChange((status) => {
      if (status === 'connected') setLobby({ phase: 'room', message: SYNC_PENDING })
      // Deliberately leaves `message` alone: whatever explained the disconnect
      // came through onError a moment earlier, and it is the useful half.
      if (status === 'closed') {
        setLobby({ phase: 'home', roomId: null, inviteUrl: null, isHost: false, players: [] })
      }
    })

    active.onError((message) => {
      setLobby({ message })
    })
  }

  function startJoin(name: string, roomId: string): void {
    closeSession()
    syncUrl(roomId)
    setLobby({
      name,
      phase: 'connecting',
      roomId,
      // A joiner can pass the link on too, so the room screen looks the same.
      inviteUrl: inviteUrl(roomId, window.location.href),
      isHost: false,
      players: [],
      message: `Connecting to ${roomId}…`,
      // Keeps the code in the join field, so leaving and coming back is one click.
      roomDraft: roomId,
    })
    bindSession(joinRoom({ roomId, name, transport: createTransport() }))
  }

  const lobby = createLobby(required<HTMLElement>('#lobby'), {
    onPlaySolo: (name) => {
      setLobby({ name })
      enterGame([{ id: YOU_ID, name, color: PLAYER_COLORS[0] ?? '#3fb950' }])
    },
    onCreateRoom: (name) => {
      closeSession()
      const room = createRoomId(seed)
      seed = room.seed
      syncUrl(room.roomId)
      // The room code *is* the host's address on the broker, so the transport
      // has to claim that id rather than take a random one.
      const host = hostRoom({
        roomId: room.roomId,
        name,
        transport: createTransport(peerIdForRoom(room.roomId)),
      })
      setLobby({
        name,
        phase: 'room',
        roomId: room.roomId,
        inviteUrl: inviteUrl(room.roomId, window.location.href),
        isHost: true,
        players: rosterRows(host.roster, host.selfId),
        message: SYNC_PENDING,
      })
      bindSession(host)
    },
    onJoinRoom: startJoin,
    onStartMatch: () => {
      enterGame(
        lobbyModel.players.map((player, index) => ({
          id: player.id,
          name: player.name,
          color: PLAYER_COLORS[index % PLAYER_COLORS.length] ?? player.color,
        })),
      )
    },
    onLeaveRoom: () => {
      closeSession()
      syncUrl(null)
      setLobby({
        phase: 'home',
        roomId: null,
        inviteUrl: null,
        isHost: false,
        players: [],
        message: null,
      })
    },
  })

  const gameOver = createGameOver(required<HTMLElement>('#game-over'), {
    onPlayAgain: newGame,
    onBackToLobby: leaveGame,
  })

  required<HTMLButtonElement>('#quit').addEventListener('click', leaveGame)
  window.addEventListener('resize', render)

  /* Pasting an invite into the address bar of a tab that already has the game
     open changes only the fragment, so the browser fires `hashchange` rather
     than reloading. Without this the link would look broken — the very case the
     fragment was chosen for. Our own replaceState never fires this event, so
     there is no loop. */
  window.addEventListener('hashchange', () => {
    const target = roomIdFromUrl(window.location.href)
    if (target === null || target === lobbyModel.roomId) return
    startJoin(sanitizeName(lobbyModel.name), target)
  })

  /* An invite link should just work, so it connects on load rather than parking
     on the home screen. The name it joins under is the default: renaming means
     leaving the room, which the prefilled code makes cheap. */
  const invited = roomIdFromUrl(window.location.href)
  if (invited !== null) startJoin(sanitizeName(lobbyModel.name), invited)
  else renderLobby()
}

bootstrap()

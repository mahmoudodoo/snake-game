import './style.css'
import { PLAYER_COLORS } from './game/constants'
import { tickIntervalForScore } from './game/difficulty'
import { attachKeyboard, attachSwipe, combineInputs } from './game/input'
import type { InputSource } from './game/input'
import { createLoop } from './game/loop'
import { DEFAULT_CONFIG, createInitialState } from './game/state'
import type { PlayerSeed } from './game/state'
import { step } from './game/step'
import type { Direction, GameState, PlayerId } from './game/types'
import { createTransport, peerIdForRoom } from './network/peer'
import type { RosterEntry } from './network/protocol'
import { createRoomId, inviteUrl, roomIdFromUrl, withoutRoom } from './network/room'
import { hostRoom, joinRoom } from './network/session'
import type { ClientSession, HostSession } from './network/session'
import { createGameOver } from './ui/gameOver'
import { createDpad } from './ui/dpad'
import { createHud } from './ui/hud'
import { createLobby, sanitizeName } from './ui/lobby'
import type { LobbyModel } from './ui/lobby'
import { createPlayerList, toPlayerRows } from './ui/playerList'
import type { PlayerRow } from './ui/playerList'
import { drawGame, resizeCanvas } from './ui/renderer'
import { createScreens } from './ui/screens'

const YOU_ID = 'local'

const CONNECTED = 'Connected. The host starts the match when everyone is in.'

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
  const hudRoot = required<HTMLElement>('#hud')
  const roster = createPlayerList(rosterPanel)

  /* Which seat is "you" — 'local' solo, or the id the host assigned in a room.
     The HUD bakes it in at construction, so it is rebuilt when the seat changes. */
  let youId: PlayerId = YOU_ID
  let hud = createHud(hudRoot, youId)

  let seeds: readonly PlayerSeed[] = []
  let state: GameState | null = null
  let input: InputSource | null = null
  /* Directions received from clients since the last tick. Drained into step()
     and cleared, so a peer that stops sending simply keeps its heading. */
  let remoteInputs: Partial<Record<PlayerId, Direction>> = {}
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

  /** Solo and host own the simulation; a client only ever renders what it is sent. */
  const simulating = (): boolean => session === null || session.role === 'host'

  function paint(): void {
    if (!state) return
    const hostId = session === null ? null : (session.roster.find((e) => e.isHost)?.id ?? null)
    hud.update(state, currentInterval())
    roster.update(toPlayerRows(state, youId, hostId))
    // A solo run has no roster worth the sidebar; the HUD already carries the score.
    rosterPanel.hidden = state.players.length < 2
    gameOver.update(state, youId)
  }

  const loop = createLoop({
    tickInterval: currentInterval,
    onTick: () => {
      const pressed = input?.drain()

      /* Client: inputs only. It never calls step() — the host's frames are the
         world, so simulating here would just be a second, diverging game. */
      if (!simulating()) {
        if (pressed !== undefined && session?.role === 'client') session.sendInput(pressed)
        return
      }

      if (!state || state.status !== 'playing') return

      const inputs: Partial<Record<PlayerId, Direction>> = { ...remoteInputs }
      remoteInputs = {}
      if (pressed !== undefined) inputs[youId] = pressed

      state = step(state, config, inputs)
      // Broadcast before painting: peers should see the frame at least as soon
      // as the host does, rather than a render's worth of work later.
      if (session?.role === 'host') session.broadcastState(state)
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

  /** Screen + input wiring shared by both roles. Rebuilds the HUD for this seat. */
  function showGame(): void {
    hud = createHud(hudRoot, youId)
    screens.show('game')
    /* Keyboard, swipe and on-screen pad are all live at once — a tablet with a
       keyboard should not have to pick, and nothing here has to detect a device. */
    input ??= combineInputs(
      attachKeyboard(),
      attachSwipe(required<HTMLElement>('#stage')),
      createDpad(required<HTMLElement>('#dpad')),
    )
    input.onRestart(() => {
      // Only the authority restarts; a client waits for the host's next frame.
      if (simulating() && state?.status === 'over') newGame()
    })
  }

  function enterGame(players: readonly PlayerSeed[]): void {
    seeds = players
    showGame()
    newGame()
  }

  /**
   * A client has no "start" signal of its own — the host's first state frame is
   * the signal. That keeps match start off the wire protocol entirely.
   */
  function enterGameAsClient(): void {
    showGame()
    loop.start()
  }

  function leaveGame(): void {
    loop.stop()
    input?.detach()
    input = null
    state = null
    /* A client that walks out mid-match would otherwise be dragged straight back
       by the host's next frame, so leaving the game leaves the room. The host
       keeps its room — going back to the lobby is how it starts the next match. */
    if (session?.role === 'client') {
      closeSession()
      syncUrl(null)
      setLobby({ phase: 'home', roomId: null, inviteUrl: null, isHost: false, players: [] })
      youId = YOU_ID
    }
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

  let session: HostSession | ClientSession | null = null

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

  function bindSession(active: HostSession | ClientSession): void {
    session = active
    youId = active.selfId ?? YOU_ID
    remoteInputs = {}

    if (active.role === 'host') {
      // Keep only the latest direction per player: step() applies one per tick,
      // so an earlier one in the same tick is already stale.
      active.onInput((playerId, dir) => {
        remoteInputs[playerId] = dir
      })
    } else {
      active.onState((next) => {
        const firstFrame = state === null
        state = next
        if (firstFrame) {
          enterGameAsClient()
        } else if (next.status === 'playing' && !loop.running) {
          /* The previous match ended, which stopped this client's loop — and the
             loop is what forwards input. Without restarting it the next round
             renders perfectly and ignores every key. */
          loop.start()
        }
        paint()
        render()
        if (next.status === 'over') loop.stop()
      })
    }

    active.onRosterChange((roster) => {
      // A client learns its seat with the welcome, which lands as a roster change.
      youId = active.selfId ?? youId
      setLobby({ players: rosterRows(roster, active.selfId) })
    })

    active.onStatusChange((status) => {
      if (status === 'connected') setLobby({ phase: 'room', message: CONNECTED })
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
        message: CONNECTED,
      })
      bindSession(host)
    },
    onJoinRoom: startJoin,
    onStartMatch: () => {
      /* Seat colours, not row order: a seat freed and refilled mid-lobby leaves
         the two out of step, and the roster's colour is the one peers already see. */
      enterGame(
        lobbyModel.players.map((player) => ({
          id: player.id,
          name: player.name,
          color: player.color,
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
    // Only the authority can deal a new board; a client's next match arrives as
    // a state frame when the host restarts.
    onPlayAgain: () => {
      if (simulating()) newGame()
    },
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

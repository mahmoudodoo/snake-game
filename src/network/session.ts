import { MAX_PLAYERS, PLAYER_COLORS } from '../game/constants'
import type { Direction, GameState, PlayerId } from '../game/types'
import { peerIdForRoom } from './peer'
import type { Channel, Transport, TransportError } from './peer'
import { PROTOCOL_VERSION, parseMessage, sanitizeName } from './protocol'
import type { RejectReason, RosterEntry } from './protocol'

export type SessionStatus = 'connecting' | 'connected' | 'closed'

export interface Session {
  readonly role: 'host' | 'client'
  readonly roomId: string
  readonly status: SessionStatus
  /** The seat this player was given, or null before the handshake completes. */
  readonly selfId: PlayerId | null
  readonly roster: readonly RosterEntry[]
  onRosterChange(handler: (roster: readonly RosterEntry[]) => void): void
  onStatusChange(handler: (status: SessionStatus) => void): void
  onError(handler: (message: string) => void): void
  close(): void
}

export interface HostSession extends Session {
  readonly role: 'host'
  broadcastState(state: GameState): void
  onInput(handler: (playerId: PlayerId, dir: Direction) => void): void
}

export interface ClientSession extends Session {
  readonly role: 'client'
  sendInput(dir: Direction): void
  onState(handler: (state: GameState) => void): void
}

export interface SessionOptions {
  readonly roomId: string
  readonly name: string
  readonly transport: Transport
}

export interface HostOptions extends SessionOptions {
  readonly maxPlayers?: number
}

function colorForSeat(seat: number): string {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length] ?? '#3fb950'
}

function idForSeat(seat: number): PlayerId {
  return `p${seat + 1}`
}

/** Seat number is the fallback identity, so two blank names never collide. */
function nameForSeat(name: string, seat: number): string {
  const clean = sanitizeName(name)
  return clean === '' ? `Player ${seat + 1}` : clean
}

function messageForReason(reason: RejectReason): string {
  return reason === 'version'
    ? 'This page is out of date — reload to join.'
    : 'That room is full.'
}

function messageForTransport(error: TransportError): string {
  switch (error.kind) {
    case 'peer-unavailable':
      return 'Room not found — check the invite link.'
    case 'unavailable-id':
      return 'That room code is already taken. Create a new room.'
    case 'browser-incompatible':
      return 'This browser does not support WebRTC data channels.'
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Lost contact with the signaling server.'
    default:
      return error.message
  }
}

/** Shared status/roster/error plumbing; the two roles differ only in transitions. */
function createEmitter() {
  const rosterHandlers: ((roster: readonly RosterEntry[]) => void)[] = []
  const statusHandlers: ((status: SessionStatus) => void)[] = []
  const errorHandlers: ((message: string) => void)[] = []

  let status: SessionStatus = 'connecting'
  let roster: readonly RosterEntry[] = []

  return {
    get status(): SessionStatus {
      return status
    },
    get roster(): readonly RosterEntry[] {
      return roster
    },
    setStatus(next: SessionStatus): void {
      if (status === next || status === 'closed') return
      status = next
      for (const handler of statusHandlers) handler(next)
    },
    setRoster(next: readonly RosterEntry[]): void {
      roster = next
      for (const handler of rosterHandlers) handler(next)
    },
    fail(message: string): void {
      for (const handler of errorHandlers) handler(message)
    },
    /* Arrows, not methods: both sessions hand these straight out as their own
       subscribe functions, so they have to survive being detached from here. */
    onRosterChange: (handler: (roster: readonly RosterEntry[]) => void): void => {
      rosterHandlers.push(handler)
    },
    onStatusChange: (handler: (status: SessionStatus) => void): void => {
      statusHandlers.push(handler)
    },
    onError: (handler: (message: string) => void): void => {
      errorHandlers.push(handler)
    },
  }
}

interface Seat {
  readonly entry: RosterEntry
  /** null for the host's own seat, which has no connection to itself. */
  readonly channel: Channel | null
}

/**
 * Opens a room and seats everyone who connects.
 *
 * The host is the authority: it owns the seating table, hands out player ids,
 * and is the only side that ever sends state. A client's `state` frame is
 * dropped on arrival rather than merged — that rule is enforced here, at the
 * edge, so no downstream code has to remember it.
 */
export function hostRoom(options: HostOptions): HostSession {
  const { roomId, transport } = options
  const maxPlayers = options.maxPlayers ?? MAX_PLAYERS
  const emitter = createEmitter()
  const inputHandlers: ((playerId: PlayerId, dir: Direction) => void)[] = []

  const seats: (Seat | null)[] = Array.from({ length: maxPlayers }, () => null)
  seats[0] = {
    entry: {
      id: idForSeat(0),
      name: nameForSeat(options.name, 0),
      color: colorForSeat(0),
      isHost: true,
    },
    channel: null,
  }

  const occupied = (): Seat[] => seats.filter((seat): seat is Seat => seat !== null)

  const publishRoster = (): void => {
    const roster = occupied().map((seat) => seat.entry)
    emitter.setRoster(roster)
    for (const seat of occupied()) {
      seat.channel?.send({ type: 'roster', roster })
    }
  }

  transport.onReady(() => emitter.setStatus('connected'))
  transport.onError((error) => emitter.fail(messageForTransport(error)))

  transport.onIncoming((channel) => {
    let seatIndex = -1

    const release = (): void => {
      if (seatIndex === -1) return
      seats[seatIndex] = null
      seatIndex = -1
      publishRoster()
    }

    channel.onData((raw) => {
      const message = parseMessage(raw)
      if (message === null) return

      if (message.type === 'hello') {
        if (seatIndex !== -1) return // already seated; a repeat hello is noise
        if (message.version !== PROTOCOL_VERSION) {
          channel.send({ type: 'reject', version: PROTOCOL_VERSION, reason: 'version' })
          channel.close()
          return
        }

        const free = seats.findIndex((seat) => seat === null)
        if (free === -1) {
          channel.send({ type: 'reject', version: PROTOCOL_VERSION, reason: 'full' })
          channel.close()
          return
        }

        seatIndex = free
        seats[free] = {
          entry: {
            id: idForSeat(free),
            name: nameForSeat(message.name, free),
            color: colorForSeat(free),
            isHost: false,
          },
          channel,
        }
        channel.send({
          type: 'welcome',
          version: PROTOCOL_VERSION,
          selfId: idForSeat(free),
          roster: occupied().map((seat) => seat.entry),
        })
        publishRoster()
        return
      }

      const seat = seats[seatIndex]
      if (seat === undefined || seat === null) return // nothing counts before a hello

      if (message.type === 'input') {
        for (const handler of inputHandlers) handler(seat.entry.id, message.dir)
      }
      // welcome/reject/roster/state are host-to-client only. A client sending
      // one is either stale or lying; either way it does not get to speak for
      // the simulation.
    })

    channel.onClose(release)
  })

  publishRoster()

  return {
    role: 'host',
    roomId,
    get status(): SessionStatus {
      return emitter.status
    },
    get selfId(): PlayerId | null {
      return idForSeat(0)
    },
    get roster(): readonly RosterEntry[] {
      return emitter.roster
    },
    onRosterChange: emitter.onRosterChange,
    onStatusChange: emitter.onStatusChange,
    onError: emitter.onError,
    broadcastState(state: GameState): void {
      for (const seat of occupied()) {
        seat.channel?.send({ type: 'state', state })
      }
    },
    onInput(handler: (playerId: PlayerId, dir: Direction) => void): void {
      inputHandlers.push(handler)
    },
    close(): void {
      for (const seat of occupied()) seat.channel?.close()
      transport.destroy()
      emitter.setStatus('closed')
    },
  }
}

/**
 * Joins a room by code and waits to be seated.
 *
 * The client never decides anything about the match: it reports a name, sends
 * directions, and renders whatever the host says the world looks like.
 */
export function joinRoom(options: SessionOptions): ClientSession {
  const { roomId, transport } = options
  /* Resolved before anything is wired up: a bad code is a caller bug, and it
     should surface here rather than from inside a signaling callback later. */
  const hostPeerId = peerIdForRoom(roomId)
  const emitter = createEmitter()
  const stateHandlers: ((state: GameState) => void)[] = []

  let channel: Channel | null = null
  let selfId: PlayerId | null = null

  transport.onError((error) => emitter.fail(messageForTransport(error)))

  transport.onReady(() => {
    const connection = transport.connect(hostPeerId)
    channel = connection

    connection.onOpen(() => {
      connection.send({ type: 'hello', version: PROTOCOL_VERSION, name: sanitizeName(options.name) })
    })

    connection.onData((raw) => {
      const message = parseMessage(raw)
      if (message === null) return

      switch (message.type) {
        case 'welcome':
          selfId = message.selfId
          emitter.setRoster(message.roster)
          emitter.setStatus('connected')
          return
        case 'reject':
          emitter.fail(messageForReason(message.reason))
          emitter.setStatus('closed')
          return
        case 'roster':
          emitter.setRoster(message.roster)
          return
        case 'state':
          for (const handler of stateHandlers) handler(message.state)
          return
        case 'hello':
        case 'input':
          // Client-to-host frames. Nothing to do with them on this side.
          return
      }
    })

    connection.onClose(() => {
      if (emitter.status !== 'closed') emitter.fail('The host left — the room is gone.')
      emitter.setStatus('closed')
    })
  })

  return {
    role: 'client',
    roomId,
    get status(): SessionStatus {
      return emitter.status
    },
    get selfId(): PlayerId | null {
      return selfId
    },
    get roster(): readonly RosterEntry[] {
      return emitter.roster
    },
    onRosterChange: emitter.onRosterChange,
    onStatusChange: emitter.onStatusChange,
    onError: emitter.onError,
    sendInput(dir: Direction): void {
      channel?.send({ type: 'input', dir })
    },
    onState(handler: (state: GameState) => void): void {
      stateHandlers.push(handler)
    },
    close(): void {
      channel?.close()
      transport.destroy()
      emitter.setStatus('closed')
    },
  }
}

import { describe, expect, it, vi } from 'vitest'
import { PROTOCOL_VERSION } from './protocol'
import type { NetMessage } from './protocol'
import { peerIdForRoom } from './peer'
import type { Channel, Transport, TransportError } from './peer'
import { hostRoom, joinRoom } from './session'
import type { ClientSession } from './session'
import type { GameState } from '../game/types'

const ROOM = 'ABC234'

/** Lets microtasks and timers run, the way a real channel's callbacks arrive. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

interface FakeChannel extends Channel {
  attach(other: FakeChannel): void
  deliver(raw: unknown): void
  dropRemote(): void
}

function createFakeChannel(remoteId: string): FakeChannel {
  const dataHandlers: ((raw: unknown) => void)[] = []
  const closeHandlers: (() => void)[] = []
  let other: FakeChannel | null = null
  let closed = false

  const fireClose = (): void => {
    if (closed) return
    closed = true
    for (const handler of [...closeHandlers]) handler()
  }

  return {
    remoteId,
    get open(): boolean {
      return !closed
    },
    send(message: NetMessage): void {
      if (closed) return
      // structuredClone stands in for serialization: no test can accidentally
      // pass by sharing an object reference across the "wire".
      other?.deliver(structuredClone(message))
    },
    close(): void {
      const wasOpen = !closed
      fireClose()
      if (wasOpen) other?.dropRemote()
    },
    onOpen(handler: () => void): void {
      // Deferred, like the real adapter: a handshake that only works when the
      // open callback is synchronous is a handshake that hangs in a browser.
      queueMicrotask(handler)
    },
    onData(handler: (raw: unknown) => void): void {
      dataHandlers.push(handler)
    },
    onClose(handler: () => void): void {
      if (closed) queueMicrotask(handler)
      else closeHandlers.push(handler)
    },
    attach(peer: FakeChannel): void {
      other = peer
    },
    deliver(raw: unknown): void {
      if (closed) return
      for (const handler of [...dataHandlers]) handler(raw)
    },
    dropRemote(): void {
      fireClose()
    },
  }
}

interface FakeNetwork {
  transportFor(localId: string): Transport
  /** Raises a signaling-level failure, as PeerJS would. */
  failFor(localId: string, error: TransportError): void
}

function createFakeNetwork(): FakeNetwork {
  const incoming = new Map<string, (channel: Channel) => void>()
  const errors = new Map<string, ((error: TransportError) => void)[]>()

  return {
    transportFor(localId: string): Transport {
      return {
        onReady(handler: (id: string) => void): void {
          handler(localId)
        },
        onIncoming(handler: (channel: Channel) => void): void {
          incoming.set(localId, handler)
        },
        onError(handler: (error: TransportError) => void): void {
          errors.set(localId, [...(errors.get(localId) ?? []), handler])
        },
        connect(remoteId: string): Channel {
          const near = createFakeChannel(remoteId)
          const far = createFakeChannel(localId)
          near.attach(far)
          far.attach(near)
          incoming.get(remoteId)?.(far)
          return near
        },
        destroy(): void {
          incoming.delete(localId)
        },
      }
    },
    failFor(localId: string, error: TransportError): void {
      for (const handler of errors.get(localId) ?? []) handler(error)
    },
  }
}

interface Fixture {
  readonly net: FakeNetwork
  readonly host: ReturnType<typeof hostRoom>
  join(name: string, clientId?: string): ClientSession
}

function fixture(hostName = 'Ada', maxPlayers?: number): Fixture {
  const net = createFakeNetwork()
  const host = hostRoom({
    roomId: ROOM,
    name: hostName,
    transport: net.transportFor(peerIdForRoom(ROOM)),
    ...(maxPlayers === undefined ? {} : { maxPlayers }),
  })

  let joins = 0
  return {
    net,
    host,
    join(name: string, clientId?: string): ClientSession {
      joins += 1
      return joinRoom({
        roomId: ROOM,
        name,
        transport: net.transportFor(clientId ?? `guest-${joins}`),
      })
    },
  }
}

describe('hostRoom', () => {
  it('seats the host before anyone connects', () => {
    const { host } = fixture('Ada')
    expect(host.status).toBe('connected')
    expect(host.selfId).toBe('p1')
    expect(host.roster).toEqual([{ id: 'p1', name: 'Ada', color: '#3fb950', isHost: true }])
  })

  it('numbers a blank name by seat so two anonymous players stay distinct', async () => {
    const f = fixture('   ')
    f.join('')
    await settle()
    expect(f.host.roster.map((entry) => entry.name)).toEqual(['Player 1', 'Player 2'])
  })

  it('gives every seat its own colour', async () => {
    const f = fixture()
    f.join('Bob')
    f.join('Cy')
    await settle()
    const colors = f.host.roster.map((entry) => entry.color)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('marks exactly one entry as the host', async () => {
    const f = fixture()
    f.join('Bob')
    await settle()
    expect(f.host.roster.filter((entry) => entry.isHost)).toHaveLength(1)
  })
})

describe('joining', () => {
  it('completes the handshake and reports the assigned seat', async () => {
    const f = fixture('Ada')
    const client = f.join('Bob')
    await settle()

    expect(client.status).toBe('connected')
    expect(client.selfId).toBe('p2')
    expect(client.roster.map((entry) => entry.name)).toEqual(['Ada', 'Bob'])
  })

  it('tells the players already in the room that someone arrived', async () => {
    const f = fixture('Ada')
    const first = f.join('Bob')
    await settle()

    f.join('Cy')
    await settle()

    expect(first.roster.map((entry) => entry.name)).toEqual(['Ada', 'Bob', 'Cy'])
    expect(f.host.roster).toHaveLength(3)
  })

  it('notifies subscribers rather than making them poll', async () => {
    const f = fixture('Ada')
    const seen = vi.fn()
    f.host.onRosterChange(seen)

    f.join('Bob')
    await settle()

    expect(seen).toHaveBeenCalledWith([
      { id: 'p1', name: 'Ada', color: '#3fb950', isHost: true },
      expect.objectContaining({ id: 'p2', name: 'Bob', isHost: false }),
    ])
  })

  it('turns a missing room into an explanation, not a hang', () => {
    const net = createFakeNetwork()
    const client = joinRoom({ roomId: ROOM, name: 'Bob', transport: net.transportFor('guest') })
    const failed = vi.fn()
    client.onError(failed)

    net.failFor('guest', { kind: 'peer-unavailable', message: 'Could not connect to peer' })

    expect(failed).toHaveBeenCalledWith('Room not found — check the invite link.')
  })

  it('refuses a room code that could not have come from this app', () => {
    const net = createFakeNetwork()
    expect(() =>
      joinRoom({ roomId: '../evil', name: 'Bob', transport: net.transportFor('guest') }),
    ).toThrow(/room id/i)
  })
})

describe('admission control', () => {
  it('rejects a joiner on a different protocol version', async () => {
    const f = fixture('Ada')
    const transport = f.net.transportFor('stale')
    const channel = transport.connect(peerIdForRoom(ROOM))
    const received: unknown[] = []
    channel.onData((raw) => received.push(raw))

    channel.send({ type: 'hello', version: PROTOCOL_VERSION + 1, name: 'Stale' })
    await settle()

    expect(received).toEqual([
      { type: 'reject', version: PROTOCOL_VERSION, reason: 'version' },
    ])
    expect(f.host.roster).toHaveLength(1)
    expect(channel.open).toBe(false)
  })

  it('turns away a joiner once every seat is taken', async () => {
    const f = fixture('Ada', 2)
    f.join('Bob')
    await settle()

    const late = f.join('Cy')
    const failed = vi.fn()
    late.onError(failed)
    await settle()

    expect(failed).toHaveBeenCalledWith('That room is full.')
    expect(late.status).toBe('closed')
    expect(f.host.roster).toHaveLength(2)
  })

  it('frees the seat when a player leaves, and tells everyone else', async () => {
    const f = fixture('Ada', 2)
    const bob = f.join('Bob')
    await settle()
    expect(f.host.roster).toHaveLength(2)

    bob.close()
    await settle()
    expect(f.host.roster).toEqual([{ id: 'p1', name: 'Ada', color: '#3fb950', isHost: true }])

    // The freed seat is reusable, not burned for the life of the room.
    f.join('Cy')
    await settle()
    expect(f.host.roster.map((entry) => entry.name)).toEqual(['Ada', 'Cy'])
  })

  it('ignores a second hello instead of handing out a second seat', async () => {
    const f = fixture('Ada')
    const transport = f.net.transportFor('greedy')
    const channel = transport.connect(peerIdForRoom(ROOM))

    channel.send({ type: 'hello', version: PROTOCOL_VERSION, name: 'A' })
    channel.send({ type: 'hello', version: PROTOCOL_VERSION, name: 'B' })
    await settle()

    expect(f.host.roster).toHaveLength(2)
  })
})

describe('host authority', () => {
  it('routes a client input to the host under that client’s player id', async () => {
    const f = fixture('Ada')
    const inputs = vi.fn()
    f.host.onInput(inputs)

    const bob = f.join('Bob')
    await settle()
    bob.sendInput('up')
    await settle()

    expect(inputs).toHaveBeenCalledWith('p2', 'up')
  })

  it('delivers the host snapshot to every client', async () => {
    const f = fixture('Ada')
    const bob = f.join('Bob')
    const seen = vi.fn()
    bob.onState(seen)
    await settle()

    const state: GameState = {
      tick: 4,
      status: 'playing',
      players: [
        { id: 'p1', name: 'Ada', color: '#3fb950', body: [{ x: 1, y: 1 }], dir: 'right', alive: true, score: 0 },
      ],
      food: [{ x: 5, y: 5 }],
      rngSeed: 7,
      winnerId: null,
    }
    f.host.broadcastState(state)
    await settle()

    expect(seen).toHaveBeenCalledWith(state)
  })

  it('ignores a client that tries to dictate state', async () => {
    const f = fixture('Ada')
    const bystander = f.join('Cy')
    const seen = vi.fn()
    bystander.onState(seen)
    await settle()

    // A seated client putting a host-only frame on the wire. If the host
    // relayed it, the bystander would render a match the host never simulated.
    const impostor = f.net.transportFor('impostor').connect(peerIdForRoom(ROOM))
    impostor.send({ type: 'hello', version: PROTOCOL_VERSION, name: 'Imp' })
    await settle()
    impostor.send({
      type: 'state',
      state: { tick: 999, status: 'over', players: [], food: [], rngSeed: 1, winnerId: 'p4' },
    })
    await settle()

    expect(seen).not.toHaveBeenCalled()
  })

  it('ignores a client that tries to rewrite the roster', async () => {
    const f = fixture('Ada')
    const bob = f.join('Bob')
    await settle()
    const before = f.host.roster

    const impostor = f.net.transportFor('impostor').connect(peerIdForRoom(ROOM))
    impostor.send({ type: 'hello', version: PROTOCOL_VERSION, name: 'Imp' })
    await settle()
    impostor.send({
      type: 'roster',
      roster: [{ id: 'p1', name: 'Pwned', color: '#000', isHost: true }],
    })
    await settle()

    expect(f.host.roster.map((entry) => entry.name)).toEqual(['Ada', 'Bob', 'Imp'])
    expect(bob.roster.map((entry) => entry.name)).toEqual(['Ada', 'Bob', 'Imp'])
    expect(before.map((entry) => entry.name)).toEqual(['Ada', 'Bob'])
  })

  it('drops input from a connection that never said hello', async () => {
    const f = fixture('Ada')
    const inputs = vi.fn()
    f.host.onInput(inputs)

    const channel = f.net.transportFor('silent').connect(peerIdForRoom(ROOM))
    channel.send({ type: 'input', dir: 'down' })
    await settle()

    expect(inputs).not.toHaveBeenCalled()
    expect(f.host.roster).toHaveLength(1)
  })

  it('survives a peer sending garbage', async () => {
    const f = fixture('Ada')
    const channel = f.net.transportFor('noisy').connect(peerIdForRoom(ROOM))
    // The wire carries whatever the remote puts on it, not just NetMessage.
    const raw = channel as unknown as { send(frame: unknown): void }

    for (const junk of [null, 'hello', 42, { type: 'input', dir: 'sideways' }, {}, []]) {
      expect(() => raw.send(junk)).not.toThrow()
    }
    await settle()

    expect(f.host.roster).toHaveLength(1)
  })
})

describe('leaving', () => {
  it('tells the client when the host disappears', async () => {
    const f = fixture('Ada')
    const bob = f.join('Bob')
    const failed = vi.fn()
    bob.onError(failed)
    await settle()

    f.host.close()
    await settle()

    expect(failed).toHaveBeenCalledWith('The host left — the room is gone.')
    expect(bob.status).toBe('closed')
  })

  it('stops accepting connections after the host closes the room', async () => {
    const f = fixture('Ada')
    f.host.close()

    const late = f.join('Bob')
    await settle()

    expect(late.roster).toEqual([])
    expect(f.host.status).toBe('closed')
  })
})

import { Peer } from 'peerjs'
import type { DataConnection } from 'peerjs'
import { normalizeRoomId } from './room'
import type { NetMessage } from './protocol'

/**
 * PeerJS ids are global across the signaling server, and the default broker is
 * the public PeerJS cloud shared with every other app using the library. A bare
 * six-character room code would eventually collide with a stranger's; the
 * namespace makes that a non-issue while keeping the code short enough to read
 * over a call.
 */
const PEER_ID_PREFIX = 'snake-'

export function peerIdForRoom(roomId: string): string {
  const normalized = normalizeRoomId(roomId)
  if (normalized === null) throw new Error(`Not a room id: ${roomId}`)
  return `${PEER_ID_PREFIX}${normalized}`
}

export interface TransportError {
  /** PeerJS error type when there is one — 'peer-unavailable', 'network', … */
  readonly kind: string
  readonly message: string
}

/**
 * One data channel to one peer.
 *
 * Outbound is a typed `NetMessage`; inbound is `unknown`, because it is. The
 * asymmetry is the point: everything off the wire goes through
 * {@link parseMessage} before anything trusts its shape.
 */
export interface Channel {
  readonly remoteId: string
  readonly open: boolean
  send(message: NetMessage): void
  close(): void
  onOpen(handler: () => void): void
  onData(handler: (raw: unknown) => void): void
  onClose(handler: () => void): void
}

/**
 * The signaling side of PeerJS, narrowed to what a session needs.
 *
 * Sessions talk to this rather than to `Peer` directly, so the handshake can be
 * tested against a pair of in-memory transports instead of a live broker.
 */
export interface Transport {
  /** Fires once the broker has registered this peer and assigned it an id. */
  onReady(handler: (localId: string) => void): void
  /** Host side: fires for every inbound connection. */
  onIncoming(handler: (channel: Channel) => void): void
  onError(handler: (error: TransportError) => void): void
  connect(remoteId: string): Channel
  destroy(): void
}

function errorOf(error: unknown): TransportError {
  const kind =
    typeof error === 'object' && error !== null && 'type' in error ? String(error.type) : 'unknown'
  return { kind, message: error instanceof Error ? error.message : String(error) }
}

function wrapConnection(connection: DataConnection): Channel {
  /* PeerJS reports a dead connection as 'close' or as 'error' depending on how
     it died, and can emit both. Downstream expects one close, once. */
  let closed = false
  const closeHandlers: (() => void)[] = []

  const fireClose = (): void => {
    if (closed) return
    closed = true
    for (const handler of closeHandlers) handler()
  }

  connection.on('close', fireClose)
  connection.on('error', fireClose)

  return {
    get remoteId(): string {
      return connection.peer
    },
    get open(): boolean {
      return connection.open && !closed
    },
    send(message: NetMessage): void {
      // Sending before the channel opens throws inside PeerJS rather than
      // buffering, and there is nothing useful to say to a peer that is gone.
      if (!connection.open || closed) return
      void connection.send(message)
    },
    close(): void {
      connection.close()
      fireClose()
    },
    onOpen(handler: () => void): void {
      /* An inbound connection can already be open by the time the host's
         'connection' handler runs, and PeerJS will not re-emit 'open' for a
         late listener — the classic way a handshake hangs forever. */
      if (connection.open) queueMicrotask(handler)
      else connection.on('open', handler)
    },
    onData(handler: (raw: unknown) => void): void {
      connection.on('data', handler)
    },
    onClose(handler: () => void): void {
      if (closed) queueMicrotask(handler)
      else closeHandlers.push(handler)
    },
  }
}

/**
 * Real transport over PeerJS.
 *
 * Pass the host's fixed peer id when opening a room; omit it to let the broker
 * assign a random one, which is what joiners want.
 */
export function createTransport(localPeerId?: string): Transport {
  const peer = localPeerId === undefined ? new Peer() : new Peer(localPeerId)

  let ready = peer.open
  const readyHandlers: ((id: string) => void)[] = []
  const errorHandlers: ((error: TransportError) => void)[] = []

  peer.on('open', (id) => {
    ready = true
    for (const handler of readyHandlers) handler(id)
  })

  peer.on('error', (error) => {
    const wrapped = errorOf(error)
    for (const handler of errorHandlers) handler(wrapped)
  })

  return {
    onReady(handler: (localId: string) => void): void {
      if (ready) queueMicrotask(() => handler(peer.id))
      else readyHandlers.push(handler)
    },
    onIncoming(handler: (channel: Channel) => void): void {
      peer.on('connection', (connection) => handler(wrapConnection(connection)))
    },
    onError(handler: (error: TransportError) => void): void {
      errorHandlers.push(handler)
    },
    connect(remoteId: string): Channel {
      return wrapConnection(peer.connect(remoteId, { reliable: true }))
    },
    destroy(): void {
      peer.destroy()
    },
  }
}

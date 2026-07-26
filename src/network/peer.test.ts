import { describe, expect, it } from 'vitest'
import { peerIdForRoom } from './peer'
import { createRoomId } from './room'

/**
 * Only the pure half of the adapter is unit-tested. Wrapping PeerJS in a mock
 * of PeerJS proves nothing about PeerJS; the transport itself is verified by
 * driving two real browsers through a live data channel.
 */
describe('peerIdForRoom', () => {
  it('namespaces the code, because the public broker is shared with every other app', () => {
    expect(peerIdForRoom('ABC234')).toBe('snake-ABC234')
  })

  it('accepts a code the way a player would retype it', () => {
    expect(peerIdForRoom(' abc234 ')).toBe('snake-ABC234')
  })

  it('round-trips a freshly generated room', () => {
    const { roomId } = createRoomId(2026)
    expect(peerIdForRoom(roomId)).toBe(`snake-${roomId}`)
  })

  it('refuses anything that is not a room code', () => {
    // This string becomes a peer id, and it arrives from the URL. A code that
    // does not match the alphabet has no business reaching the broker.
    for (const bogus of ['', 'ABC23', 'ABC2345', '../evil', 'snake-ABC234', 'ABC-23']) {
      expect(() => peerIdForRoom(bogus)).toThrow(/room id/i)
    }
  })

  it('starts and ends alphanumeric, as PeerJS requires of an id', () => {
    expect(peerIdForRoom('ABC234')).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]*[A-Za-z0-9]$/)
  })
})

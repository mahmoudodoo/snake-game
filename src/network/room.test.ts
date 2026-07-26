import { describe, expect, it } from 'vitest'
import {
  ROOM_ID_LENGTH,
  createRoomId,
  inviteUrl,
  normalizeRoomId,
  roomIdFromUrl,
  withoutRoom,
} from './room'

describe('createRoomId', () => {
  it('produces a code of the advertised length', () => {
    expect(createRoomId(1).roomId).toHaveLength(ROOM_ID_LENGTH)
  })

  it('is deterministic for a given seed, so a match replays from one number', () => {
    expect(createRoomId(42).roomId).toBe(createRoomId(42).roomId)
  })

  it('advances the seed so the next draw differs', () => {
    const first = createRoomId(7)
    expect(createRoomId(first.seed).roomId).not.toBe(first.roomId)
  })

  it('never emits glyphs that are ambiguous when read aloud', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(createRoomId(seed).roomId).not.toMatch(/[IO01]/)
    }
  })
})

describe('normalizeRoomId', () => {
  it('accepts a code typed in lowercase with stray spaces', () => {
    expect(normalizeRoomId('  abc234  ')).toBe('ABC234')
  })

  it('rejects a code of the wrong length', () => {
    expect(normalizeRoomId('ABC23')).toBeNull()
    expect(normalizeRoomId('ABC2345')).toBeNull()
  })

  it('rejects characters outside the alphabet', () => {
    expect(normalizeRoomId('ABC-23')).toBeNull()
    expect(normalizeRoomId('ABCI23')).toBeNull()
  })
})

describe('inviteUrl', () => {
  it('puts the room in the fragment, keeping the sub-path it is served from', () => {
    expect(inviteUrl('ABC234', 'https://user.github.io/snake-game/')).toBe(
      'https://user.github.io/snake-game/#room=ABC234',
    )
  })

  it('works unchanged on a localhost root', () => {
    expect(inviteUrl('ABC234', 'http://localhost:5173/')).toBe('http://localhost:5173/#room=ABC234')
  })

  it('replaces a room already in the link instead of appending a second one', () => {
    const url = inviteUrl('ZZZ999', 'https://user.github.io/snake-game/#room=ABC234')
    expect(url).toBe('https://user.github.io/snake-game/#room=ZZZ999')
  })

  it('drops a stale query string so the link is the fragment form only', () => {
    expect(inviteUrl('ABC234', 'https://user.github.io/snake-game/?room=OLD999')).toBe(
      'https://user.github.io/snake-game/#room=ABC234',
    )
  })
})

describe('withoutRoom', () => {
  it('strips the fragment entirely when the room was all it held', () => {
    expect(withoutRoom('https://user.github.io/snake-game/#room=ABC234')).toBe(
      'https://user.github.io/snake-game/',
    )
  })

  it('leaves a link that never had a room alone', () => {
    expect(withoutRoom('http://localhost:5173/')).toBe('http://localhost:5173/')
  })

  it('round-trips against inviteUrl', () => {
    const base = 'https://user.github.io/snake-game/'
    expect(withoutRoom(inviteUrl('ABC234', base))).toBe(base)
  })
})

describe('roomIdFromUrl', () => {
  it('returns null for a plain visit', () => {
    expect(roomIdFromUrl('https://user.github.io/snake-game/')).toBeNull()
  })

  it('reads the room out of an invite link', () => {
    expect(roomIdFromUrl('https://user.github.io/snake-game/#room=ABC234')).toBe('ABC234')
  })

  it('normalizes a hand-typed link', () => {
    expect(roomIdFromUrl('http://localhost:5173/#room=abc234')).toBe('ABC234')
  })

  it('treats a malformed room as no room at all', () => {
    expect(roomIdFromUrl('http://localhost:5173/#room=nope')).toBeNull()
  })

  it('ignores a room left in the query string, which is no longer the format', () => {
    expect(roomIdFromUrl('http://localhost:5173/?room=ABC234')).toBeNull()
  })

  it('round-trips a generated code through its own invite link', () => {
    const { roomId } = createRoomId(99)
    expect(roomIdFromUrl(inviteUrl(roomId, 'http://localhost:5173/'))).toBe(roomId)
  })
})

import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, PROTOCOL_VERSION, parseMessage, sanitizeName } from './protocol'
import type { NetMessage } from './protocol'
import type { GameState, Snake } from '../game/types'

const SNAKE: Snake = {
  id: 'p1',
  name: 'Ada',
  color: '#3fb950',
  body: [
    { x: 8, y: 4 },
    { x: 7, y: 4 },
  ],
  dir: 'right',
  alive: true,
  score: 3,
}

const STATE: GameState = {
  tick: 12,
  status: 'playing',
  players: [SNAKE],
  food: [{ x: 2, y: 9 }],
  rngSeed: 99,
  winnerId: null,
}

/** Messages cross a data channel, so parse what a channel would hand back. */
function overTheWire(message: NetMessage): NetMessage | null {
  return parseMessage(structuredClone(message))
}

describe('sanitizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeName('  Ada   Lovelace ')).toBe('Ada Lovelace')
  })

  it('truncates a name too long to sit in a roster row', () => {
    expect(sanitizeName('x'.repeat(200))).toHaveLength(MAX_NAME_LENGTH)
  })

  it('reduces a blank name to empty so the host can number the seat', () => {
    expect(sanitizeName('   ')).toBe('')
  })
})

describe('parseMessage', () => {
  it('round-trips every message in the union', () => {
    const messages: NetMessage[] = [
      { type: 'hello', version: PROTOCOL_VERSION, name: 'Ada' },
      {
        type: 'welcome',
        version: PROTOCOL_VERSION,
        selfId: 'p2',
        roster: [{ id: 'p1', name: 'Ada', color: '#3fb950', isHost: true }],
      },
      { type: 'reject', version: PROTOCOL_VERSION, reason: 'full' },
      { type: 'roster', roster: [{ id: 'p1', name: 'Ada', color: '#3fb950', isHost: true }] },
      { type: 'input', dir: 'left' },
      { type: 'state', state: STATE },
    ]

    for (const message of messages) {
      expect(overTheWire(message)).toEqual(message)
    }
  })

  it('rejects anything that is not a message object', () => {
    for (const raw of [null, undefined, 7, 'hello', [], [{ type: 'input', dir: 'up' }]]) {
      expect(parseMessage(raw)).toBeNull()
    }
  })

  it('rejects a type it does not know', () => {
    expect(parseMessage({ type: 'shutdown' })).toBeNull()
  })

  it('rejects a message missing a field', () => {
    expect(parseMessage({ type: 'hello', version: PROTOCOL_VERSION })).toBeNull()
    expect(parseMessage({ type: 'welcome', version: PROTOCOL_VERSION, selfId: 'p2' })).toBeNull()
    expect(parseMessage({ type: 'input' })).toBeNull()
  })

  it('rejects a field of the wrong type', () => {
    expect(parseMessage({ type: 'hello', version: '1', name: 'Ada' })).toBeNull()
    expect(parseMessage({ type: 'hello', version: 1.5, name: 'Ada' })).toBeNull()
    expect(parseMessage({ type: 'roster', roster: 'everyone' })).toBeNull()
  })

  it('rejects a direction outside the four the game understands', () => {
    expect(parseMessage({ type: 'input', dir: 'diagonal' })).toBeNull()
    expect(parseMessage({ type: 'input', dir: 'toString' })).toBeNull()
  })

  it('rejects a reject reason it cannot act on', () => {
    expect(parseMessage({ type: 'reject', version: 1, reason: 'because' })).toBeNull()
  })

  it('keeps a version mismatch parseable so the host can answer it', () => {
    // A hello from a stale bundle has to survive parsing; refusing to decode it
    // would look identical to a garbage frame, and the joiner would just hang.
    expect(parseMessage({ type: 'hello', version: 99, name: 'Ada' })).toEqual({
      type: 'hello',
      version: 99,
      name: 'Ada',
    })
  })

  it('sanitizes a name arriving off the wire, not just one typed locally', () => {
    const parsed = parseMessage({ type: 'hello', version: 1, name: `  ${'z'.repeat(50)}  ` })
    expect(parsed).toEqual({ type: 'hello', version: 1, name: 'z'.repeat(MAX_NAME_LENGTH) })
  })

  it('rejects a roster entry with a malformed member', () => {
    const roster = [{ id: 'p1', name: 'Ada', color: '#3fb950', isHost: 'yes' }]
    expect(parseMessage({ type: 'roster', roster })).toBeNull()
  })

  describe('state frames', () => {
    it('accepts a finished match with a winner', () => {
      const over: GameState = { ...STATE, status: 'over', winnerId: 'p1' }
      expect(overTheWire({ type: 'state', state: over })).toEqual({ type: 'state', state: over })
    })

    it('rejects a winnerId that is neither a player id nor null', () => {
      // asString() would fold this into null, which is a legal winnerId — the
      // frame would parse as "nobody won" instead of being thrown out.
      expect(parseMessage({ type: 'state', state: { ...STATE, winnerId: 42 } })).toBeNull()
    })

    it('rejects a status the renderer has no branch for', () => {
      expect(parseMessage({ type: 'state', state: { ...STATE, status: 'paused' } })).toBeNull()
    })

    it('rejects a snake with an empty body', () => {
      const players = [{ ...SNAKE, body: [] }]
      expect(parseMessage({ type: 'state', state: { ...STATE, players } })).toBeNull()
    })

    it('rejects a body cell that is not a whole grid coordinate', () => {
      const players = [{ ...SNAKE, body: [{ x: 1.5, y: 4 }] }]
      expect(parseMessage({ type: 'state', state: { ...STATE, players } })).toBeNull()
    })

    it('rejects food that is not an array of cells', () => {
      expect(parseMessage({ type: 'state', state: { ...STATE, food: [{ x: 1 }] } })).toBeNull()
    })
  })
})

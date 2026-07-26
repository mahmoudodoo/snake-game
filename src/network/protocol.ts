import { DELTA } from '../game/grid'
import type { Direction, GameState, GameStatus, PlayerId, Snake, Vec2 } from '../game/types'

/**
 * Bumped whenever a wire message changes shape.
 *
 * The host rejects a `hello` carrying a different version. This is not optional
 * on GitHub Pages: browser caching guarantees that some player eventually joins
 * on a stale bundle, and the failure mode without a handshake is a silent desync.
 */
export const PROTOCOL_VERSION = 1

/** Names are rendered in the roster, so cap them before they reach the DOM. */
export const MAX_NAME_LENGTH = 16

export type RejectReason = 'version' | 'full'

export interface RosterEntry {
  readonly id: PlayerId
  readonly name: string
  readonly color: string
  readonly isHost: boolean
}

/** Client → host, first message on a fresh connection. */
export interface HelloMessage {
  readonly type: 'hello'
  readonly version: number
  readonly name: string
}

/** Host → client, the seat assignment. */
export interface WelcomeMessage {
  readonly type: 'welcome'
  readonly version: number
  readonly selfId: PlayerId
  readonly roster: readonly RosterEntry[]
}

/** Host → client, sent instead of a welcome. The connection closes after it. */
export interface RejectMessage {
  readonly type: 'reject'
  readonly version: number
  readonly reason: RejectReason
}

/** Host → clients, whenever someone joins or leaves. */
export interface RosterMessage {
  readonly type: 'roster'
  readonly roster: readonly RosterEntry[]
}

/** Client → host. Clients send inputs only; the host owns the simulation. */
export interface InputMessage {
  readonly type: 'input'
  readonly dir: Direction
}

/** Host → clients, the authoritative snapshot. */
export interface StateMessage {
  readonly type: 'state'
  readonly state: GameState
}

export type NetMessage =
  | HelloMessage
  | WelcomeMessage
  | RejectMessage
  | RosterMessage
  | InputMessage
  | StateMessage

/**
 * Trims a name to something safe to seat and render. Returns '' for anything
 * blank so the host can fall back to a slot-numbered default.
 */
export function sanitizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asDirection(value: unknown): Direction | null {
  /* hasOwn, not `in`: `in` walks the prototype chain, so 'toString' and
     'constructor' would both pass for a direction and reach the simulation. */
  return typeof value === 'string' && Object.hasOwn(DELTA, value) ? (value as Direction) : null
}

function asStatus(value: unknown): GameStatus | null {
  return value === 'playing' || value === 'over' ? value : null
}

/** All-or-nothing: one bad element rejects the whole array. */
function asArrayOf<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const parsed: T[] = []
  for (const item of value) {
    const next = parse(item)
    if (next === null) return null
    parsed.push(next)
  }
  return parsed
}

function asVec2(value: unknown): Vec2 | null {
  if (!isRecord(value)) return null
  const x = asInt(value['x'])
  const y = asInt(value['y'])
  return x === null || y === null ? null : { x, y }
}

function asRosterEntry(value: unknown): RosterEntry | null {
  if (!isRecord(value)) return null
  const id = asString(value['id'])
  const name = asString(value['name'])
  const color = asString(value['color'])
  const isHost = asBoolean(value['isHost'])
  if (id === null || name === null || color === null || isHost === null) return null
  return { id, name: sanitizeName(name), color, isHost }
}

function asSnake(value: unknown): Snake | null {
  if (!isRecord(value)) return null
  const id = asString(value['id'])
  const name = asString(value['name'])
  const color = asString(value['color'])
  const body = asArrayOf(value['body'], asVec2)
  const dir = asDirection(value['dir'])
  const alive = asBoolean(value['alive'])
  const score = asInt(value['score'])
  if (id === null || name === null || color === null) return null
  if (body === null || body.length === 0 || dir === null || alive === null || score === null) {
    return null
  }
  return { id, name: sanitizeName(name), color, body, dir, alive, score }
}

function asGameState(value: unknown): GameState | null {
  if (!isRecord(value)) return null
  const tick = asInt(value['tick'])
  const status = asStatus(value['status'])
  const players = asArrayOf(value['players'], asSnake)
  const food = asArrayOf(value['food'], asVec2)
  const rngSeed = asInt(value['rngSeed'])
  /* Not asString(): it collapses "absent" and "wrong type" into null, which is
     itself a legal winnerId, so a bogus value would parse as "nobody won". */
  const winnerId = value['winnerId']
  if (tick === null || status === null || players === null || food === null) return null
  if (rngSeed === null || (winnerId !== null && typeof winnerId !== 'string')) return null
  return { tick, status, players, food, rngSeed, winnerId }
}

/**
 * Decodes an inbound frame, or null if it is not a message we recognise.
 *
 * Everything arriving over a data channel is untrusted — a peer can send any
 * shape at all — so the wire boundary is where structure gets proven rather
 * than asserted. Callers get a real `NetMessage` or nothing.
 */
export function parseMessage(raw: unknown): NetMessage | null {
  if (!isRecord(raw)) return null

  switch (raw['type']) {
    case 'hello': {
      const version = asInt(raw['version'])
      const name = asString(raw['name'])
      return version === null || name === null
        ? null
        : { type: 'hello', version, name: sanitizeName(name) }
    }
    case 'welcome': {
      const version = asInt(raw['version'])
      const selfId = asString(raw['selfId'])
      const roster = asArrayOf(raw['roster'], asRosterEntry)
      return version === null || selfId === null || roster === null
        ? null
        : { type: 'welcome', version, selfId, roster }
    }
    case 'reject': {
      const version = asInt(raw['version'])
      const reason = raw['reason']
      return version === null || (reason !== 'version' && reason !== 'full')
        ? null
        : { type: 'reject', version, reason }
    }
    case 'roster': {
      const roster = asArrayOf(raw['roster'], asRosterEntry)
      return roster === null ? null : { type: 'roster', roster }
    }
    case 'input': {
      const dir = asDirection(raw['dir'])
      return dir === null ? null : { type: 'input', dir }
    }
    case 'state': {
      const state = asGameState(raw['state'])
      return state === null ? null : { type: 'state', state }
    }
    default:
      return null
  }
}

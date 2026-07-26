import { randomInt } from '../game/rng'

/**
 * Room codes are read aloud and re-typed, so the alphabet drops the glyphs that
 * get confused in a sans-serif font: I/1, O/0, and lowercase entirely.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const ROOM_ID_LENGTH = 6

/** Key carrying the room inside the URL fragment. */
export const ROOM_PARAM = 'room'

/** Reads the fragment as `key=value` pairs, so it can carry more than the room later. */
function hashParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.replace(/^#/, ''))
}

export interface RoomIdResult {
  readonly roomId: string
  /** Threaded forward, like every other draw from the seeded RNG. */
  readonly seed: number
}

export function createRoomId(seed: number): RoomIdResult {
  let next = seed
  let roomId = ''

  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    const draw = randomInt(next, ALPHABET.length)
    next = draw.seed
    roomId += ALPHABET[draw.value] ?? ''
  }

  return { roomId, seed: next }
}

/** Accepts what a player might paste or retype; rejects anything else. */
export function normalizeRoomId(value: string): string | null {
  const candidate = value.trim().toUpperCase()
  if (candidate.length !== ROOM_ID_LENGTH) return null
  for (const char of candidate) {
    if (!ALPHABET.includes(char)) return null
  }
  return candidate
}

/**
 * Builds the invite link from the page's own URL rather than a constant.
 *
 * The app is served from a sub-path on Project Pages and from the root on
 * localhost; deriving the link keeps both working and keeps the deployed origin
 * out of the bundle.
 *
 * The room rides in the fragment, not the query string. A fragment is never sent
 * to the server, so on static hosting it cannot 404 against a path that does not
 * exist, it stays out of Pages access logs and Referer headers — and the room
 * code is the only thing guarding a room — and editing it in place does not
 * reload the page.
 */
export function inviteUrl(roomId: string, pageUrl: string): string {
  const url = new URL(pageUrl)
  url.search = ''
  const params = new URLSearchParams()
  params.set(ROOM_PARAM, roomId)
  url.hash = params.toString()
  return url.toString()
}

/** The same link with the room stripped, for when a player leaves. */
export function withoutRoom(pageUrl: string): string {
  const url = new URL(pageUrl)
  const params = hashParams(url)
  params.delete(ROOM_PARAM)
  url.hash = params.toString()
  return url.toString()
}

/** Reads the room a player arrived with, or null for a normal visit. */
export function roomIdFromUrl(pageUrl: string): string | null {
  const raw = hashParams(new URL(pageUrl)).get(ROOM_PARAM)
  return raw === null ? null : normalizeRoomId(raw)
}

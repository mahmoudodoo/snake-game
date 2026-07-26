export interface RngResult {
  readonly value: number
  readonly seed: number
}

/**
 * mulberry32, written as a pure step rather than a stateful closure.
 *
 * Every caller threads the returned seed forward, which keeps `step()` free of
 * hidden state: the same seed and the same inputs always produce the same match.
 * That is what makes food spawns testable and host migration resumable.
 */
export function nextRandom(seed: number): RngResult {
  const next = (seed + 0x6d2b79f5) | 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, seed: next }
}

/** Uniform integer in [0, maxExclusive). */
export function randomInt(seed: number, maxExclusive: number): RngResult {
  const result = nextRandom(seed)
  return { value: Math.floor(result.value * maxExclusive), seed: result.seed }
}

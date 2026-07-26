import { TICK_INTERVAL_MIN_MS, TICK_INTERVAL_START_MS, TICK_INTERVAL_STEP_MS } from './constants'

/**
 * Milliseconds per simulation tick at a given score.
 *
 * Derived, never stored: difficulty is a pure function of progress, so the host
 * and every client agree on the current speed without syncing another field.
 */
export function tickIntervalForScore(score: number): number {
  const interval = TICK_INTERVAL_START_MS - score * TICK_INTERVAL_STEP_MS
  return Math.max(TICK_INTERVAL_MIN_MS, interval)
}

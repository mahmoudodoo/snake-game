import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLoop } from './loop'
import type { GameLoop } from './loop'

/**
 * Hand-cranked clock. The loop reads time from performance.now() and schedules
 * through requestAnimationFrame, so driving both by hand makes a fixed-timestep
 * assertion exact instead of flaky.
 */
let now = 0
let pending: ((time: number) => void) | undefined

function advance(ms: number): void {
  now += ms
  const frame = pending
  pending = undefined
  frame?.(now)
}

beforeEach(() => {
  now = 0
  pending = undefined
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    pending = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = undefined
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

interface Harness {
  readonly loop: GameLoop
  readonly ticks: () => number
  readonly alphas: () => readonly number[]
}

function harness(interval: number | (() => number)): Harness {
  let ticks = 0
  const alphas: number[] = []
  const loop = createLoop({
    tickInterval: typeof interval === 'function' ? interval : () => interval,
    onTick: () => {
      ticks += 1
    },
    onRender: (alpha) => {
      alphas.push(alpha)
    },
  })
  return { loop, ticks: () => ticks, alphas: () => alphas }
}

describe('createLoop', () => {
  it('is not running until started', () => {
    const { loop, ticks } = harness(100)
    expect(loop.running).toBe(false)
    advance(1000)
    expect(ticks()).toBe(0)
  })

  it('renders every frame but only ticks once a full interval has elapsed', () => {
    const { loop, ticks, alphas } = harness(100)
    loop.start()
    expect(loop.running).toBe(true)

    advance(60)
    expect(ticks()).toBe(0)
    expect(alphas()).toHaveLength(1)

    advance(60) // 120ms total — one interval crossed
    expect(ticks()).toBe(1)
    expect(alphas()).toHaveLength(2)
  })

  it('keeps the leftover time instead of dropping it', () => {
    const { loop, ticks, alphas } = harness(100)
    loop.start()

    advance(150)
    expect(ticks()).toBe(1)
    expect(alphas().at(-1)).toBeCloseTo(0.5) // 50ms of the next tick banked

    advance(50) // the banked 50ms completes a second interval
    expect(ticks()).toBe(2)
  })

  it('catches up with several ticks in one long frame', () => {
    const { loop, ticks } = harness(50)
    loop.start()
    advance(210)
    expect(ticks()).toBe(4)
  })

  it('clamps a backgrounded tab instead of replaying the whole gap', () => {
    const { loop, ticks } = harness(100)
    loop.start()
    advance(60_000)
    expect(ticks()).toBe(2) // 250ms of credit, not 60s
  })

  it('re-reads the interval each frame so difficulty can ramp mid-game', () => {
    let interval = 100
    const { loop, ticks } = harness(() => interval)
    loop.start()

    advance(100)
    expect(ticks()).toBe(1)

    interval = 25
    advance(100)
    expect(ticks()).toBe(5)
  })

  it('stops ticking after stop()', () => {
    const { loop, ticks } = harness(100)
    loop.start()
    advance(100)
    loop.stop()

    expect(loop.running).toBe(false)
    advance(1000)
    expect(ticks()).toBe(1)
  })

  it('ignores a second start() rather than double-scheduling', () => {
    const { loop, ticks } = harness(100)
    loop.start()
    loop.start()
    advance(100)
    expect(ticks()).toBe(1)
  })

  it('restarts cleanly without replaying the time it was stopped for', () => {
    const { loop, ticks } = harness(100)
    loop.start()
    loop.stop()

    now += 10_000 // paused for ten seconds
    loop.start()
    advance(10)

    expect(ticks()).toBe(0)
  })
})

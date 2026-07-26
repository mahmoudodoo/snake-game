/** Clamps a frame gap so a backgrounded tab doesn't replay hundreds of ticks at once. */
const MAX_FRAME_MS = 250

export interface LoopOptions {
  /** Read fresh each frame, so the difficulty ramp takes effect mid-game. */
  readonly tickInterval: () => number
  readonly onTick: () => void
  /** alpha is the fraction of a tick elapsed — use it to interpolate. */
  readonly onRender: (alpha: number) => void
}

export interface GameLoop {
  start(): void
  stop(): void
  readonly running: boolean
}

/**
 * Fixed-timestep simulation driven by a variable-rate render clock.
 *
 * Two clocks on purpose: rendering runs at display rate while the simulation
 * advances in fixed increments, so game speed never depends on frame rate.
 */
export function createLoop({ tickInterval, onTick, onRender }: LoopOptions): GameLoop {
  let handle = 0
  let last = 0
  let accumulator = 0
  let running = false

  const frame = (now: number): void => {
    if (!running) return

    accumulator += Math.min(now - last, MAX_FRAME_MS)
    last = now

    const interval = tickInterval()
    while (accumulator >= interval) {
      onTick()
      accumulator -= interval
    }

    onRender(accumulator / interval)
    handle = requestAnimationFrame(frame)
  }

  return {
    start(): void {
      if (running) return
      running = true
      last = performance.now()
      accumulator = 0
      handle = requestAnimationFrame(frame)
    },
    stop(): void {
      running = false
      cancelAnimationFrame(handle)
    },
    get running(): boolean {
      return running
    },
  }
}

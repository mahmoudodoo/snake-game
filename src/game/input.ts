import type { Direction } from './types'

const KEY_MAP: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

export interface InputSource {
  /** Returns the direction requested since the last call, then clears it. */
  drain(): Direction | undefined
  /** Fires when the player presses the restart key. */
  onRestart(handler: () => void): void
  detach(): void
}

/** Travel before a drag counts as a swipe, in CSS pixels. */
export const SWIPE_THRESHOLD = 24

/**
 * Swipe-to-steer for touch devices.
 *
 * Reads on move rather than on release, and re-anchors after every turn, so a
 * player can trace a path with one continuous drag instead of lifting a thumb
 * between turns. Waiting for touchend costs a turn per gesture, which at seven
 * ticks a second is the difference between playable and not.
 */
export function attachSwipe(surface: HTMLElement, threshold = SWIPE_THRESHOLD): InputSource {
  let pending: Direction | undefined
  let anchorX = 0
  let anchorY = 0
  let tracking = false

  const onStart = (event: TouchEvent): void => {
    const touch = event.touches[0]
    if (touch === undefined) return
    anchorX = touch.clientX
    anchorY = touch.clientY
    tracking = true
  }

  const onMove = (event: TouchEvent): void => {
    const touch = event.touches[0]
    if (!tracking || touch === undefined) return
    // Without this the page scrolls (or pull-to-refresh fires) under the board.
    event.preventDefault()

    const dx = touch.clientX - anchorX
    const dy = touch.clientY - anchorY
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return

    // Dominant axis wins, so a slightly diagonal swipe still reads cleanly.
    pending = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    anchorX = touch.clientX
    anchorY = touch.clientY
  }

  const onEnd = (): void => {
    tracking = false
  }

  surface.addEventListener('touchstart', onStart, { passive: true })
  surface.addEventListener('touchmove', onMove, { passive: false })
  surface.addEventListener('touchend', onEnd, { passive: true })
  surface.addEventListener('touchcancel', onEnd, { passive: true })

  return {
    drain(): Direction | undefined {
      const next = pending
      pending = undefined
      return next
    },
    onRestart(): void {
      // Touch players restart with the button in the game-over dialog.
    },
    detach(): void {
      surface.removeEventListener('touchstart', onStart)
      surface.removeEventListener('touchmove', onMove)
      surface.removeEventListener('touchend', onEnd)
      surface.removeEventListener('touchcancel', onEnd)
    },
  }
}

/**
 * Presents several input surfaces as one.
 *
 * Every source is drained on each call rather than stopping at the first hit,
 * so an untouched surface cannot hold a stale direction and replay it later.
 * A tablet with a keyboard gets both, live, with no mode to choose.
 */
export function combineInputs(...sources: readonly InputSource[]): InputSource {
  return {
    drain(): Direction | undefined {
      let latest: Direction | undefined
      for (const source of sources) {
        const next = source.drain()
        if (next !== undefined) latest = next
      }
      return latest
    },
    onRestart(handler: () => void): void {
      for (const source of sources) source.onRestart(handler)
    },
    detach(): void {
      for (const source of sources) source.detach()
    },
  }
}

/**
 * Keeps only the most recent direction per tick.
 *
 * Queueing every keypress feels responsive but plays worse: a buffered turn
 * applies a tick late, against a heading the player can no longer see.
 */
export function attachKeyboard(target: Window = window): InputSource {
  let pending: Direction | undefined
  let restartHandler: (() => void) | undefined

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      restartHandler?.()
      return
    }

    const direction = KEY_MAP[event.key]
    if (direction === undefined) return
    event.preventDefault() // stop arrow keys scrolling the page
    pending = direction
  }

  target.addEventListener('keydown', onKeyDown)

  return {
    drain(): Direction | undefined {
      const next = pending
      pending = undefined
      return next
    },
    onRestart(handler: () => void): void {
      restartHandler = handler
    },
    detach(): void {
      target.removeEventListener('keydown', onKeyDown)
    },
  }
}

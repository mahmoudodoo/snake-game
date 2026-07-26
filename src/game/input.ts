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

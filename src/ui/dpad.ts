import type { InputSource } from '../game/input'
import type { Direction } from '../game/types'

interface PadButton {
  readonly dir: Direction
  readonly glyph: string
  readonly label: string
}

const BUTTONS: readonly PadButton[] = [
  { dir: 'up', glyph: '▲', label: 'Steer up' },
  { dir: 'left', glyph: '◀', label: 'Steer left' },
  { dir: 'down', glyph: '▼', label: 'Steer down' },
  { dir: 'right', glyph: '▶', label: 'Steer right' },
]

/**
 * On-screen direction pad, as a second touch option alongside swipe.
 *
 * Swipe is faster once it clicks, but it is imprecise in a tight corner and
 * invisible to a player who has never met it. Buttons are discoverable and
 * exact; offering both costs one small element and suits either preference.
 */
export function createDpad(root: HTMLElement): InputSource {
  let pending: Direction | undefined
  const detachers: (() => void)[] = []

  const buttons = BUTTONS.map(({ dir, glyph, label }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `dpad__btn dpad__btn--${dir}`
    button.textContent = glyph
    button.setAttribute('aria-label', label)

    /* pointerdown, not click: steering should register the moment the thumb
       lands. click waits for release, which at this tick rate is a lost turn.
       preventDefault stops the press doubling as a scroll or a focus change. */
    const onDown = (event: PointerEvent): void => {
      event.preventDefault()
      pending = dir
    }

    button.addEventListener('pointerdown', onDown)
    detachers.push(() => button.removeEventListener('pointerdown', onDown))
    return button
  })

  root.replaceChildren(...buttons)
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', 'Direction pad')

  return {
    drain(): Direction | undefined {
      const next = pending
      pending = undefined
      return next
    },
    onRestart(): void {
      // Restarting is the game-over dialog's job; the pad only steers.
    },
    detach(): void {
      for (const detacher of detachers) detacher()
      root.replaceChildren()
    },
  }
}

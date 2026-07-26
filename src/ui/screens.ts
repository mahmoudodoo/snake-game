export type ScreenName = 'lobby' | 'game'

export interface Screens {
  show(name: ScreenName): void
  current(): ScreenName
}

/**
 * One screen visible at a time, switched with the `hidden` attribute.
 *
 * `hidden` rather than a CSS class on purpose: it takes the offscreen screen out
 * of the accessibility tree and out of tab order in one step, so a screen reader
 * never lands on the lobby's buttons while a match is running.
 */
export function createScreens(elements: Readonly<Record<ScreenName, HTMLElement>>): Screens {
  let active: ScreenName = 'lobby'

  const apply = (): void => {
    for (const [name, element] of Object.entries(elements)) {
      element.hidden = name !== active
    }
  }

  apply()

  return {
    show(name: ScreenName): void {
      if (name === active) return
      active = name
      apply()
    },
    current(): ScreenName {
      return active
    },
  }
}

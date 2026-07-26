import type { GameState, PlayerId, Snake } from '../game/types'

export interface Hud {
  update(state: GameState, tickInterval: number): void
}

/**
 * Score and status live in the DOM rather than on the canvas: screen readers can
 * reach them, and text stays selectable and crisp at any zoom level.
 *
 * `youId` is what makes the score yours in a match — showing the table leader
 * where your own score belongs is the kind of thing you only notice when losing.
 */
export function createHud(root: HTMLElement, youId: PlayerId | null = null): Hud {
  const score = document.createElement('span')
  score.className = 'hud__score'

  const leader = document.createElement('span')
  leader.className = 'hud__leader'

  const speed = document.createElement('span')
  speed.className = 'hud__speed'

  /* A visible gap separates these on screen, but the live region is read as one
     string — without a separator "Score 0" and "7 ticks/s" are announced as
     "Score 07 ticks/s". The bullets are the separators, so they must be real
     text, and they must empty out with the part they precede. */
  const separators = [1, 2].map(() => {
    const element = document.createElement('span')
    element.className = 'hud__sep'
    return element
  })
  const [leaderSep, speedSep] = separators as [HTMLElement, HTMLElement]

  const setPart = (element: HTMLElement, separator: HTMLElement, text: string): void => {
    element.textContent = text
    element.hidden = text === ''
    separator.textContent = text === '' ? '' : '·'
    separator.hidden = text === ''
  }

  root.replaceChildren(score, leaderSep, leader, speedSep, speed)
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')

  return {
    update(state: GameState, tickInterval: number): void {
      const you = state.players.find((player) => player.id === youId)
      const best = state.players.reduce<Snake | null>(
        (top, player) => (top === null || player.score > top.score ? player : top),
        null,
      )

      score.textContent = `Score ${you?.score ?? best?.score ?? 0}`

      // Only worth the space when someone else is ahead of you.
      const showLeader = state.players.length > 1 && best !== null && best.id !== you?.id
      setPart(leader, leaderSep, showLeader && best ? `Leader ${best.name} ${best.score}` : '')
      setPart(speed, speedSep, `${Math.round(1000 / tickInterval)} ticks/s`)
    },
  }
}

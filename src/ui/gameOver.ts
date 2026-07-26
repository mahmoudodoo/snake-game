import type { GameState, PlayerId } from '../game/types'
import { createPlayerList, toPlayerRows } from './playerList'

export interface GameOverHandlers {
  readonly onPlayAgain: () => void
  readonly onBackToLobby: () => void
}

export interface GameOver {
  update(state: GameState, youId: PlayerId | null): void
}

/** Who won, said from the reader's point of view. */
export function headlineFor(state: GameState, youId: PlayerId | null): string {
  if (state.players.length <= 1) return 'Game over'

  const winner = state.players.find((player) => player.id === state.winnerId)
  if (!winner) return 'Nobody survived'
  return winner.id === youId ? 'You win' : `${winner.name} wins`
}

function scoreLineFor(state: GameState, youId: PlayerId | null): string {
  const you = state.players.find((player) => player.id === youId)
  const best = state.players.reduce((top, player) => Math.max(top, player.score), 0)
  return you ? `You scored ${you.score}` : `Top score ${best}`
}

/**
 * End-of-match panel, in the DOM rather than painted on the canvas.
 *
 * Canvas text is invisible to screen readers and unclickable, and the buttons
 * here are the primary way out of a finished match — so the overlay is a real
 * dialog that takes focus when it opens.
 */
export function createGameOver(root: HTMLElement, handlers: GameOverHandlers): GameOver {
  const headline = document.createElement('h2')
  headline.className = 'over__headline'
  headline.id = 'game-over-headline'

  const summary = document.createElement('p')
  summary.className = 'over__summary'

  const standingsRoot = document.createElement('div')
  standingsRoot.className = 'players over__standings'
  const standings = createPlayerList(standingsRoot, 'Final standings')

  const again = document.createElement('button')
  again.type = 'button'
  again.className = 'btn btn--primary'
  again.textContent = 'Play again'
  again.addEventListener('click', () => {
    handlers.onPlayAgain()
  })

  const lobby = document.createElement('button')
  lobby.type = 'button'
  lobby.className = 'btn btn--ghost'
  lobby.textContent = 'Back to lobby'
  lobby.addEventListener('click', () => {
    handlers.onBackToLobby()
  })

  const actions = document.createElement('div')
  actions.className = 'over__actions'
  actions.append(again, lobby)

  const hint = document.createElement('p')
  hint.className = 'over__hint'
  hint.textContent = 'or press Space'

  root.replaceChildren(headline, summary, standingsRoot, actions, hint)
  root.className = 'over'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', headline.id)

  // Focus moves once per match end, not on every update: re-focusing each tick
  // would fight anyone tabbing to "Back to lobby".
  let shown = false

  return {
    update(state: GameState, youId: PlayerId | null): void {
      if (state.status !== 'over') {
        root.hidden = true
        shown = false
        return
      }

      headline.textContent = headlineFor(state, youId)
      summary.textContent = scoreLineFor(state, youId)

      const rows = toPlayerRows(state, youId)
      standings.update(rows)
      // A solo run has no standings worth a table — the summary already said it.
      standingsRoot.hidden = rows.length <= 1

      root.hidden = false
      if (!shown) {
        shown = true
        again.focus()
      }
    },
  }
}

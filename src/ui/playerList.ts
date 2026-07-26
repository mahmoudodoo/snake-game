import { MAX_PLAYERS } from '../game/constants'
import type { GameState, PlayerId } from '../game/types'

export interface PlayerRow {
  readonly id: PlayerId
  readonly name: string
  readonly color: string
  /** null in the lobby, where nobody has a score yet. */
  readonly score: number | null
  readonly alive: boolean
  readonly isHost: boolean
  readonly isYou: boolean
}

export interface PlayerList {
  update(rows: readonly PlayerRow[]): void
}

interface Row {
  readonly item: HTMLLIElement
  readonly name: HTMLElement
  readonly badge: HTMLElement
  readonly score: HTMLElement
}

function createRow(color: string): Row {
  const item = document.createElement('li')
  item.className = 'player'

  const swatch = document.createElement('span')
  swatch.className = 'player__swatch'
  swatch.style.background = color
  swatch.setAttribute('aria-hidden', 'true') // decorative; the name carries the identity

  const name = document.createElement('span')
  name.className = 'player__name'

  const badge = document.createElement('span')
  badge.className = 'player__badge'

  const score = document.createElement('span')
  score.className = 'player__score'

  item.append(swatch, name, badge, score)
  return { item, name, badge, score }
}

function badgeFor(row: PlayerRow): string {
  if (!row.alive) return 'out'
  if (row.isHost && row.isYou) return 'you · host'
  if (row.isHost) return 'host'
  if (row.isYou) return 'you'
  return ''
}

/**
 * The roster, used by both the lobby and the in-game side panel.
 *
 * Rows are reconciled by player id rather than rebuilt: in a match this updates
 * on every tick, and replacing the nodes each time would restart the join/leave
 * transitions and churn the accessibility tree several times a second.
 */
export function createPlayerList(root: HTMLElement, label = 'Players'): PlayerList {
  const heading = document.createElement('h2')
  heading.className = 'players__title'
  heading.textContent = label

  const count = document.createElement('span')
  count.className = 'players__count'

  const header = document.createElement('div')
  header.className = 'players__header'
  header.append(heading, count)

  const list = document.createElement('ul')
  list.className = 'players__list'

  const empty = document.createElement('p')
  empty.className = 'players__empty'
  empty.textContent = 'Waiting for players to join…'

  root.replaceChildren(header, list, empty)

  /* Deliberately not a live region: scores change every tick, and announcing the
     whole roster that often would talk over the HUD, which is the live region. */
  const rows = new Map<PlayerId, Row>()

  return {
    update(next: readonly PlayerRow[]): void {
      count.textContent = `${next.length}/${MAX_PLAYERS}`
      empty.hidden = next.length > 0

      for (const [id, row] of rows) {
        if (!next.some((candidate) => candidate.id === id)) {
          row.item.remove()
          rows.delete(id)
        }
      }

      next.forEach((data, index) => {
        let row = rows.get(data.id)
        if (!row) {
          row = createRow(data.color)
          rows.set(data.id, row)
        }

        row.name.textContent = data.name
        row.badge.textContent = badgeFor(data)
        row.badge.hidden = row.badge.textContent === ''
        row.score.textContent = data.score === null ? '' : String(data.score)
        row.score.hidden = data.score === null
        row.item.classList.toggle('player--dead', !data.alive)
        row.item.classList.toggle('player--you', data.isYou)

        // Re-inserting a node already in place is a no-op, so this both appends
        // new rows and reorders the leaderboard as scores change.
        const atIndex = list.children[index] ?? null
        if (atIndex !== row.item) list.insertBefore(row.item, atIndex)
      })
    },
  }
}

/**
 * Match standings: living players first, then by score, then by name so the
 * order never depends on object identity.
 */
export function toPlayerRows(
  state: GameState,
  youId: PlayerId | null,
  hostId: PlayerId | null = null,
): PlayerRow[] {
  return state.players
    .map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      score: player.score,
      alive: player.alive,
      isHost: player.id === hostId,
      isYou: player.id === youId,
    }))
    .sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1
      if (a.score !== b.score) return b.score - a.score
      return a.name.localeCompare(b.name)
    })
}

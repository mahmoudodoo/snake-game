export interface Vec2 {
  readonly x: number
  readonly y: number
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export type PlayerId = string

export interface Snake {
  readonly id: PlayerId
  readonly name: string
  readonly color: string
  /** Head first, tail last. */
  readonly body: readonly Vec2[]
  readonly dir: Direction
  readonly alive: boolean
  readonly score: number
}

export type GameStatus = 'playing' | 'over'

export interface GameConfig {
  readonly cols: number
  readonly rows: number
  readonly foodCount: number
}

/** Direction requested by each player since the last tick. Absent = keep going. */
export type InputMap = Readonly<Partial<Record<PlayerId, Direction>>>

export interface GameState {
  readonly tick: number
  readonly status: GameStatus
  readonly players: readonly Snake[]
  readonly food: readonly Vec2[]
  /** Threaded through every spawn, so a whole match replays from one seed. */
  readonly rngSeed: number
  readonly winnerId: PlayerId | null
}

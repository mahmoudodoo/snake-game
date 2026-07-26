/** Board size in cells. The canvas element scales; the grid never changes. */
export const GRID_COLS = 32
export const GRID_ROWS = 24

/** Fixed-timestep bounds, in milliseconds per simulation tick. */
export const TICK_INTERVAL_START_MS = 150
export const TICK_INTERVAL_MIN_MS = 70
export const TICK_INTERVAL_STEP_MS = 6

/** Star topology: the host relays for everyone, so this caps host upstream too. */
export const MAX_PLAYERS = 6

/** Cells a snake occupies at spawn. */
export const START_LENGTH = 3

/** Per-player colours, assigned by join order. */
export const PLAYER_COLORS = ['#3fb950', '#58a6ff', '#d29922', '#f85149', '#bc8cff', '#39c5cf']

import type { GameConfig, GameState, Snake, Vec2 } from '../game/types'

export interface CanvasSize {
  readonly width: number
  readonly height: number
}

/**
 * Matches the canvas backing store to its CSS size times the device pixel ratio,
 * then scales the context so all drawing happens in CSS pixels.
 */
export function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): CanvasSize {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { width: rect.width, height: rect.height }
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

interface Cell {
  readonly w: number
  readonly h: number
}

function drawGrid(ctx: CanvasRenderingContext2D, size: CanvasSize, config: GameConfig, cell: Cell) {
  ctx.strokeStyle = cssVar('--grid', '#1f2630')
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let col = 1; col < config.cols; col++) {
    const x = Math.round(col * cell.w) + 0.5 // half-pixel keeps 1px lines crisp
    ctx.moveTo(x, 0)
    ctx.lineTo(x, size.height)
  }
  for (let row = 1; row < config.rows; row++) {
    const y = Math.round(row * cell.h) + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(size.width, y)
  }
  ctx.stroke()
}

function fillCell(ctx: CanvasRenderingContext2D, pos: Vec2, cell: Cell, inset: number): void {
  ctx.fillRect(
    pos.x * cell.w + inset,
    pos.y * cell.h + inset,
    cell.w - inset * 2,
    cell.h - inset * 2,
  )
}

function drawFood(ctx: CanvasRenderingContext2D, food: readonly Vec2[], cell: Cell): void {
  ctx.fillStyle = cssVar('--food', '#f85149')
  const radius = Math.min(cell.w, cell.h) * 0.3
  for (const item of food) {
    ctx.beginPath()
    ctx.arc((item.x + 0.5) * cell.w, (item.y + 0.5) * cell.h, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSnake(ctx: CanvasRenderingContext2D, snake: Snake, cell: Cell): void {
  ctx.globalAlpha = snake.alive ? 1 : 0.25
  ctx.fillStyle = snake.color

  for (let i = snake.body.length - 1; i >= 1; i--) {
    const segment = snake.body[i]
    if (segment) fillCell(ctx, segment, cell, 1.5)
  }

  // Head drawn last and brighter so it reads at a glance.
  const head = snake.body[0]
  if (head) {
    fillCell(ctx, head, cell, 0.5)
    ctx.fillStyle = cssVar('--bg', '#0e1116')
    fillCell(ctx, head, cell, Math.min(cell.w, cell.h) * 0.34)
  }

  ctx.globalAlpha = 1
}

/**
 * Dims the board behind the game-over dialog.
 *
 * The headline, standings and buttons are DOM (see ui/gameOver.ts) — canvas text
 * is unreachable by screen readers and unclickable — so all that is left here is
 * the scrim that pushes the board back visually.
 */
function drawScrim(ctx: CanvasRenderingContext2D, size: CanvasSize, state: GameState): void {
  if (state.status !== 'over') return
  ctx.fillStyle = 'rgba(14, 17, 22, 0.78)'
  ctx.fillRect(0, 0, size.width, size.height)
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  size: CanvasSize,
  state: GameState,
  config: GameConfig,
): void {
  const cell: Cell = { w: size.width / config.cols, h: size.height / config.rows }

  ctx.clearRect(0, 0, size.width, size.height)
  drawGrid(ctx, size, config, cell)
  drawFood(ctx, state.food, cell)
  for (const snake of state.players) drawSnake(ctx, snake, cell)
  drawScrim(ctx, size, state)
}

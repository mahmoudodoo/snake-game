// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachKeyboard } from './input'
import type { InputSource } from './input'
import type { Direction } from './types'

let attached: InputSource | undefined

function keyboard(): InputSource {
  attached = attachKeyboard(window)
  return attached
}

/** Returns the event afterwards so callers can assert on defaultPrevented. */
function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
  window.dispatchEvent(event)
  return event
}

afterEach(() => {
  attached?.detach()
  attached = undefined
})

describe('attachKeyboard', () => {
  it.each([
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
  ] as const)('maps %s to %s', (key, direction: Direction) => {
    const input = keyboard()
    press(key)
    expect(input.drain()).toBe(direction)
  })

  it.each([
    ['w', 'up'],
    ['s', 'down'],
    ['a', 'left'],
    ['d', 'right'],
  ] as const)('maps %s to %s', (key, direction: Direction) => {
    const input = keyboard()
    press(key)
    expect(input.drain()).toBe(direction)
  })

  it('reports nothing before any key is pressed', () => {
    expect(keyboard().drain()).toBeUndefined()
  })

  it('clears the pending direction once drained', () => {
    const input = keyboard()
    press('ArrowUp')
    expect(input.drain()).toBe('up')
    expect(input.drain()).toBeUndefined()
  })

  it('keeps only the last direction pressed within a tick', () => {
    const input = keyboard()
    press('ArrowUp')
    press('ArrowLeft')
    press('ArrowDown')
    expect(input.drain()).toBe('down')
    expect(input.drain()).toBeUndefined()
  })

  it('ignores keys it does not steer with', () => {
    const input = keyboard()
    const event = press('q')
    expect(input.drain()).toBeUndefined()
    expect(event.defaultPrevented).toBe(false)
  })

  it('swallows arrow keys so the page does not scroll', () => {
    keyboard()
    expect(press('ArrowDown').defaultPrevented).toBe(true)
  })

  it('fires the restart handler on Space and Enter', () => {
    const input = keyboard()
    const restart = vi.fn()
    input.onRestart(restart)

    expect(press(' ').defaultPrevented).toBe(true)
    press('Enter')

    expect(restart).toHaveBeenCalledTimes(2)
    expect(input.drain()).toBeUndefined() // restart is not a direction
  })

  it('survives a restart key with no handler registered', () => {
    keyboard()
    expect(() => press(' ')).not.toThrow()
  })

  it('stops listening after detach', () => {
    const input = keyboard()
    const restart = vi.fn()
    input.onRestart(restart)
    input.detach()

    press('ArrowUp')
    press(' ')

    expect(input.drain()).toBeUndefined()
    expect(restart).not.toHaveBeenCalled()
  })
})

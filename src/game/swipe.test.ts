// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { SWIPE_THRESHOLD, attachSwipe, combineInputs } from './input'
import type { InputSource } from './input'
import type { Direction } from './types'

let attached: InputSource | undefined
let surface: HTMLElement | undefined

function swipeSurface(): { source: InputSource; element: HTMLElement } {
  const element = document.createElement('div')
  document.body.append(element)
  surface = element
  attached = attachSwipe(element)
  return { source: attached, element }
}

/**
 * jsdom has no TouchEvent constructor, and the implementation only ever reads
 * `touches[0].clientX/Y`, so a plain Event carrying that shape is faithful.
 */
function touch(element: HTMLElement, type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: [{ clientX: x, clientY: y }],
  })
  element.dispatchEvent(event)
  return event
}

afterEach(() => {
  attached?.detach()
  attached = undefined
  surface?.remove()
  surface = undefined
})

describe('attachSwipe', () => {
  const past = SWIPE_THRESHOLD + 5

  it.each([
    ['right', past, 0],
    ['left', -past, 0],
    ['down', 0, past],
    ['up', 0, -past],
  ] as const)('reads a drag %s', (direction: Direction, dx, dy) => {
    const { source, element } = swipeSurface()
    touch(element, 'touchstart', 100, 100)
    touch(element, 'touchmove', 100 + dx, 100 + dy)
    expect(source.drain()).toBe(direction)
  })

  it('ignores a drag shorter than the threshold, so a tap does not steer', () => {
    const { source, element } = swipeSurface()
    touch(element, 'touchstart', 100, 100)
    touch(element, 'touchmove', 100 + SWIPE_THRESHOLD - 1, 100)
    expect(source.drain()).toBeUndefined()
  })

  it('picks the dominant axis when a swipe runs diagonally', () => {
    const { source, element } = swipeSurface()
    touch(element, 'touchstart', 100, 100)
    touch(element, 'touchmove', 100 + past, 100 + past - 10)
    expect(source.drain()).toBe('right')
  })

  it('re-anchors so one continuous drag can turn twice without lifting', () => {
    const { source, element } = swipeSurface()
    touch(element, 'touchstart', 100, 100)
    touch(element, 'touchmove', 100 + past, 100)
    expect(source.drain()).toBe('right')
    // Same finger, no touchend: the next leg measures from where the last ended.
    touch(element, 'touchmove', 100 + past, 100 + past)
    expect(source.drain()).toBe('down')
  })

  it('prevents default on move so the page cannot scroll under the board', () => {
    const { element } = swipeSurface()
    touch(element, 'touchstart', 100, 100)
    const move = touch(element, 'touchmove', 100 + past, 100)
    expect(move.defaultPrevented).toBe(true)
  })

  it('ignores movement that never began with a touchstart', () => {
    const { source, element } = swipeSurface()
    touch(element, 'touchmove', 500, 100)
    expect(source.drain()).toBeUndefined()
  })

  it('clears the direction once drained', () => {
    const { source, element } = swipeSurface()
    touch(element, 'touchstart', 100, 100)
    touch(element, 'touchmove', 100 + past, 100)
    source.drain()
    expect(source.drain()).toBeUndefined()
  })

  it('stops listening after detach', () => {
    const { source, element } = swipeSurface()
    source.detach()
    attached = undefined
    touch(element, 'touchstart', 100, 100)
    touch(element, 'touchmove', 100 + past, 100)
    expect(source.drain()).toBeUndefined()
  })
})

describe('combineInputs', () => {
  function stub(value: Direction | undefined): InputSource & { drained: number } {
    let remaining = value
    return {
      drained: 0,
      drain(): Direction | undefined {
        this.drained += 1
        const next = remaining
        remaining = undefined
        return next
      },
      onRestart(): void {},
      detach(): void {},
    }
  }

  it('reports the direction from whichever surface moved', () => {
    expect(combineInputs(stub(undefined), stub('left')).drain()).toBe('left')
  })

  it('drains every source, so an idle one cannot replay a stale direction', () => {
    const first = stub('up')
    const second = stub('down')
    const combined = combineInputs(first, second)

    // 'down' wins this tick; the point is that 'up' was consumed, not queued.
    expect(combined.drain()).toBe('down')
    expect(first.drained).toBe(1)
    expect(combined.drain()).toBeUndefined()
  })

  it('reports nothing when no surface moved', () => {
    expect(combineInputs(stub(undefined), stub(undefined)).drain()).toBeUndefined()
  })

  it('fans restart subscriptions out to every source', () => {
    let registered = 0
    const source: InputSource = {
      drain: () => undefined,
      onRestart: () => {
        registered += 1
      },
      detach: () => {},
    }
    combineInputs(source, source).onRestart(() => {})
    expect(registered).toBe(2)
  })

  it('detaches every source', () => {
    let detached = 0
    const source: InputSource = {
      drain: () => undefined,
      onRestart: () => {},
      detach: () => {
        detached += 1
      },
    }
    combineInputs(source, source).detach()
    expect(detached).toBe(2)
  })
})

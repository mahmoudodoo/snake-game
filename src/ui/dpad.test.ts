// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createDpad } from './dpad'
import type { InputSource } from '../game/input'
import type { Direction } from '../game/types'

let root: HTMLElement | undefined
let attached: InputSource | undefined

function pad(): { source: InputSource; element: HTMLElement } {
  const element = document.createElement('div')
  document.body.append(element)
  root = element
  attached = createDpad(element)
  return { source: attached, element }
}

function button(element: HTMLElement, dir: Direction): HTMLButtonElement {
  const found = element.querySelector<HTMLButtonElement>(`.dpad__btn--${dir}`)
  if (!found) throw new Error(`No ${dir} button`)
  return found
}

/** jsdom has no PointerEvent constructor; the handler only reads the type. */
function press(target: HTMLElement): Event {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

afterEach(() => {
  attached?.detach()
  attached = undefined
  root?.remove()
  root = undefined
})

describe('createDpad', () => {
  it('renders one button per direction', () => {
    const { element } = pad()
    expect(element.querySelectorAll('.dpad__btn')).toHaveLength(4)
  })

  it.each(['up', 'down', 'left', 'right'] as const)(
    'reports %s when that button is pressed',
    (dir: Direction) => {
      const { source, element } = pad()
      press(button(element, dir))
      expect(source.drain()).toBe(dir)
    },
  )

  it('steers on pointerdown rather than waiting for the release', () => {
    const { source, element } = pad()
    const event = press(button(element, 'up'))
    // Already readable before any pointerup — that is the point.
    expect(source.drain()).toBe('up')
    expect(event.defaultPrevented).toBe(true)
  })

  it('keeps only the latest press, since a tick applies one turn', () => {
    const { source, element } = pad()
    press(button(element, 'up'))
    press(button(element, 'right'))
    expect(source.drain()).toBe('right')
  })

  it('clears the direction once drained', () => {
    const { source, element } = pad()
    press(button(element, 'left'))
    source.drain()
    expect(source.drain()).toBeUndefined()
  })

  it('labels every button for screen readers', () => {
    const { element } = pad()
    for (const btn of element.querySelectorAll('.dpad__btn')) {
      expect(btn.getAttribute('aria-label')).toBeTruthy()
    }
    expect(element.getAttribute('role')).toBe('group')
  })

  it('empties the container and stops listening after detach', () => {
    const { source, element } = pad()
    const up = button(element, 'up')
    source.detach()
    attached = undefined
    press(up)
    expect(source.drain()).toBeUndefined()
    expect(element.children).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { mayAutoStart, nextIndex, place, progressLabel, resumable } from './tourLogic'

describe('tour progress', () => {
  it('says where you are', () => {
    expect(progressLabel(2, 8)).toBe('3 of 8')
  })

  it('offers to pick up a paused tour, and nothing else', () => {
    expect(resumable({ tour: 'water', status: 'paused', index: 3 }, 'water')).toBe(true)
    expect(resumable({ tour: 'water', status: 'done' }, 'water')).toBe(false)
    expect(resumable({ tour: 'water', status: 'skipped' }, 'water')).toBe(false)
    expect(resumable({ tour: 'clearance', status: 'paused', index: 1 }, 'water')).toBe(false)
    expect(resumable(null, 'water')).toBe(false)
  })

  it('never starts again by itself once met, skipped or finished, and not at all when switched off', () => {
    expect(mayAutoStart(null, 'water', false)).toBe(true)
    for (const status of ['done', 'skipped'] as const) expect(mayAutoStart({ tour: 'water', status }, 'water', false)).toBe(false)
    expect(mayAutoStart({ tour: 'water', status: 'paused', index: 2 }, 'water', false)).toBe(false)
    expect(mayAutoStart(null, 'water', true)).toBe(false)
  })

  it('walks past steps that were skipped for want of an anchor', () => {
    const skipped = new Set([2, 3])
    expect(nextIndex(1, 6, 1, skipped)).toBe(4)
    expect(nextIndex(4, 6, -1, skipped)).toBe(1)
    expect(nextIndex(5, 6, 1, skipped)).toBeNull()
    expect(nextIndex(0, 6, -1, skipped)).toBeNull()
  })
})

describe('placing the card', () => {
  const viewport = { width: 1280, height: 720 }
  const card = { width: 320, height: 180 }

  it('goes where asked when it fits', () => {
    expect(place({ left: 100, top: 100, width: 200, height: 40 }, card, viewport, 'bottom').side).toBe('bottom')
  })

  it('flips when the wanted side has no room, and stays inside the window', () => {
    const placed = place({ left: 1100, top: 650, width: 150, height: 40 }, card, viewport, 'bottom')
    expect(placed.side).toBe('top')
    expect(placed.left + card.width).toBeLessThanOrEqual(viewport.width)
    expect(placed.top).toBeGreaterThanOrEqual(0)
  })

  it('never covers what it is talking about', () => {
    const anchors = [
      { left: 300, top: 120, width: 700, height: 80 },
      { left: 240, top: 300, width: 900, height: 360 },
      { left: 1100, top: 8, width: 160, height: 28 },
      { left: 8, top: 200, width: 200, height: 28 },
    ]
    for (const anchor of anchors) {
      for (const side of ['top', 'bottom', 'left', 'right', 'bottom-end'] as const) {
        const placed = place(anchor, card, viewport, side)
        const overlaps = placed.left < anchor.left + anchor.width && placed.left + card.width > anchor.left && placed.top < anchor.top + anchor.height && placed.top + card.height > anchor.top
        expect(overlaps, `${JSON.stringify(anchor)} wanted ${side}`).toBe(false)
        expect(placed.left).toBeGreaterThanOrEqual(0)
        expect(placed.top).toBeGreaterThanOrEqual(0)
        expect(placed.left + card.width).toBeLessThanOrEqual(viewport.width)
        expect(placed.top + card.height).toBeLessThanOrEqual(viewport.height)
      }
    }
  })

  it('speaks about a sidebar item from its right and keeps off the navigation', () => {
    const sidebar = { left: 0, top: 44, width: 232, height: 676 }
    const placed = place({ left: 8, top: 200, width: 216, height: 28 }, card, viewport, 'right', 12, 12, [sidebar])
    expect(placed.side).toBe('right')
    expect(placed.left).toBeGreaterThanOrEqual(sidebar.width)
  })

  it('goes round a protected strip when the wanted side is covered by it', () => {
    const bar = { left: 232, top: 0, width: 1048, height: 44 }
    const placed = place({ left: 400, top: 60, width: 300, height: 30 }, card, viewport, 'top', 12, 12, [bar])
    expect(placed.top).toBeGreaterThanOrEqual(bar.top + bar.height)
  })

  it('lines the card up with the right edge for a menu in the corner', () => {
    const placed = place({ left: 1100, top: 8, width: 160, height: 28 }, card, viewport, 'bottom-end')
    expect(placed.left + card.width).toBeLessThanOrEqual(viewport.width)
    expect(placed.side).toBe('bottom-end')
  })
})

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

  it('lines the card up with the right edge for a menu in the corner', () => {
    const placed = place({ left: 1100, top: 8, width: 160, height: 28 }, card, viewport, 'bottom-end')
    expect(placed.left + card.width).toBeLessThanOrEqual(viewport.width)
    expect(placed.side).toBe('bottom-end')
  })
})

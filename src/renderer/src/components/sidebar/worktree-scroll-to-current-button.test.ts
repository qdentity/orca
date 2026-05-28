import { describe, expect, it } from 'vitest'
import { getScrollTopToRevealBounds } from './WorktreeList'

describe('getScrollTopToRevealBounds', () => {
  const makeContainer = (scrollTop: number, clientHeight: number) =>
    ({
      scrollTop,
      clientHeight
    }) as HTMLElement

  it('scrolls upward to reveal a mounted current workspace card above the viewport', () => {
    expect(getScrollTopToRevealBounds(makeContainer(100, 200), { start: 60, end: 120 })).toBe(60)
  })

  it('scrolls upward when a mounted current workspace card is hidden under a sticky header', () => {
    expect(getScrollTopToRevealBounds(makeContainer(100, 200), { start: 110, end: 180 }, 34)).toBe(
      76
    )
  })

  it('top-aligns a tall workspace card instead of revealing only its lower agent rows', () => {
    expect(getScrollTopToRevealBounds(makeContainer(100, 100), { start: 130, end: 250 }, 34)).toBe(
      96
    )
  })

  it('does not scroll when a mounted workspace card is already visible below a sticky header', () => {
    expect(
      getScrollTopToRevealBounds(makeContainer(100, 200), { start: 150, end: 220 }, 34)
    ).toBeNull()
  })

  it('scrolls downward to reveal a mounted current workspace card below the viewport', () => {
    expect(getScrollTopToRevealBounds(makeContainer(100, 200), { start: 250, end: 340 })).toBe(140)
  })

  it('does not scroll when the current workspace card is already fully visible', () => {
    expect(getScrollTopToRevealBounds(makeContainer(100, 200), { start: 125, end: 260 })).toBeNull()
  })
})

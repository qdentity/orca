import { describe, expect, it } from 'vitest'
import { shouldSkipHiddenRendererOutput } from './hidden-renderer-skip-eligibility'

describe('shouldSkipHiddenRendererOutput', () => {
  it('skips hidden plain ASCII output when a snapshot restore is available', () => {
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: false,
        data: 'line one\r\nline two\tok\n'
      })
    ).toBe(true)
  })

  it('keeps visible or non-restorable output on the live renderer path', () => {
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: true,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: false,
        data: 'visible\r\n'
      })
    ).toBe(false)
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: false,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: false,
        data: 'hidden\r\n'
      })
    ).toBe(false)
  })

  it('skips complete hidden title OSC chunks when a snapshot restore is available', () => {
    for (const data of ['\x1b]0;window title\x07', '\x1b]1;icon title\x07', '\x1b]2;both\x1b\\']) {
      expect(
        shouldSkipHiddenRendererOutput({
          foreground: false,
          canRestoreHiddenOutput: true,
          startupRendererQueryWindowActive: false,
          synchronizedOutputActive: false,
          data
        })
      ).toBe(true)
    }
  })

  it('skips hidden title OSC mixed with otherwise restorable plain output', () => {
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: false,
        data: 'line before\r\n\x1b]0;next title\x07line after\r\n'
      })
    ).toBe(true)
  })

  it('keeps startup query windows and terminal-control chunks live', () => {
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: true,
        synchronizedOutputActive: false,
        data: 'plain\r\n'
      })
    ).toBe(false)
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: true,
        data: 'plain row inside synchronized frame\r\n'
      })
    ).toBe(false)
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: true,
        synchronizedOutputActive: false,
        data: '\x1b]0;title\x07'
      })
    ).toBe(false)
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: false,
        data: '\x1b[?2026hredraw\x1b[?2026l'
      })
    ).toBe(false)
  })

  it('keeps non-title OSC and incomplete title OSC chunks live', () => {
    for (const data of ['\x1b]52;c;clipboard\x07', '\x1b]9;notify\x07', '\x1b]0;partial-title']) {
      expect(
        shouldSkipHiddenRendererOutput({
          foreground: false,
          canRestoreHiddenOutput: true,
          startupRendererQueryWindowActive: false,
          synchronizedOutputActive: false,
          data
        })
      ).toBe(false)
    }
  })

  it('keeps rewrite and unicode chunks live', () => {
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: false,
        data: 'progress 10%\rprogress 20%'
      })
    ).toBe(false)
    expect(
      shouldSkipHiddenRendererOutput({
        foreground: false,
        canRestoreHiddenOutput: true,
        startupRendererQueryWindowActive: false,
        synchronizedOutputActive: false,
        data: 'emoji 😀\r\n'
      })
    ).toBe(false)
  })
})

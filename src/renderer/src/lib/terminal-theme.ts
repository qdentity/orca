import type { ITheme } from '@xterm/xterm'
import { getTheme, getThemeNames } from './terminal-themes-data'
import type { GlobalSettings } from '../../../shared/types'

export const BUILTIN_TERMINAL_THEME_NAMES = getThemeNames()

export const DEFAULT_TERMINAL_THEME_DARK = 'Ghostty Default Style Dark'
export const DEFAULT_TERMINAL_THEME_LIGHT = 'Builtin Tango Light'
export const DEFAULT_TERMINAL_DIVIDER_DARK = '#3f3f46'
export const DEFAULT_TERMINAL_DIVIDER_LIGHT = '#d4d4d8'

export type EffectiveTerminalAppearance = {
  mode: 'dark' | 'light'
  sourceTheme: 'system' | 'dark' | 'light'
  themeName: string
  dividerColor: string
  theme: ITheme | null
  systemPrefersDark: boolean
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function getBuiltinTheme(name: string): ITheme | null {
  return getTheme(name)
}

export function getTerminalThemePreview(name: string): ITheme | null {
  const theme = getTheme(name)
  if (theme) {
    return theme
  }
  return getTheme(DEFAULT_TERMINAL_THEME_DARK)
}

export function resolveEffectiveTerminalAppearance(
  settings: Pick<
    GlobalSettings,
    | 'theme'
    | 'terminalThemeDark'
    | 'terminalDividerColorDark'
    | 'terminalUseSeparateLightTheme'
    | 'terminalThemeLight'
    | 'terminalDividerColorLight'
  >,
  systemPrefersDark = getSystemPrefersDark()
): EffectiveTerminalAppearance {
  const sourceTheme =
    settings.theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : settings.theme
  const useLightVariant = sourceTheme === 'light' && settings.terminalUseSeparateLightTheme
  const themeName = useLightVariant
    ? settings.terminalThemeLight || DEFAULT_TERMINAL_THEME_LIGHT
    : settings.terminalThemeDark || DEFAULT_TERMINAL_THEME_DARK
  const dividerColor = useLightVariant
    ? normalizeColor(settings.terminalDividerColorLight, DEFAULT_TERMINAL_DIVIDER_LIGHT)
    : normalizeColor(settings.terminalDividerColorDark, DEFAULT_TERMINAL_DIVIDER_DARK)

  return {
    mode: sourceTheme,
    sourceTheme: settings.theme,
    themeName,
    dividerColor,
    theme: getTerminalThemePreview(themeName),
    systemPrefersDark
  }
}

export function normalizeColor(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    return fallback
  }
  return trimmed
}

export function buildTerminalFontMatchers(fontFamily: string): string[] {
  const trimmed = fontFamily.trim()
  const normalized = trimmed.toLowerCase()
  const matchers = trimmed ? [trimmed, normalized] : []
  return Array.from(
    new Set([
      ...matchers,
      'sf mono',
      'sfmono-regular',
      'menlo',
      'menlo regular',
      'dejavu sans mono',
      'liberation mono',
      'ubuntu mono',
      'monospace'
    ])
  )
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function resolvePaneStyleOptions(
  settings: Pick<
    GlobalSettings,
    | 'terminalInactivePaneOpacity'
    | 'terminalActivePaneOpacity'
    | 'terminalPaneOpacityTransitionMs'
    | 'terminalDividerThicknessPx'
    | 'terminalFocusFollowsMouse'
  >
) {
  return {
    inactivePaneOpacity: clampNumber(settings.terminalInactivePaneOpacity, 0, 1),
    activePaneOpacity: clampNumber(settings.terminalActivePaneOpacity, 0, 1),
    opacityTransitionMs: clampNumber(settings.terminalPaneOpacityTransitionMs, 0, 5000),
    dividerThicknessPx: clampNumber(settings.terminalDividerThicknessPx, 1, 32),
    // Why no clamping: boolean pass-through. Both true and false are valid.
    focusFollowsMouse: settings.terminalFocusFollowsMouse
  }
}

export function getCursorStyleSequence(
  style: 'bar' | 'block' | 'underline',
  blinking: boolean
): string {
  const code =
    style === 'block'
      ? blinking
        ? 1
        : 2
      : style === 'underline'
        ? blinking
          ? 3
          : 4
        : blinking
          ? 5
          : 6

  return `\u001b[${code} q`
}

export function colorToCss(
  color: { r: number; g: number; b: number; a?: number } | string | undefined,
  fallback: string
): string {
  if (!color) {
    return fallback
  }
  if (typeof color === 'string') {
    return color
  }
  const alpha = typeof color.a === 'number' ? color.a / 255 : 1
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

type RgbColor = {
  r: number
  g: number
  b: number
}

const NAMED_TERMINAL_BACKGROUND_COLORS: Record<string, RgbColor> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  transparent: { r: 0, g: 0, b: 0 }
}

export function isTerminalBackgroundLight(background: string | undefined): boolean {
  const rgb = parseCssRgbColor(background)
  if (!rgb) {
    return false
  }

  const toLinear = (channel: number): number => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b)
  return luminance > 0.5
}

function parseCssRgbColor(color: string | undefined): RgbColor | null {
  const value = color?.trim().toLowerCase()
  if (!value) {
    return null
  }

  const named = NAMED_TERMINAL_BACKGROUND_COLORS[value]
  if (named) {
    return named
  }

  const hexMatch = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    const channels =
      hex.length === 3 || hex.length === 4
        ? hex
            .slice(0, 3)
            .split('')
            .map((part) => Number.parseInt(part + part, 16))
        : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((part) =>
            Number.parseInt(part, 16)
          )
    return { r: channels[0], g: channels[1], b: channels[2] }
  }

  const rgbMatch = value.match(/^rgba?\((.+)\)$/)
  if (!rgbMatch) {
    return null
  }

  const parts = rgbMatch[1].includes(',')
    ? rgbMatch[1].split(',').slice(0, 3)
    : rgbMatch[1].replace('/', ' ').trim().split(/\s+/).slice(0, 3)
  if (parts.length !== 3) {
    return null
  }
  const channels = parts.map(parseCssRgbChannel)
  if (channels.some((channel) => channel === null)) {
    return null
  }
  return { r: channels[0]!, g: channels[1]!, b: channels[2]! }
}

function parseCssRgbChannel(channel: string): number | null {
  const trimmed = channel.trim()
  const value = trimmed.endsWith('%')
    ? (Number.parseFloat(trimmed.slice(0, -1)) / 100) * 255
    : Number.parseFloat(trimmed)
  if (!Number.isFinite(value)) {
    return null
  }
  return Math.min(255, Math.max(0, Math.round(value)))
}

const PALETTE_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const

export function terminalPalettePreview(theme: ITheme | null): string[] {
  if (!theme) {
    return []
  }
  const swatches: string[] = []
  for (const key of PALETTE_KEYS) {
    const color = theme[key]
    if (color) {
      swatches.push(color)
    }
  }
  return swatches
}

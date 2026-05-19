import type { TerminalMacro, TerminalMacroLayout } from './types'

const MAX_TERMINAL_MACROS = 40
const MAX_TERMINAL_MACRO_NAME_LENGTH = 80
const MAX_TERMINAL_MACRO_TEXT_LENGTH = 4000

export const DEFAULT_TERMINAL_MACROS: TerminalMacro[] = []

export function getDefaultTerminalMacros(): TerminalMacro[] {
  return DEFAULT_TERMINAL_MACROS.map((macro) => ({ ...macro }))
}

function normalizeTerminalMacroLayout(input: unknown): TerminalMacroLayout {
  return input === 'split-right' || input === 'split-down' ? input : 'tab'
}

function trimMacroText(input: unknown): string {
  return typeof input === 'string' ? input.trimEnd().slice(0, MAX_TERMINAL_MACRO_TEXT_LENGTH) : ''
}

export function normalizeTerminalMacros(input: unknown): TerminalMacro[] {
  if (!Array.isArray(input)) {
    return getDefaultTerminalMacros()
  }

  const normalized: TerminalMacro[] = []
  const seenIds = new Set<string>()

  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const record = item as Record<string, unknown>
    const rawId = typeof record.id === 'string' ? record.id.trim() : ''
    const hasName = typeof record.name === 'string'
    const hasAnyCommand = typeof record.command === 'string'
    // Why: settings saves on each edit; keep in-progress rows instead of
    // deleting them before the user has finished filling them out.
    if (!hasName && !hasAnyCommand) {
      continue
    }

    const name = hasName ? String(record.name).trim() : ''
    const command = trimMacroText(record.command)
    const layout = normalizeTerminalMacroLayout(record.layout)

    const idBase = rawId || `terminal-macro-${normalized.length + 1}`
    let id = idBase.slice(0, MAX_TERMINAL_MACRO_NAME_LENGTH)
    let suffix = 2
    while (seenIds.has(id)) {
      id = `${idBase.slice(0, MAX_TERMINAL_MACRO_NAME_LENGTH - 4)}-${suffix}`
      suffix += 1
    }
    seenIds.add(id)

    normalized.push({
      id,
      name: name.slice(0, MAX_TERMINAL_MACRO_NAME_LENGTH),
      layout,
      command,
      appendEnter: record.appendEnter !== false
    })

    if (normalized.length >= MAX_TERMINAL_MACROS) {
      break
    }
  }

  return normalized
}

export function buildTerminalMacroInput(command: string, appendEnter: boolean): string {
  return appendEnter ? `${command}\r` : command
}

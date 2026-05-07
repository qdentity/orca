/* eslint-disable max-lines -- Why: Codex hook trust parsing, hashing, and byte-preserving TOML edits share one fragile file-format contract; splitting would make the compatibility shim harder to audit. */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { createHash, randomUUID } from 'crypto'

// Why: Codex 0.129+ gates each hook on a `trusted_hash` entry in
// ~/.codex/config.toml under [hooks.state."<key>"]. Without it the hook is in
// the "review required" pile and never fires, so the agent-status sidebar
// silently goes blank. We reproduce Codex's hash so install() can register
// trust the same way `/hooks` would. Algorithm reverse-engineered from
// codex-rs/hooks/src/engine/discovery.rs (command_hook_hash) +
// codex-rs/config/src/fingerprint.rs (version_for_toml).

export type CodexEventLabel =
  | 'pre_tool_use'
  | 'permission_request'
  | 'post_tool_use'
  | 'pre_compact'
  | 'post_compact'
  | 'session_start'
  | 'user_prompt_submit'
  | 'stop'

export type CodexTrustEntry = {
  /** Path on disk to the hooks.json that declares the hook (the "key_source"). */
  sourcePath: string
  /** Codex event label (snake_case). */
  eventLabel: CodexEventLabel
  /** 0-based index of the matcher group within the event array. */
  groupIndex: number
  /** 0-based index of the handler within the matcher group's `hooks` array. */
  handlerIndex: number
  /** The exact `command` string written to hooks.json. */
  command: string
  /** Effective timeout in seconds. Codex normalizes absent/<1 to 600. */
  timeoutSec?: number
  /** Whether the handler is async. Defaults to false. */
  async?: boolean
  /** Optional matcher pattern (only meaningful for events that support it). */
  matcher?: string
  /** Optional statusMessage field. */
  statusMessage?: string
}

export type CodexHookTrustState = {
  trustedHash?: string
  enabled?: boolean
}

// Why: matches Codex's canonical_json. Sorts object keys recursively before
// SHA-256ing; arrays preserve order.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

// Why: reproduces command_hook_hash. NormalizedHookIdentity has `group:
// MatcherGroup` flattened in, so the wire shape is { event_name, matcher?,
// hooks: [<normalized handler>] }. `matcher` is omitted (not null) when
// absent — Rust's Option<String>=None drops through the TOML→JSON path.
// Handler is normalized to timeout=600 (or explicit, min 1) and async=false.
export function computeTrustedHash(entry: CodexTrustEntry): string {
  const handler: Record<string, unknown> = {
    type: 'command',
    command: entry.command,
    timeout: Math.max(1, entry.timeoutSec ?? 600),
    async: entry.async ?? false
  }
  if (entry.statusMessage !== undefined) {
    handler.statusMessage = entry.statusMessage
  }
  const identity: Record<string, unknown> = {
    event_name: entry.eventLabel,
    hooks: [handler]
  }
  if (entry.matcher !== undefined) {
    identity.matcher = entry.matcher
  }
  const serialized = JSON.stringify(canonicalize(identity))
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`
}

export function computeTrustKey(entry: CodexTrustEntry): string {
  return `${entry.sourcePath}:${entry.eventLabel}:${entry.groupIndex}:${entry.handlerIndex}`
}

export function parseTrustKey(key: string): {
  sourcePath: string
  eventLabel: CodexEventLabel
  groupIndex: number
  handlerIndex: number
} | null {
  // Why: keys have shape `<sourcePath>:<eventLabel>:<groupIdx>:<handlerIdx>`.
  // sourcePath itself may contain `:` (Windows drive letters), so anchor the
  // parse at the LAST three colons rather than the first.
  const lastColon = key.lastIndexOf(':')
  if (lastColon === -1) {
    return null
  }
  const handlerStr = key.slice(lastColon + 1)
  if (!isCanonicalNonNegativeInt(handlerStr)) {
    return null
  }
  const secondLast = key.lastIndexOf(':', lastColon - 1)
  if (secondLast === -1) {
    return null
  }
  const groupStr = key.slice(secondLast + 1, lastColon)
  if (!isCanonicalNonNegativeInt(groupStr)) {
    return null
  }
  const thirdLast = key.lastIndexOf(':', secondLast - 1)
  if (thirdLast === -1) {
    return null
  }
  const eventLabel = key.slice(thirdLast + 1, secondLast)
  if (!isCodexEventLabel(eventLabel)) {
    return null
  }
  const sourcePath = key.slice(0, thirdLast)
  if (sourcePath.length === 0) {
    return null
  }
  return {
    sourcePath,
    eventLabel,
    groupIndex: Number(groupStr),
    handlerIndex: Number(handlerStr)
  }
}

// Why: Number('') === 0 and Number('1e2') === 100 both pass Number.isInteger,
// so reject any non-canonical decimal form before numeric conversion.
function isCanonicalNonNegativeInt(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value)
}

function isCodexEventLabel(value: string): value is CodexEventLabel {
  return (
    value === 'pre_tool_use' ||
    value === 'permission_request' ||
    value === 'post_tool_use' ||
    value === 'pre_compact' ||
    value === 'post_compact' ||
    value === 'session_start' ||
    value === 'user_prompt_submit' ||
    value === 'stop'
  )
}

// Why: regex-edit ~/.codex/config.toml rather than parse + reserialize. The
// file is hand-edited by users (and other tools) and a round-trip through
// any TOML library would lose comments, key ordering, and inline-table
// style. We only ever (a) replace an existing [hooks.state."<key>"] block
// keyed by *our* known hook keys, or (b) append a new block at EOF. Other
// content is byte-preserved.
export function upsertHookTrustEntries(
  configPath: string,
  entries: readonly CodexTrustEntry[]
): void {
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : ''
  let updated = existing
  for (const entry of entries) {
    updated = upsertTrustBlock(updated, computeTrustKey(entry), computeTrustedHash(entry))
  }
  if (updated === existing) {
    return
  }
  writeConfigAtomically(configPath, updated)
}

// Why: build the canonical block we own. `enabled = true` mirrors what Codex
// itself writes when the user approves via /hooks (HookStateToml fields).
function buildTrustBlock(key: string, hash: string): string {
  return [
    `[hooks.state."${escapeTomlString(key)}"]`,
    'enabled = true',
    `trusted_hash = "${escapeTomlString(hash)}"`
  ].join('\n')
}

// Why: TOML basic strings forbid raw control chars; escape backslash first so
// later substitutions don't double-escape the inserted backslashes.
function escapeTomlString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\b', '\\b')
    .replaceAll('\f', '\\f')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}

function upsertTrustBlock(content: string, key: string, hash: string): string {
  const block = buildTrustBlock(key, hash)
  const headerPattern = buildHeaderPattern(key)
  const match = headerPattern.exec(content)
  if (!match) {
    if (content.length === 0) {
      return `${block}\n`
    }
    // Why: leave one blank line before our appended block so the file stays
    // readable, but don't compound separators when the file already ends in
    // a blank line.
    const separator = content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n'
    return `${content}${separator}${block}\n`
  }
  const headerStart = match.index + (match[1] ? match[1].length : 0)
  const headerLineEnd = match.index + match[0].length
  // Why: find the next top-level table header [...] so we replace ONLY this
  // block. Comments and blank lines between us and the next header are part
  // of our block and get rewritten — Codex itself only writes the two known
  // fields, so this is safe.
  const after = content.slice(headerLineEnd)
  const nextHeaderRel = findNextTableHeader(after)
  const blockEnd = nextHeaderRel === -1 ? content.length : headerLineEnd + nextHeaderRel
  return `${content.slice(0, headerStart)}${block}\n${content.slice(blockEnd)}`
}

// Why: only match a header that sits at column 0 of its line and ends the
// line. Codex emits the canonical form with the key double-quoted; we never
// share this slot with another tool, so we don't bother accepting bare
// dotted-key variants.
// Why: accept both LF and CRLF — Windows editors (and some user-edited files)
// terminate the header line with \r\n.
function buildHeaderPattern(key: string): RegExp {
  const escapedKey = escapeRegex(escapeTomlString(key))
  return new RegExp(`(^|\\r?\\n)\\[hooks\\.state\\."${escapedKey}"\\][ \\t]*\\r?\\n`)
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Why: quoted keys can contain `]` (e.g. `[hooks.state."a]b"]`) and `[` lines
// inside multi-line strings aren't headers, so we need a stateful scanner —
// a flat regex misclassifies both cases.
function findNextTableHeader(text: string): number {
  let cursor = 0
  let inMultilineBasic = false
  let inMultilineLiteral = false
  while (cursor < text.length) {
    const newlineIdx = text.indexOf('\n', cursor)
    const lineEnd = newlineIdx === -1 ? text.length : newlineIdx
    const rawLine = text.slice(cursor, lineEnd)
    const line = rawLine.replace(/\r$/, '')
    if (inMultilineBasic) {
      if (countUnescapedTripleQuote(line, '"""') % 2 === 1) {
        inMultilineBasic = false
      }
    } else if (inMultilineLiteral) {
      if (countTripleQuote(line, "'''") % 2 === 1) {
        inMultilineLiteral = false
      }
    } else {
      const trimmed = line.trimStart()
      // Why: stop at both `[table]` and `[[array.of.tables]]` — both end our
      // block. Skipping `[[ ]]` here would let our slice consume past array
      // entries into unrelated user content.
      if (trimmed.startsWith('[') && isCompleteTableHeader(trimmed)) {
        return cursor
      }
      // Odd count means this line opens a multi-line string without closing it.
      if (countUnescapedTripleQuote(line, '"""') % 2 === 1) {
        inMultilineBasic = true
      }
      if (countTripleQuote(line, "'''") % 2 === 1) {
        inMultilineLiteral = true
      }
    }
    if (newlineIdx === -1) {
      return -1
    }
    cursor = newlineIdx + 1
  }
  return -1
}

// Why: literal strings (`'''`) don't honor escapes, so a plain indexOf scan
// suffices.
function countTripleQuote(line: string, quote: string): number {
  let count = 0
  let i = 0
  while ((i = line.indexOf(quote, i)) !== -1) {
    count++
    i += 3
  }
  return count
}

// Why: basic multi-line strings honor `\"` (and `\\`) escapes. Skip past
// `\<char>` so an escaped quote doesn't count toward triple-quote scans.
function countUnescapedTripleQuote(line: string, quote: '"""'): number {
  let count = 0
  let i = 0
  while (i < line.length) {
    if (line[i] === '\\' && i + 1 < line.length) {
      i += 2
      continue
    }
    if (line.startsWith(quote, i)) {
      count++
      i += 3
      continue
    }
    i++
  }
  return count
}

// Why: walk the header byte-by-byte so `]` inside a quoted key segment
// doesn't terminate us early. Basic strings honor `\` escapes; literal
// strings (single quotes) don't allow escapes per TOML spec.
// Accepts both `[table]` and `[[array.of.tables]]` since either ends a block.
function isCompleteTableHeader(line: string): boolean {
  if (!line.startsWith('[')) {
    return false
  }
  const isArrayHeader = line.startsWith('[[')
  let i = isArrayHeader ? 2 : 1
  let inBasicQuote = false
  let inLiteralQuote = false
  while (i < line.length) {
    const ch = line[i]
    if (inBasicQuote) {
      if (ch === '\\' && i + 1 < line.length) {
        i += 2
        continue
      }
      if (ch === '"') {
        inBasicQuote = false
      }
      i++
      continue
    }
    if (inLiteralQuote) {
      if (ch === "'") {
        inLiteralQuote = false
      }
      i++
      continue
    }
    if (ch === '"') {
      inBasicQuote = true
      i++
      continue
    }
    if (ch === "'") {
      inLiteralQuote = true
      i++
      continue
    }
    if (ch === ']') {
      if (isArrayHeader) {
        if (line[i + 1] !== ']') {
          return false
        }
        const tail = line.slice(i + 2)
        return /^\s*(#.*)?$/.test(tail)
      }
      const tail = line.slice(i + 1)
      return /^\s*(#.*)?$/.test(tail)
    }
    i++
  }
  return false
}

// Why: same atomic-rename + .bak rotation pattern as writeHooksJson — a
// half-written config.toml can brick a user's Codex install, so write to
// tmp and rename. Random-suffix tmp name avoids cross-process races on
// rapid reinstalls.
function writeConfigAtomically(configPath: string, contents: string): void {
  const dir = dirname(configPath)
  mkdirSync(dir, { recursive: true })
  const tmpPath = join(dir, `.${Date.now()}-${randomUUID()}.tmp`)
  let renamed = false
  try {
    writeFileSync(tmpPath, contents, 'utf-8')
    if (existsSync(configPath)) {
      copyFileSync(configPath, `${configPath}.bak`)
    }
    renameSync(tmpPath, configPath)
    renamed = true
  } finally {
    if (!renamed && existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath)
      } catch {
        // best effort — surfacing the cleanup failure would mask the original write error
      }
    }
  }
}

export function removeHookTrustEntries(configPath: string, keys: readonly string[]): void {
  if (!existsSync(configPath)) {
    return
  }
  const existing = readFileSync(configPath, 'utf-8')
  let updated = existing
  for (const key of keys) {
    updated = removeTrustBlock(updated, key)
  }
  if (updated === existing) {
    return
  }
  writeConfigAtomically(configPath, updated)
}

function removeTrustBlock(content: string, key: string): string {
  const headerPattern = buildHeaderPattern(key)
  const match = headerPattern.exec(content)
  if (!match) {
    return content
  }
  // Why: cut from match.index (which includes the captured leading newline)
  // so we don't strand a blank line where our block used to live.
  const cutStart = match.index
  const headerLineEnd = match.index + match[0].length
  const after = content.slice(headerLineEnd)
  const nextHeaderRel = findNextTableHeader(after)
  const cutEnd = nextHeaderRel === -1 ? content.length : headerLineEnd + nextHeaderRel
  return content.slice(0, cutStart) + content.slice(cutEnd)
}

export function readHookTrustEntries(configPath: string): Map<string, CodexHookTrustState> {
  const result = new Map<string, CodexHookTrustState>()
  if (!existsSync(configPath)) {
    return result
  }
  const content = readFileSync(configPath, 'utf-8')
  // Why: walk line-by-line so `[hooks.state."..."]` inside a `"""..."""` or
  // `'''...'''` multi-line string isn't mistaken for a real header.
  const headerLineRegex = /^[ \t]*\[hooks\.state\."((?:[^"\\]|\\.)*)"\][ \t]*$/
  let cursor = 0
  let inMultilineBasic = false
  let inMultilineLiteral = false
  while (cursor < content.length) {
    const newlineIdx = content.indexOf('\n', cursor)
    const lineEnd = newlineIdx === -1 ? content.length : newlineIdx
    const rawLine = content.slice(cursor, lineEnd)
    const line = rawLine.replace(/\r$/, '')
    const nextCursor = newlineIdx === -1 ? content.length : newlineIdx + 1
    if (inMultilineBasic) {
      if (countUnescapedTripleQuote(line, '"""') % 2 === 1) {
        inMultilineBasic = false
      }
      cursor = nextCursor
      continue
    }
    if (inMultilineLiteral) {
      if (countTripleQuote(line, "'''") % 2 === 1) {
        inMultilineLiteral = false
      }
      cursor = nextCursor
      continue
    }
    const headerMatch = headerLineRegex.exec(line)
    if (headerMatch) {
      const escapedKey = headerMatch[1]
      const key = unescapeTomlString(escapedKey)
      // Why: block ends at the next *real* header (multi-line aware).
      const after = content.slice(nextCursor)
      const nextHeaderRel = findNextTableHeader(after)
      const blockEnd = nextHeaderRel === -1 ? content.length : nextCursor + nextHeaderRel
      const block = content.slice(nextCursor, blockEnd)
      // Why: we own this block's shape (only `enabled` + `trusted_hash`), so
      // a line scan beats pulling in a full TOML value parser.
      const hashMatch = /^[ \t]*trusted_hash[ \t]*=[ \t]*"((?:[^"\\]|\\.)*)"/m.exec(block)
      const enabledMatch = /^[ \t]*enabled[ \t]*=[ \t]*(true|false)[ \t\r]*(?:#.*)?$/m.exec(block)
      result.set(key, {
        trustedHash: hashMatch ? unescapeTomlString(hashMatch[1]) : undefined,
        enabled: enabledMatch ? enabledMatch[1] === 'true' : undefined
      })
      cursor = nextCursor
      continue
    }
    if (countUnescapedTripleQuote(line, '"""') % 2 === 1) {
      inMultilineBasic = true
    }
    if (countTripleQuote(line, "'''") % 2 === 1) {
      inMultilineLiteral = true
    }
    cursor = nextCursor
  }
  return result
}

function unescapeTomlString(escaped: string): string {
  let result = ''
  let i = 0
  while (i < escaped.length) {
    const ch = escaped[i]
    if (ch === '\\' && i + 1 < escaped.length) {
      const next = escaped[i + 1]
      if (next === 'n') {
        result += '\n'
      } else if (next === 'r') {
        result += '\r'
      } else if (next === 't') {
        result += '\t'
      } else if (next === 'b') {
        result += '\b'
      } else if (next === 'f') {
        result += '\f'
      } else if (next === '"') {
        result += '"'
      } else if (next === '\\') {
        result += '\\'
      }
      // Why: unknown escapes round-trip — preserve the backslash so we don't
      // silently drop information.
      else {
        result += `\\${next}`
      }
      i += 2
    } else {
      result += ch
      i++
    }
  }
  return result
}

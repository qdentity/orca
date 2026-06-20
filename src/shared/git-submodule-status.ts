import type { GitSubmoduleEntry } from './git-status-types'

export function parseGitSubmoduleStatusOutput(stdout: string): GitSubmoduleEntry[] {
  const entries: GitSubmoduleEntry[] = []

  for (const rawLine of stdout.split(/\r?\n/)) {
    if (!rawLine) {
      continue
    }
    const parsed = parseGitSubmoduleStatusLine(rawLine)
    if (parsed) {
      entries.push(parsed)
    }
  }

  return entries
}

function parseGitSubmoduleStatusLine(line: string): GitSubmoduleEntry | null {
  const prefix = line[0]
  const rest = line.slice(1)
  const match = rest.match(/^([0-9a-fA-F]{40}) (.+?)(?: \((.*)\))?$/)
  if (!match) {
    return null
  }

  return {
    path: match[2],
    head: match[1],
    status: parseGitSubmoduleStatusPrefix(prefix),
    ...(match[3] ? { description: match[3] } : {})
  }
}

function parseGitSubmoduleStatusPrefix(prefix: string): GitSubmoduleEntry['status'] {
  switch (prefix) {
    case '-':
      return 'uninitialized'
    case '+':
      return 'modified'
    case 'U':
      return 'conflict'
    default:
      return 'clean'
  }
}

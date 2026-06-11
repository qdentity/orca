export function getGitCloneFailureMessage(stderr: string): string {
  const lines = stderr
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => stripAnsi(line).trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]
    const fatalIndex = line.indexOf('fatal:')
    if (fatalIndex !== -1) {
      return line.slice(fatalIndex)
    }
    const errorIndex = line.indexOf('error:')
    if (errorIndex !== -1) {
      return line.slice(errorIndex)
    }
  }

  return lines.at(-1) ?? 'unknown error'
}

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
}

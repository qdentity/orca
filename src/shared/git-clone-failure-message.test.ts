import { describe, expect, it } from 'vitest'
import { getGitCloneFailureMessage } from './git-clone-failure-message'

describe('getGitCloneFailureMessage', () => {
  it('keeps the full fatal destination path message after progress output', () => {
    expect(
      getGitCloneFailureMessage(
        [
          'Cloning into \u001b[32morca\u001b[0m...\r',
          "fatal: destination path 'orca' already exists and is not an empty directory.\n"
        ].join('')
      )
    ).toBe("fatal: destination path 'orca' already exists and is not an empty directory.")
  })

  it('prefers the last fatal line over a trailing fragment', () => {
    expect(
      getGitCloneFailureMessage(
        "fatal: destination path 'orca' already exists and is not an empty directory.\r\nand the repository exists.\n"
      )
    ).toBe("fatal: destination path 'orca' already exists and is not an empty directory.")
  })

  it('falls back to the last non-empty line', () => {
    expect(getGitCloneFailureMessage('warning: retrying\nnetwork vanished\n')).toBe(
      'network vanished'
    )
  })
})

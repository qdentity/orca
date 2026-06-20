import { describe, expect, it } from 'vitest'
import { parseGitSubmoduleStatusOutput } from './git-submodule-status'

describe('parseGitSubmoduleStatusOutput', () => {
  it('parses clean, uninitialized, modified, and conflicted submodules', () => {
    expect(
      parseGitSubmoduleStatusOutput(
        [
          ' 1111111111111111111111111111111111111111 vendor/clean (heads/main)',
          '-2222222222222222222222222222222222222222 vendor/missing',
          '+3333333333333333333333333333333333333333 vendor/changed (remotes/origin/dev)',
          'U4444444444444444444444444444444444444444 vendor/conflict'
        ].join('\n')
      )
    ).toEqual([
      {
        path: 'vendor/clean',
        head: '1111111111111111111111111111111111111111',
        status: 'clean',
        description: 'heads/main'
      },
      {
        path: 'vendor/missing',
        head: '2222222222222222222222222222222222222222',
        status: 'uninitialized'
      },
      {
        path: 'vendor/changed',
        head: '3333333333333333333333333333333333333333',
        status: 'modified',
        description: 'remotes/origin/dev'
      },
      {
        path: 'vendor/conflict',
        head: '4444444444444444444444444444444444444444',
        status: 'conflict'
      }
    ])
  })
})

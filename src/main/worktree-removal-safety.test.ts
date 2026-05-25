import { describe, expect, it, vi } from 'vitest'
import type { GitWorktreeInfo } from '../shared/types'
import {
  canCleanupUnregisteredOrcaWorktreeDirectory,
  canSafelyRemoveOrphanedWorktreeDirectory,
  getRegisteredDeletableWorktree,
  isWorktreePathMissing,
  stripOrcaProvenanceMetaUpdates
} from './worktree-removal-safety'

function makeGitWorktree(path: string, isMainWorktree = false): GitWorktreeInfo {
  return {
    path,
    head: 'abc123',
    branch: isMainWorktree ? 'refs/heads/main' : `refs/heads/${path.split('/').at(-1)}`,
    isBare: false,
    isMainWorktree
  }
}

function missingPath(path: string): Error & { code: string } {
  return Object.assign(new Error(`missing ${path}`), { code: 'ENOENT' })
}

function makeStatPath(filePaths: readonly string[], directoryPaths: readonly string[] = []) {
  const files = new Set(filePaths)
  const directories = new Set(directoryPaths)
  return async (path: string) => {
    if (files.has(path)) {
      return { type: 'file' }
    }
    if (directories.has(path)) {
      return { type: 'directory' }
    }
    throw missingPath(path)
  }
}

function makeReadPath(entries: readonly (readonly [string, unknown])[]) {
  const files = new Map(entries)
  return async (path: string) => {
    if (!files.has(path)) {
      throw missingPath(path)
    }
    return files.get(path)
  }
}

async function withProcessPlatform<T>(
  platform: NodeJS.Platform,
  callback: () => Promise<T>
): Promise<T> {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    return await callback()
  } finally {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  }
}

describe('getRegisteredDeletableWorktree', () => {
  it('rejects deleting a worktree that contains another registered worktree', () => {
    expect(() =>
      getRegisteredDeletableWorktree('/repo', '/workspaces/parent', [
        makeGitWorktree('/repo', true),
        makeGitWorktree('/workspaces/parent'),
        makeGitWorktree('/workspaces/parent/child')
      ])
    ).toThrow(
      'Refusing to delete worktree because it contains another registered worktree: /workspaces/parent/child'
    )
  })

  it('does not reject sibling worktree paths that only share a prefix', () => {
    expect(
      getRegisteredDeletableWorktree('/repo', '/workspaces/parent', [
        makeGitWorktree('/repo', true),
        makeGitWorktree('/workspaces/parent'),
        makeGitWorktree('/workspaces/parent-copy')
      ])
    ).toMatchObject({ path: '/workspaces/parent' })
  })
})

describe('isWorktreePathMissing', () => {
  it('recognizes missing-path errors from local and remote stat providers', async () => {
    await expect(
      isWorktreePathMissing('/missing', async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
    ).resolves.toBe(true)

    await expect(
      isWorktreePathMissing('/missing', () => Promise.reject({ code: 'ENOTDIR' }))
    ).resolves.toBe(true)
  })

  it('does not classify existing paths or unrelated stat failures as missing', async () => {
    await expect(isWorktreePathMissing('/exists', async () => ({}))).resolves.toBe(false)

    await expect(
      isWorktreePathMissing('/unknown', async () => {
        throw new Error('permission denied')
      })
    ).resolves.toBe(false)
  })
})

describe('canSafelyRemoveOrphanedWorktreeDirectory', () => {
  it('accepts a linked worktree .git file that points at this repo worktrees entry', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        makeStatPath(['/workspaces/orphan/.git'], ['/repo/.git']),
        makeReadPath([
          ['/workspaces/orphan/.git', 'gitdir: /repo/.git/worktrees/orphan\n'],
          ['/repo/.git/worktrees/orphan/gitdir', '/workspaces/orphan/.git\n']
        ])
      )
    ).resolves.toBe(true)
  })

  it('accepts remote filesystem provider readFile results for linked worktree .git files', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        makeStatPath(['/workspaces/orphan/.git'], ['/repo/.git']),
        makeReadPath([
          [
            '/workspaces/orphan/.git',
            { isBinary: false, content: 'gitdir: /repo/.git/worktrees/orphan\n' }
          ],
          [
            '/repo/.git/worktrees/orphan/gitdir',
            { isBinary: false, content: '/workspaces/orphan/.git\n' }
          ]
        ])
      )
    ).resolves.toBe(true)
  })

  it('preserves forward-slash UNC roots when probing linked worktree .git files', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '//Server/Share/orphan',
        '//Server/Repo',
        makeStatPath(['\\\\Server\\Share\\orphan\\.git'], ['\\\\Server\\Repo\\.git']),
        makeReadPath([
          ['\\\\Server\\Share\\orphan\\.git', 'gitdir: //Server/Repo/.git/worktrees/orphan\n'],
          ['\\\\Server\\Repo\\.git\\worktrees\\orphan\\gitdir', '//Server/Share/orphan/.git\n']
        ])
      )
    ).resolves.toBe(true)
  })

  it('rejects a plain .git directory for unregistered cleanup', async () => {
    const readPath = vi.fn()

    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        async () => ({ type: 'directory' }),
        readPath
      )
    ).resolves.toBe(false)

    expect(readPath).not.toHaveBeenCalled()
  })

  it('rejects a gitdir file that points outside this repo worktrees directory', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        makeStatPath(['/workspaces/orphan/.git'], ['/repo/.git']),
        makeReadPath([
          [
            '/workspaces/orphan/.git',
            { isBinary: false, content: 'gitdir: /other/.git/worktrees/orphan\n' }
          ]
        ])
      )
    ).resolves.toBe(false)
  })

  it('rejects a copied .git file when the admin entry points at another candidate path', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/reused',
        '/repo',
        makeStatPath(['/workspaces/reused/.git'], ['/repo/.git']),
        makeReadPath([
          ['/workspaces/reused/.git', 'gitdir: /repo/.git/worktrees/other\n'],
          ['/repo/.git/worktrees/other/gitdir', '/workspaces/other/.git\n']
        ])
      )
    ).resolves.toBe(false)
  })

  it('rejects POSIX admin backlinks that differ only by case', async () => {
    await withProcessPlatform('win32', async () => {
      await expect(
        canSafelyRemoveOrphanedWorktreeDirectory(
          '/workspaces/reused',
          '/repo',
          makeStatPath(['/workspaces/reused/.git'], ['/repo/.git']),
          makeReadPath([
            ['/workspaces/reused/.git', 'gitdir: /repo/.git/worktrees/reused\n'],
            ['/repo/.git/worktrees/reused/gitdir', '/workspaces/Reused/.git\n']
          ])
        )
      ).resolves.toBe(false)
    })
  })

  it('accepts a pruned admin entry when the candidate .git points under this repo worktrees dir', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        makeStatPath(['/workspaces/orphan/.git'], ['/repo/.git']),
        makeReadPath([['/workspaces/orphan/.git', 'gitdir: /repo/.git/worktrees/orphan\n']])
      )
    ).resolves.toBe(true)
  })

  it('rejects existing admin entries with a missing gitdir backlink', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        makeStatPath(['/workspaces/orphan/.git'], ['/repo/.git', '/repo/.git/worktrees/orphan']),
        makeReadPath([['/workspaces/orphan/.git', 'gitdir: /repo/.git/worktrees/orphan\n']])
      )
    ).resolves.toBe(false)
  })

  it('rejects symlink .git entries from remote lstat-shaped providers', async () => {
    const readPath = vi.fn()

    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        async () => ({ type: 'symlink' }),
        readPath
      )
    ).resolves.toBe(false)

    expect(readPath).not.toHaveBeenCalled()
  })

  it('rejects separate-git-dir sibling repos when the admin gitdir is missing', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repo',
        makeStatPath(['/workspaces/orphan/.git', '/repo/.git']),
        makeReadPath([
          ['/workspaces/orphan/.git', 'gitdir: /git/other.git\n'],
          ['/repo/.git', 'gitdir: /git/repo.git\n']
        ])
      )
    ).resolves.toBe(false)
  })

  it('rejects separate git dirs under worktrees when the admin gitdir is missing', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/reused',
        '/repo',
        makeStatPath(['/workspaces/reused/.git', '/repo/.git']),
        makeReadPath([
          ['/workspaces/reused/.git', 'gitdir: /git/worktrees/other.git\n'],
          ['/repo/.git', 'gitdir: /git/worktrees/repo.git\n']
        ])
      )
    ).resolves.toBe(false)
  })

  it('accepts a repo path that is itself a linked worktree', async () => {
    await expect(
      canSafelyRemoveOrphanedWorktreeDirectory(
        '/workspaces/orphan',
        '/repos/main-linked',
        makeStatPath(['/workspaces/orphan/.git', '/repos/main-linked/.git']),
        makeReadPath([
          ['/workspaces/orphan/.git', 'gitdir: /common/.git/worktrees/orphan\n'],
          ['/repos/main-linked/.git', 'gitdir: /common/.git/worktrees/main-linked\n'],
          ['/common/.git/worktrees/main-linked/gitdir', '/repos/main-linked/.git\n'],
          ['/common/.git/worktrees/orphan/gitdir', '/workspaces/orphan/.git\n']
        ])
      )
    ).resolves.toBe(true)
  })
})

describe('canCleanupUnregisteredOrcaWorktreeDirectory', () => {
  it('does not treat orcaCreatedAt alone as cleanup authority', () => {
    expect(canCleanupUnregisteredOrcaWorktreeDirectory({ orcaCreatedAt: Date.now() })).toBe(false)
    expect(
      canCleanupUnregisteredOrcaWorktreeDirectory({
        orcaCreatedAt: Date.now(),
        orcaCreationSource: 'runtime'
      })
    ).toBe(true)
  })
})

describe('stripOrcaProvenanceMetaUpdates', () => {
  it('removes Orca-owned provenance fields from user metadata updates', () => {
    expect(
      stripOrcaProvenanceMetaUpdates({
        comment: 'keep me',
        orcaCreatedAt: 123,
        orcaCreationSource: 'desktop',
        orcaCreationWorkspaceLayout: { path: '/workspace', nestWorkspaces: false }
      })
    ).toEqual({ comment: 'keep me' })
  })
})

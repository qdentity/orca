import type { Repo, WorkspaceSessionState } from './types'
import { getRepoIdFromWorktreeId } from './worktree-id'

type RepoConnection = Pick<Repo, 'id' | 'connectionId'>

export function pruneLocalTerminalScrollbackBuffers(
  session: WorkspaceSessionState,
  repos: readonly RepoConnection[]
): WorkspaceSessionState {
  const connectionIdByRepoId = new Map(repos.map((repo) => [repo.id, repo.connectionId] as const))
  const worktreeIdByTabId = new Map<string, string>()
  for (const [worktreeId, tabs] of Object.entries(session.tabsByWorktree)) {
    for (const tab of tabs) {
      worktreeIdByTabId.set(tab.id, worktreeId)
    }
  }

  let terminalLayoutsByTabId: WorkspaceSessionState['terminalLayoutsByTabId'] | null = null
  for (const [tabId, layout] of Object.entries(session.terminalLayoutsByTabId)) {
    if (!layout.buffersByLeafId) {
      continue
    }
    const worktreeId = worktreeIdByTabId.get(tabId)
    if (worktreeId !== undefined) {
      const repoId = getRepoIdFromWorktreeId(worktreeId)
      const connectionId = connectionIdByRepoId.get(repoId)
      if (connectionId) {
        continue
      }
      if (repos.length === 0 && !connectionIdByRepoId.has(repoId)) {
        // Why: early session writes can run before the repo catalog hydrates.
        // Preserve unknown worktree buffers until a later call can classify
        // them as local or SSH-backed.
        continue
      }
    }

    terminalLayoutsByTabId ??= { ...session.terminalLayoutsByTabId }
    const layoutWithoutBuffers = { ...layout }
    delete layoutWithoutBuffers.buffersByLeafId
    terminalLayoutsByTabId[tabId] = layoutWithoutBuffers
  }

  if (!terminalLayoutsByTabId) {
    return session
  }

  return {
    ...session,
    // Why: local daemon history/checkpoints are authoritative for restart
    // scrollback. Keeping renderer-captured buffers for local tabs makes every
    // persisted state write scale with old terminal output; SSH keeps them
    // because relay teardown may leave no local history to cold-restore.
    terminalLayoutsByTabId
  }
}

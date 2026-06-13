import { describe, expect, it } from 'vitest'
import type { TaskSourceContext } from '../../../../shared/task-source-context'
import { getAutomationSourceDisplay } from './automation-source-display'

describe('automation source display', () => {
  it('summarizes repo-backed source context separately from run location', () => {
    const sourceContext: TaskSourceContext = {
      kind: 'task-source',
      provider: 'github',
      hostId: 'ssh:devbox',
      projectId: 'github:stablyai/orca',
      projectHostSetupId: 'setup-devbox',
      repoId: 'repo-devbox',
      accountLabel: 'dev@example.com',
      providerIdentity: {
        provider: 'github',
        owner: 'stablyai',
        repo: 'orca'
      }
    }

    expect(getAutomationSourceDisplay(sourceContext)).toEqual({
      label: 'GitHub · devbox · stablyai/orca',
      title: 'GitHub source · Host: devbox · Account: dev@example.com · Source: stablyai/orca'
    })
  })

  it('uses account identity for Linear sources', () => {
    const sourceContext: TaskSourceContext = {
      kind: 'task-source',
      provider: 'linear',
      hostId: 'local',
      projectId: 'repo-1',
      projectHostSetupId: 'setup-local',
      repoId: 'repo-1',
      accountLabel: 'Linear API key',
      providerIdentity: {
        provider: 'linear',
        workspaceId: 'legacy',
        workspaceName: 'Saved Linear workspace'
      }
    }

    expect(getAutomationSourceDisplay(sourceContext)).toEqual({
      label: 'Linear · Local Mac · Saved Linear workspace',
      title:
        'Linear source · Host: Local Mac · Account: Linear API key · Source: Saved Linear workspace'
    })
  })

  it('returns null when no source context is saved', () => {
    expect(getAutomationSourceDisplay(null)).toBeNull()
  })
})

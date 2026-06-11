import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project, ProjectHostSetup } from '../../../../shared/types'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'
import { createTestStore } from './store-test-helpers'

const projectsCreateHostSetup = vi.fn()
const projectsUpdateHostSetup = vi.fn()
const projectsDeleteHostSetup = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

const project: Project = {
  id: 'project-1',
  displayName: 'Project',
  badgeColor: '#000',
  sourceRepoIds: ['local-repo'],
  createdAt: 1,
  updatedAt: 1
}

const runtimeSetup: ProjectHostSetup = {
  id: 'setup-gpu',
  projectId: project.id,
  hostId: 'runtime:env-1',
  repoId: '',
  path: '/srv/project',
  displayName: 'GPU VM',
  setupState: 'ready',
  setupMethod: 'provisioned',
  createdAt: 1,
  updatedAt: 1
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  projectsCreateHostSetup.mockReset()
  projectsUpdateHostSetup.mockReset()
  projectsDeleteHostSetup.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      projects: {
        createHostSetup: projectsCreateHostSetup,
        updateHostSetup: projectsUpdateHostSetup,
        deleteHostSetup: projectsDeleteHostSetup
      },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

describe('repo slice project host setup lifecycle', () => {
  it('creates independent project host setup metadata through local IPC', async () => {
    const setup: ProjectHostSetup = {
      ...runtimeSetup,
      hostId: 'local',
      path: '',
      setupState: 'setting-up'
    }
    projectsCreateHostSetup.mockResolvedValue({ project, setup })
    const store = createTestStore()

    await expect(
      store.getState().createProjectHostSetup({
        projectId: project.id,
        hostId: 'local',
        setupId: setup.id,
        setupState: 'setting-up',
        setupMethod: 'provisioned'
      })
    ).resolves.toEqual({ project, setup })

    expect(store.getState().projects).toEqual([project])
    expect(store.getState().projectHostSetups).toEqual([setup])
    expect(projectsCreateHostSetup).toHaveBeenCalledWith({
      projectId: project.id,
      hostId: 'local',
      setupId: setup.id,
      setupState: 'setting-up',
      setupMethod: 'provisioned'
    })
  })

  it('updates runtime-owned project host setups through their owning runtime', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-update-setup',
      ok: true,
      result: {
        result: {
          project,
          setup: { ...runtimeSetup, displayName: 'GPU VM renamed' }
        }
      },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      projectHostSetups: [runtimeSetup],
      settings: { activeRuntimeEnvironmentId: null } as never
    })

    await expect(
      store.getState().updateProjectHostSetup({
        setupId: runtimeSetup.id,
        updates: { displayName: 'GPU VM renamed' }
      })
    ).resolves.toEqual({
      project,
      setup: { ...runtimeSetup, displayName: 'GPU VM renamed' },
      repo: undefined
    })

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'projectHostSetup.update',
      params: {
        setupId: runtimeSetup.id,
        updates: { displayName: 'GPU VM renamed' }
      },
      timeoutMs: 15_000
    })
  })

  it('deletes runtime-owned project host setups through their owning runtime', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-delete-setup',
      ok: true,
      result: { result: { project, setup: runtimeSetup } },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      projects: [project],
      projectHostSetups: [runtimeSetup],
      settings: { activeRuntimeEnvironmentId: null } as never
    })

    await expect(
      store.getState().deleteProjectHostSetup({ setupId: runtimeSetup.id })
    ).resolves.toEqual({
      project,
      setup: runtimeSetup,
      repo: undefined
    })

    expect(store.getState().projects).toEqual([project])
    expect(store.getState().projectHostSetups).toEqual([])
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'projectHostSetup.delete',
      params: { setupId: runtimeSetup.id },
      timeoutMs: 15_000
    })
  })
})

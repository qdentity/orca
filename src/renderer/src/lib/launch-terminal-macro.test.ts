import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  createTab: vi.fn(),
  setTabCustomTitle: vi.fn(),
  queueTabStartupCommand: vi.fn(),
  queueTabSetupSplit: vi.fn(),
  setActiveTabType: vi.fn(),
  setTabBarOrder: vi.fn(),
  tabsByWorktree: {
    'wt-1': [{ id: 'existing-tab' }, { id: 'tab-1' }]
  },
  openFiles: [{ id: 'editor-1', worktreeId: 'wt-1' }],
  browserTabsByWorktree: {
    'wt-1': [{ id: 'browser-1' }]
  },
  tabBarOrderByWorktree: {
    'wt-1': ['existing-tab', 'editor-1', 'browser-1']
  }
}

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => state
  }
}))

describe('launchTerminalMacro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.createTab.mockReturnValue({ id: 'tab-1', title: 'Terminal 1' })
  })

  it('creates a named tab and queues startup for tab macros', async () => {
    const { launchTerminalMacro } = await import('./launch-terminal-macro')

    const result = launchTerminalMacro({
      macro: {
        id: 'macro-1',
        name: 'Codex review',
        layout: 'tab',
        command: 'codex --model gpt-5.5',
        appendEnter: true
      },
      worktreeId: 'wt-1',
      groupId: 'group-1'
    })

    expect(state.createTab).toHaveBeenCalledWith('wt-1', 'group-1')
    expect(state.setTabCustomTitle).toHaveBeenCalledWith('tab-1', 'Codex review')
    expect(state.queueTabStartupCommand).toHaveBeenCalledWith('tab-1', {
      command: 'codex --model gpt-5.5\r'
    })
    expect(state.queueTabSetupSplit).not.toHaveBeenCalled()
    expect(state.setActiveTabType).toHaveBeenCalledWith('terminal')
    expect(state.setTabBarOrder).toHaveBeenCalledWith('wt-1', [
      'existing-tab',
      'editor-1',
      'browser-1',
      'tab-1'
    ])
    expect(result).toEqual({ tabId: 'tab-1' })
  })

  it('queues an initial split and sends startup only to the new split pane', async () => {
    const { launchTerminalMacro } = await import('./launch-terminal-macro')

    launchTerminalMacro({
      macro: {
        id: 'macro-2',
        name: 'Dev stack',
        layout: 'split-right',
        command: 'npm run dev',
        appendEnter: true
      },
      worktreeId: 'wt-1'
    })

    expect(state.queueTabStartupCommand).not.toHaveBeenCalled()
    expect(state.queueTabSetupSplit).toHaveBeenCalledWith('tab-1', {
      direction: 'vertical',
      command: 'npm run dev\r'
    })
  })

  it('returns null for blank names', async () => {
    const { launchTerminalMacro } = await import('./launch-terminal-macro')

    expect(
      launchTerminalMacro({
        macro: {
          id: 'macro-3',
          name: '   ',
          layout: 'tab',
          command: '',
          appendEnter: true
        },
        worktreeId: 'wt-1'
      })
    ).toBeNull()

    expect(state.createTab).not.toHaveBeenCalled()
  })
})

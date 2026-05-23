import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TerminalQuickCommand } from '../../../../shared/types'

type QuickCommandButtonState = {
  settings: {
    terminalQuickCommands: TerminalQuickCommand[]
  }
  recentQuickCommandIdByGroup: Record<string, string>
  updateSettings: (settings: unknown) => Promise<void>
  repos: { id: string }[]
}

const useAppStoreMock = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: QuickCommandButtonState) => unknown) => useAppStoreMock(selector)
}))

vi.mock('@/components/confirmation-dialog', () => ({
  useConfirmationDialog: () => async () => false
}))

vi.mock('@/components/ui/tooltip', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>
  return {
    Tooltip: Passthrough,
    TooltipTrigger: Passthrough,
    TooltipContent: () => null
  }
})

vi.mock('@/components/terminal-quick-commands/TerminalQuickCommandDialog', () => ({
  createTerminalQuickCommandDraft: (scope: unknown) => ({
    id: 'draft-command',
    label: '',
    command: '',
    scope
  }),
  TerminalQuickCommandDialog: () => null
}))

describe('TabBarQuickCommandsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStoreMock.mockImplementation((selector: (state: QuickCommandButtonState) => unknown) =>
      selector({
        settings: {
          terminalQuickCommands: []
        },
        repos: [{ id: 'repo-1' }],
        recentQuickCommandIdByGroup: {},
        updateSettings: async () => {}
      })
    )
  })

  it('renders the empty add-command trigger as a compact centered button', async () => {
    const { TabBarQuickCommandsButton } = await import('./TabBarQuickCommandsButton')
    const html = renderToStaticMarkup(
      <TabBarQuickCommandsButton worktreeId="repo-1" groupId="group-1" />
    )
    expect(html).toContain('Add command')

    const trigger = html.match(/<button[^>]+aria-label="Add quick command"[^>]*>.*?<\/button>/)
    expect(trigger).not.toBeNull()
    const triggerHtml = trigger?.[0] ?? ''
    expect(triggerHtml).toContain('data-size="xs"')
    expect(triggerHtml).toContain('h-7')
    expect(triggerHtml).toContain('items-center')
    expect(triggerHtml).toContain('leading-none')
  })
})

import { useAppStore } from '@/store'
import { reconcileTabOrder } from '@/components/tab-bar/reconcile-order'
import { buildTerminalMacroInput } from '../../../shared/terminal-macros'
import type { TerminalMacro } from '../../../shared/types'

type LaunchTerminalMacroArgs = {
  macro: TerminalMacro
  worktreeId: string
  groupId?: string
}

export function launchTerminalMacro({
  macro,
  worktreeId,
  groupId
}: LaunchTerminalMacroArgs): { tabId: string } | null {
  const store = useAppStore.getState()
  const name = macro.name.trim()
  if (!name) {
    return null
  }

  const tab = store.createTab(worktreeId, groupId)
  store.setTabCustomTitle(tab.id, name)

  const command = macro.command.trimEnd()
  if (command && macro.layout === 'tab') {
    store.queueTabStartupCommand(tab.id, {
      command: buildTerminalMacroInput(command, macro.appendEnter !== false)
    })
  }

  if (macro.layout === 'split-right' || macro.layout === 'split-down') {
    store.queueTabSetupSplit(tab.id, {
      direction: macro.layout === 'split-right' ? 'vertical' : 'horizontal',
      ...(command
        ? {
            command: buildTerminalMacroInput(command, macro.appendEnter !== false)
          }
        : {})
    })
  }

  // Why: macro launches should surface the new terminal immediately even when
  // the user currently has an editor/browser active in the same worktree.
  store.setActiveTabType('terminal')

  const fresh = useAppStore.getState()
  const termIds = (fresh.tabsByWorktree[worktreeId] ?? []).map((entry) => entry.id)
  const editorIds = fresh.openFiles
    .filter((file) => file.worktreeId === worktreeId)
    .map((f) => f.id)
  const browserIds = (fresh.browserTabsByWorktree?.[worktreeId] ?? []).map((entry) => entry.id)
  const base = reconcileTabOrder(
    fresh.tabBarOrderByWorktree[worktreeId],
    termIds,
    editorIds,
    browserIds
  )
  const order = base.filter((id) => id !== tab.id)
  order.push(tab.id)
  fresh.setTabBarOrder(worktreeId, order)

  return { tabId: tab.id }
}

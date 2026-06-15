import React, { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceStatusDefinition } from '../../../../shared/types'
import WorkspaceKanbanSettingsMenu from './WorkspaceKanbanSettingsMenu'

type InspectableProps = {
  children?: React.ReactNode
  'aria-label'?: string
  onCheckedChange?: (checked: boolean | 'indeterminate') => void
}

const statuses: WorkspaceStatusDefinition[] = [{ id: 'todo', label: 'Todo' }]

function findElement(
  node: React.ReactNode,
  predicate: (props: InspectableProps) => boolean
): React.ReactElement<InspectableProps> | null {
  if (!isValidElement<InspectableProps>(node)) {
    return null
  }
  if (predicate(node.props)) {
    return node
  }
  let match: React.ReactElement<InspectableProps> | null = null
  React.Children.forEach(node.props.children, (child) => {
    if (match) {
      return
    }
    match = findElement(child, predicate)
  })
  return match
}

function renderMenu(onSyncTaskStatusFromWorkspaceBoardChange = vi.fn()): React.ReactElement {
  return WorkspaceKanbanSettingsMenu({
    workspaceStatuses: statuses,
    syncTaskStatusFromWorkspaceBoard: false,
    onSyncTaskStatusFromWorkspaceBoardChange,
    onRenameStatus: vi.fn(),
    onChangeStatusColor: vi.fn(),
    onChangeStatusIcon: vi.fn(),
    onMoveStatus: vi.fn(),
    onRemoveStatus: vi.fn(),
    onAddStatus: vi.fn()
  })
}

describe('WorkspaceKanbanSettingsMenu', () => {
  it('renders the Linear status sync toggle and forwards changes', () => {
    const onChange = vi.fn()
    const toggle = findElement(
      renderMenu(onChange),
      (props) => props['aria-label'] === 'Sync Linear status from workspace board'
    )

    expect(toggle).not.toBeNull()

    toggle?.props.onCheckedChange?.(true)
    toggle?.props.onCheckedChange?.('indeterminate')

    expect(onChange).toHaveBeenNthCalledWith(1, true)
    expect(onChange).toHaveBeenNthCalledWith(2, false)
  })
})

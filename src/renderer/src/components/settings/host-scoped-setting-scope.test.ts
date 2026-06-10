import { describe, expect, it } from 'vitest'
import {
  buildHostScopeChoices,
  CLIENT_DEFAULT_SCOPE,
  isHostScope
} from './host-scoped-setting-scope'
import type { SidebarHostOption } from '../sidebar/sidebar-host-options'

function host(id: SidebarHostOption['id'], label: string): SidebarHostOption {
  return { id, label, detail: '', kind: id === 'local' ? 'local' : 'ssh', health: 'available' }
}

describe('buildHostScopeChoices', () => {
  it('lists the client default first, then non-local hosts', () => {
    const choices = buildHostScopeChoices(
      [host('local', 'Local Mac'), host('ssh:box', 'Box'), host('runtime:env', 'Server')],
      'Client default'
    )
    expect(choices).toEqual([
      { scope: CLIENT_DEFAULT_SCOPE, label: 'Client default' },
      { scope: 'ssh:box', label: 'Box' },
      { scope: 'runtime:env', label: 'Server' }
    ])
  })

  it('excludes the local host', () => {
    const choices = buildHostScopeChoices([host('local', 'Local Mac')], 'Client default')
    expect(choices).toEqual([{ scope: CLIENT_DEFAULT_SCOPE, label: 'Client default' }])
  })
})

describe('isHostScope', () => {
  it('is false for the client default sentinel', () => {
    expect(isHostScope(CLIENT_DEFAULT_SCOPE)).toBe(false)
  })

  it('is true for a real host id', () => {
    expect(isHostScope('ssh:box')).toBe(true)
  })
})

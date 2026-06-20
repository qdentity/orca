import { execFile } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import type { Page } from '@playwright/test'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd })
}

async function openSourceControl(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store?.getState()
    state?.setRightSidebarOpen(true)
    state?.setRightSidebarTab('source-control')
  })
  await expect(page.getByRole('button', { name: /Source Control/ })).toBeVisible()
}

async function getActiveWorktreePath(page: Page): Promise<string> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state?.activeWorktreeId) {
      throw new Error('active worktree is not set')
    }
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)
    if (!worktree) {
      throw new Error('active worktree not found')
    }
    return worktree.path
  })
}

async function refreshSourceControlStatus(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const state = store.getState()
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)
    if (!worktree) {
      throw new Error('active worktree not found')
    }
    const status = await window.api.git.status({ worktreePath: worktree.path })
    state.setGitStatus(worktree.id, status)
  })
}

async function createCommittedSubmodule(
  worktreePath: string
): Promise<{ libraryPath: string; submodulePath: string }> {
  const libraryPath = await mkdtemp(path.join(tmpdir(), 'orca-e2e-submodule-lib-'))
  await git(libraryPath, ['init', '-q'])
  await git(libraryPath, ['config', 'user.email', 'e2e@test.local'])
  await git(libraryPath, ['config', 'user.name', 'E2E Test'])
  await writeFile(path.join(libraryPath, 'README.md'), 'submodule library\n')
  await git(libraryPath, ['add', 'README.md'])
  await git(libraryPath, ['commit', '-qm', 'init submodule library'])

  const submodulePath = `vendor/e2e-submodule-${Date.now()}`
  await git(worktreePath, [
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    '-q',
    libraryPath,
    submodulePath
  ])
  await git(worktreePath, ['commit', '-qm', 'add e2e submodule'])
  return { libraryPath, submodulePath }
}

test.describe('Source Control submodules', () => {
  let libraryPath: string | null = null

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test.afterEach(async () => {
    if (libraryPath) {
      await rm(libraryPath, { recursive: true, force: true })
      libraryPath = null
    }
  })

  test('shows clean committed submodules from real git status in Electron', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    const created = await createCommittedSubmodule(worktreePath)
    libraryPath = created.libraryPath
    const submodulePath = created.submodulePath

    const statusSnapshot = await orcaPage.evaluate(async (worktreePath) => {
      const status = await window.api.git.status({ worktreePath })
      return {
        entries: status.entries,
        submodules: status.submodules ?? []
      }
    }, worktreePath)
    expect(statusSnapshot.entries).toEqual([])
    expect(statusSnapshot.submodules).toEqual([
      expect.objectContaining({ path: submodulePath, status: 'clean' })
    ])

    await refreshSourceControlStatus(orcaPage)
    await openSourceControl(orcaPage)

    await expect(orcaPage.getByText('Submodules')).toBeVisible()
    const row = orcaPage.locator(`[data-source-control-submodule-path="${submodulePath}"]`)
    await expect(row).toBeVisible()
    await expect(row).toContainText(path.basename(submodulePath))
    await expect(row).toContainText('vendor')
    await expect(orcaPage.getByText('No changes on this branch')).toHaveCount(0)

    await orcaPage.getByTestId('source-control-filter-toggle').click()
    await orcaPage.getByPlaceholder(/Filter files/).fill(path.basename(submodulePath))
    await expect(row).toBeVisible()
    await orcaPage.getByPlaceholder(/Filter files/).fill('definitely-no-submodule-match')
    await expect(row).toHaveCount(0)
    await expect(orcaPage.getByText('No matching files')).toBeVisible()
  })
})

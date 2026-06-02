import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { getStoreState, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const CHECKLIST_TEXT = 'Onboarding checklist'

type SetupGuideFlashMonitor = {
  samples: number[]
  stop: () => number[]
}

test.describe('Setup guide sidebar entry', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('does not flash while navigating after the checklist is hidden', async ({ orcaPage }) => {
    await hideSetupGuideFromSidebar(orcaPage)
    await expect(orcaPage.getByText(CHECKLIST_TEXT)).toHaveCount(0)

    await startSetupGuideFlashMonitor(orcaPage)

    await orcaPage
      .getByRole('button', { name: /^Tasks/ })
      .first()
      .click()
    await expect
      .poll(async () => getStoreState<string>(orcaPage, 'activeView'), { timeout: 5_000 })
      .toBe('tasks')
    await orcaPage.waitForTimeout(500)

    await orcaPage.getByRole('button', { name: /^Automations$/ }).click()
    await expect
      .poll(async () => getStoreState<string>(orcaPage, 'activeView'), { timeout: 5_000 })
      .toBe('automations')
    await orcaPage.waitForTimeout(500)

    await orcaPage.getByRole('button', { name: /^Orca Mobile/ }).click()
    await expect
      .poll(async () => getStoreState<string>(orcaPage, 'activeView'), { timeout: 5_000 })
      .toBe('mobile')
    await orcaPage.waitForTimeout(500)

    const flashSamples = await stopSetupGuideFlashMonitor(orcaPage)
    expect(flashSamples, `setup guide sidebar flashed at ${flashSamples.join(', ')}`).toEqual([])
    await expect(orcaPage.getByText(CHECKLIST_TEXT)).toHaveCount(0)
  })
})

async function hideSetupGuideFromSidebar(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    store.getState().openModal('setup-guide', {
      setupStepId: 'agent-capabilities',
      telemetrySource: 'e2e'
    })
  })
  const dialog = page.getByRole('dialog', { name: 'Getting started' })
  await expect(dialog).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Hide checklist from sidebar' }).click()
  await expect
    .poll(async () => getStoreState<boolean>(page, 'setupGuideSidebarDismissed'), {
      timeout: 5_000
    })
    .toBe(true)

  await page.getByRole('button', { name: /^Close$/ }).click()
  await expect(dialog).toHaveCount(0)
}

async function startSetupGuideFlashMonitor(page: Page): Promise<void> {
  await page.evaluate((text) => {
    const monitoredWindow = window as Window & {
      __setupGuideFlashMonitor?: SetupGuideFlashMonitor
    }
    monitoredWindow.__setupGuideFlashMonitor?.stop()

    const samples: number[] = []
    let rafId = 0
    const isChecklistVisible = (): boolean =>
      Array.from(document.querySelectorAll('button,[role="button"],a,div,span')).some((element) => {
        if (!element.textContent?.includes(text)) {
          return false
        }
        if (element.getClientRects().length === 0) {
          return false
        }
        const style = window.getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
      })

    const record = (): void => {
      if (isChecklistVisible()) {
        samples.push(Math.round(performance.now()))
      }
    }
    const observer = new MutationObserver(record)
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    })
    const sampleFrame = (): void => {
      record()
      rafId = requestAnimationFrame(sampleFrame)
    }
    sampleFrame()

    monitoredWindow.__setupGuideFlashMonitor = {
      samples,
      stop: () => {
        cancelAnimationFrame(rafId)
        observer.disconnect()
        record()
        return samples
      }
    }
  }, CHECKLIST_TEXT)
}

async function stopSetupGuideFlashMonitor(page: Page): Promise<number[]> {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __setupGuideFlashMonitor?: SetupGuideFlashMonitor
        }
      ).__setupGuideFlashMonitor?.stop() ?? []
  )
}

import { describe, expect, it } from 'vitest'
import type { OnboardingState } from '../../../../shared/types'
import { shouldCloseAppModalForOnboarding, shouldShowOnboarding } from './should-show-onboarding'

function makeOnboarding(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    closedAt: null,
    outcome: null,
    lastCompletedStep: -1,
    checklist: {
      addedRepo: false,
      choseAgent: false,
      ranFirstAgent: false,
      ranSecondAgentOnSameTask: false,
      triedCmdJ: false,
      shapedSidebar: false,
      reviewedDiff: false,
      openedPr: false,
      addedFolder: false,
      openedFile: false,
      ranAgentOnFile: false,
      dismissed: false
    },
    ...overrides
  }
}

describe('shouldShowOnboarding', () => {
  it('shows onboarding until it has a closed timestamp', () => {
    expect(shouldShowOnboarding(makeOnboarding())).toBe(true)
    expect(shouldShowOnboarding(makeOnboarding({ closedAt: 123 }))).toBe(false)
    expect(shouldShowOnboarding(null)).toBe(false)
  })
})

describe('shouldCloseAppModalForOnboarding', () => {
  it('closes app modals while first-run onboarding owns the screen', () => {
    expect(
      shouldCloseAppModalForOnboarding({
        onboarding: makeOnboarding(),
        onboardingSettingsDetour: false,
        activeModal: 'feature-tips'
      })
    ).toBe(true)
  })

  it('keeps modals when onboarding is closed, absent, detoured, or no modal is active', () => {
    expect(
      shouldCloseAppModalForOnboarding({
        onboarding: makeOnboarding({ closedAt: 123 }),
        onboardingSettingsDetour: false,
        activeModal: 'feature-tips'
      })
    ).toBe(false)
    expect(
      shouldCloseAppModalForOnboarding({
        onboarding: null,
        onboardingSettingsDetour: false,
        activeModal: 'feature-tips'
      })
    ).toBe(false)
    expect(
      shouldCloseAppModalForOnboarding({
        onboarding: makeOnboarding(),
        onboardingSettingsDetour: true,
        activeModal: 'feature-tips'
      })
    ).toBe(false)
    expect(
      shouldCloseAppModalForOnboarding({
        onboarding: makeOnboarding(),
        onboardingSettingsDetour: false,
        activeModal: 'none'
      })
    ).toBe(false)
  })
})

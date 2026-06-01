import type { OnboardingState } from '../../../../shared/types'

// Why: split out so App.tsx can gate the lazy <OnboardingFlow> without an
// eager static import path that pulls the whole flow into the main chunk.
export function shouldShowOnboarding(onboarding: OnboardingState | null): boolean {
  return onboarding !== null && onboarding.closedAt === null
}

export function shouldCloseAppModalForOnboarding(args: {
  onboarding: OnboardingState | null
  onboardingSettingsDetour: boolean
  activeModal: string
}): boolean {
  return (
    shouldShowOnboarding(args.onboarding) &&
    !args.onboardingSettingsDetour &&
    args.activeModal !== 'none'
  )
}

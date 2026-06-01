import { useAppStore } from '@/store'
import { requestContextualTourWhenReady } from './request-contextual-tour-when-ready'

export function openWorkspaceCreationComposerWithTourHandoff(): void {
  const state = useAppStore.getState()
  if (state.repos.length === 0) {
    return
  }

  const shouldHandoffFromAgentSessionsTour =
    state.activeContextualTourId === 'workspace-agent-sessions' &&
    state.activeContextualTourStepIndex === 1

  if (shouldHandoffFromAgentSessionsTour && state.activeContextualTourSource) {
    // Why: the composer modal cancels the terminal-owned tour; detaching first
    // prevents the source cleanup from treating this intentional handoff as suppression.
    state.detachContextualTourSource('workspace-agent-sessions', state.activeContextualTourSource)
  }

  state.openModal('new-workspace-composer', {
    telemetrySource: 'sidebar',
    ...(shouldHandoffFromAgentSessionsTour
      ? { contextualTourSource: 'workspace_creation_modal' }
      : {})
  })

  if (!shouldHandoffFromAgentSessionsTour) {
    return
  }

  if (state.contextualToursSeenIds.includes('workspace-creation')) {
    return
  }

  requestContextualTourWhenReady({
    id: 'workspace-creation',
    source: 'workspace_creation_modal',
    wasFeaturePreviouslyInteracted: false,
    waitForActiveTourToClear: true,
    shouldContinue: () => useAppStore.getState().activeModal === 'new-workspace-composer'
  })
}

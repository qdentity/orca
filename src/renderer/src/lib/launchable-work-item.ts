import type { LinkedWorkItemContext } from '@/lib/linked-work-item-context'
import type { TuiAgent, WorkspaceCreateTelemetrySource } from '../../../shared/types'
import type { LaunchSource } from '../../../shared/telemetry-events'

export type LaunchableWorkItem = {
  title: string
  url: string
  type: 'issue' | 'pr' | 'mr'
  number: number | null
  repoId?: string
  /** Content to paste into the agent's input. Defaults to the URL when omitted. */
  pasteContent?: string
  /** Linear identifier (e.g. "ENG-123") when the work item originates from
   *  Linear. Persisted to worktree meta as `linkedLinearIssue` so the sidebar
   *  and other surfaces can surface the Linear link. Linear issues also pass
   *  `type: 'issue'` / `number: null` to reuse the GitHub draft-paste flow,
   *  so this field is the only signal that the worktree is Linear-linked. */
  linearIdentifier?: string
  linkedContext?: LinkedWorkItemContext
}

export type LaunchWorkItemDirectArgs = {
  item: LaunchableWorkItem
  repoId: string
  /** Called when the flow cannot proceed without user input (setup policy is
   *  `ask`, or the selected repo cannot resolve). Callers wire this to the
   *  existing modal opener so the user still gets a path forward. */
  openModalFallback: () => void
  /** Optional base branch to start the worktree from. When omitted the
   *  worktree inherits the repo's effective base ref. Used by the
   *  smart workspace-name PR selection to branch from the PR's head so the first
   *  commit lands on the correct base without the user touching the UI. */
  baseBranch?: string
  /** Telemetry surface that initiated this agent launch. Threaded into
   *  the queued startup payload so `agent_started.launch_source` reflects
   *  the actual entry point. */
  launchSource: LaunchSource
  /** Telemetry surface that initiated this launch. Threaded into
   *  `createWorktree` so `workspace_created.source` reflects the actual
   *  entry point (Tasks page row → `sidebar`, Create-from modal →
   *  `command_palette`). Omitted callers default to `unknown`. */
  telemetrySource?: WorkspaceCreateTelemetrySource
  /** Explicit agent chosen by an action-time composer. When unavailable after
   *  workspace creation, Orca must not fall back to a different agent. */
  agentOverride?: TuiAgent
  /** Optional CLI arguments appended to the selected agent command. */
  agentArgs?: string | null
  /** Controls whether pasted work-item content remains editable or starts the
   *  agent immediately after the TUI is ready. */
  promptDelivery?: 'draft' | 'submit-after-ready'
  /** Shell platform for the host that will execute the startup command. */
  launchPlatform?: NodeJS.Platform
}

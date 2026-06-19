export type ComposerBranchSelection = {
  baseBranch: string
  branchNameOverride: string | undefined
  branchAutoName: string
  name: string | undefined
  lastAutoName: string | undefined
}

export function resolveComposerBranchSelection(args: {
  refName: string
  localBranchName: string
  currentName: string
  lastAutoName: string
}): ComposerBranchSelection {
  const trimmedCurrentName = args.currentName.trim()
  const shouldAutoName =
    !trimmedCurrentName ||
    args.currentName === args.lastAutoName ||
    args.localBranchName.startsWith(trimmedCurrentName) ||
    args.refName.startsWith(trimmedCurrentName)
  if (!shouldAutoName) {
    return {
      baseBranch: args.refName,
      branchNameOverride: undefined,
      branchAutoName: '',
      name: undefined,
      lastAutoName: undefined
    }
  }
  return {
    baseBranch: args.refName,
    branchNameOverride: args.localBranchName,
    branchAutoName: args.localBranchName,
    name: args.localBranchName,
    lastAutoName: args.localBranchName
  }
}

/**
 * Issue #5181: decide whether a picked branch row is an existing LOCAL branch
 * that can be reused (checked out) instead of branched off, and whether reuse
 * should default ON.
 *
 * A branch is local when its ref and local name match — remote-only refs carry
 * an `origin/`-style prefix (e.g. refName `origin/foo`, localBranchName `foo`),
 * so they are not reusable as-is. Reuse defaults ON only when the worktree name
 * was auto-derived from the branch (the selection produced a branch-name
 * override); a user who typed a custom worktree name first is branching off the
 * ref, so reuse stays OFF unless they opt in.
 */
export function resolveComposerBranchReuse(args: {
  refName: string
  localBranchName: string
  selectionProducedOverride: boolean
}): { reuseEligibleBranch: string | null; defaultReuse: boolean } {
  const reuseEligibleBranch = args.refName === args.localBranchName ? args.localBranchName : null
  return {
    reuseEligibleBranch,
    defaultReuse: reuseEligibleBranch !== null && args.selectionProducedOverride
  }
}

export function resolveComposerBranchNameOverrideForCreate(args: {
  branchNameOverride: string | undefined
  branchAutoName: string
  workspaceName: string
  preserveWorkspaceNameEdits: boolean
}): string | undefined {
  if (!args.branchNameOverride) {
    return undefined
  }
  if (args.preserveWorkspaceNameEdits) {
    return args.branchNameOverride
  }
  return args.workspaceName === args.branchAutoName ? args.branchNameOverride : undefined
}

# Detect GitHub PR URLs With Trailing Page Segments

## Problem

`Cmd+N` smart-name parsing currently rejects GitHub item URLs when anything follows the numeric segment, e.g. `https://github.com/stablyai/orca/pull/1965/changes`.

Current regexes in `src/renderer/src/lib/github-links.ts` only accept:
- `/<owner>/<repo>/(issues|pull)/<number>`
- optional final `/`

So `.../pull/1965/changes`, `.../issues/923/comments`, etc. fail to parse.

## Verified Impacted Surfaces

Parser changes affect all callers of `github-links.ts`:
- `SmartWorkspaceNameField` (`Cmd+N` GitHub detection and direct lookup)
- `WorktreeJumpPalette` (`Cmd+J` create-from-query URL path)
- `useComposerState` (`@` link popover direct-number extraction)
- `WorktreeMetaDialog` (issue field URL validation/open-link behavior)

Important nuance:
- `useComposerState` does not use URL slug/type for fetch. It only uses `normalizeGitHubLinkQuery(...).directNumber` and calls `gh.workItem` against the selected repo.
- `WorktreeMetaDialog` only accepts explicit **issue** URLs for open-link (`parseExplicitGitHubIssueUrl`), even though number parsing accepts issue or PR URLs.

## Root Cause

- `GH_ITEM_PATH_RE` and `GH_ITEM_PATH_FULL_RE` terminate at `(?:/)?$`, so `<number>` must be terminal.
- `parseGitHubIssueOrPRLink` derives `type` via `pathname.includes('/pull/')` instead of the parsed route segment.

## Required Parser Behavior

1. Accept optional trailing segments after `<number>`.
2. Derive `type` from captured route segment (`issues|pull`), not `includes`.
3. Keep host allowlist as-is: `github.com`, `www.github.com`.
4. Keep strict numeric ID (`\d+`) immediately after `/issues/` or `/pull/`.
5. Normalize trailing slashes before match so `.../pull/1965//changes/` still parses.

Suggested single-path matcher:
- Normalize: `const pathname = url.pathname.replace(/\/+$/, '')`
- Match: `^/([^/]+)/([^/]+)/(issues|pull)/(\d+)(?:/.*)?$`

## Feasibility / Cost

- Parse is local and cheap.
- Resolution is network/CLI-backed through IPC and can fail or race.
- This change increases how often direct lookup code paths run after paste/type; it is not "free".

## Consistency / Concurrency

- `SmartWorkspaceNameField` and `useComposerState` already use stale/cancel guards; this remains sufficient for this change.
- No new multi-window invalidation concerns are introduced by parser broadening alone.
- Existing ambiguity remains: number-only matching is repo-agnostic in some checks (e.g. existing-worktree short-circuit paths), so cross-repo collisions by number can still resolve to a worktree in another repo. This doc does not change that behavior.

## Test Requirements

Expand `src/renderer/src/lib/github-links.test.ts` to cover both `parseGitHubIssueOrPRNumber` and `parseGitHubIssueOrPRLink` directly.

Must parse:
- `https://github.com/o/r/pull/1965/changes`
- `https://github.com/o/r/pull/1965/files`
- `https://github.com/o/r/pull/1965/commits`
- `https://github.com/o/r/issues/923/comments`
- same with query/fragment
- same with trailing slash and repeated trailing slashes

Must reject:
- non-GitHub hosts
- `.../pull/not-a-number/changes`
- `.../pull/`
- `.../issues/123abc`
- `.../owner/repo/pulls/123` (list route)

Regression:
- `42` and `#42` still parse as direct numbers
- existing `.../pull/<n>` and `.../issues/<n>` still parse
- `parseGitHubIssueOrPRLink(...).type` is correct for trailing-segment URLs

## Rollout

1. Update regexes + type derivation in `github-links.ts`.
2. Add parser tests in `github-links.test.ts`.
3. Run `github-links.test.ts`, then renderer tests touching `SmartWorkspaceNameField`, `WorktreeJumpPalette`, and `WorktreeMetaDialog`.
4. Manual verification:
- `Cmd+N`: paste `/pull/<n>/changes` and confirm GitHub item resolution.
- `Cmd+J`: paste `/pull/<n>/changes` and confirm create-from-query resolution.
- Worktree Meta dialog: paste issue URL with trailing segment and confirm open-link affordance remains issue-only.

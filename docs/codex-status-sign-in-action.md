# Codex Status Sign-In Action

## Problem

The Codex status-bar account switcher shows `Sign in to see usage` for inactive managed accounts when their inactive usage cache entry has `status === 'error'` and no rate-limit windows. The text is rendered by `InlineUsageBars` in [StatusBar.tsx](../src/renderer/src/components/status-bar/StatusBar.tsx:854). The expanded Codex account rows currently only switch accounts, so users must leave the menu and open Settings > Accounts to use the existing Codex `Re-authenticate` action in [AccountsPane.tsx](../src/renderer/src/components/settings/AccountsPane.tsx:841).

## Goal

Add a `Sign in` action next to the `Sign in to see usage` inline status in the Codex status-bar account switcher. The action should start the existing Codex managed-account reauthentication flow for that account, update the status-bar account snapshot and settings, then ask the inactive-usage preview to refresh while the menu remains open.

## Non-goals

- Do not change account storage, rate-limit fetching, or Codex PTY auth mechanics.
- Do not add a sign-in action for the system default row; there is no managed account id to reauthenticate.
- Do not change Claude account behavior.
- Do not introduce new UI tokens or custom controls outside the existing style guide.

## Design

1. Extend `CodexSwitcherMenu` with `reauthenticatingAccountId: string | null`, separate from `isSwitching`. Guard both handlers with `isSwitching || reauthenticatingAccountId !== null` so duplicate clicks do not enqueue multiple serialized main-process mutations.
2. Add `handleSignInAccount(accountId)` in `CodexSwitcherMenu`. It should call `window.api.codexAccounts.reauthenticate({ accountId })`, record `codex-account-switching` to match Settings account actions, `setAccounts(next)`, and `await fetchSettings()`. Do not pass runtime data; `codexAccounts.reauthenticate` only accepts `accountId`, and the main service resolves host/WSL from the stored account.
3. After a successful reauth, call `fetchInactiveCodexAccountUsage()` only if the account list is still expanded. This IPC does not return a fresh usage snapshot; it relies on `rateLimits:update` pushes. `CodexAccountService.reauthenticateAccount()` refreshes the active Codex target through `refreshForCodexAccountChange(undefined, accountTarget)`, but it does not refresh the inactive-account cache by itself.
4. Detect the exact inline state with the current data shape: `!target.active`, `target.id !== null`, `inactiveUsage?.claude` exists, `limits.status === 'error'`, and both `limits.session` and `limits.weekly` are absent. The `claude` property name is shared by `InactiveAccountUsage` for both Claude and Codex previews; do not rename it in the renderer as part of this change.
5. Render that state as muted inline text plus a compact ghost `Button` labeled `Sign in`, using the existing `RefreshCw` / `Loader2` pattern from Settings. The button lives inside a Radix `DropdownMenuItem`, so stop pointer/click propagation and prevent the button click from triggering the row `onSelect`; otherwise it can also switch accounts or close the menu.
6. Keep normal usage bars, loading skeletons, active labels, runtime grouping, and `Manage Accounts...` unchanged. Do not show this action for stale error data that still has `session` or `weekly` windows.

## Constraints Verified In Code

- `codexAccounts.reauthenticate` is exposed in preload and IPC as `{ accountId } => Promise<CodexRateLimitAccountsState>`.
- `CodexAccountService` serializes account mutations with `mutationQueue`, but renderer busy state is still required to prevent repeated login prompts.
- Inactive Codex preview fetches are RPC-only (`allowPtyFallback: false`), debounced for 60 seconds, and skipped while any inactive Codex fetch is already running. A post-reauth preview refresh can therefore be delayed if the menu already started a fetch.
- The status bar already treats settings-derived account state as authoritative via `codexAccountSyncKey`; the local `accounts` state is only a fallback snapshot.

## Edge cases

- Active accounts remain disabled for selection and should not show the sign-in button from inactive usage data.
- System default rows have `target.id === null`; never render a sign-in action for them.
- While sign-in or account switching is running, managed account rows should not start another switch or sign-in action.
- WSL-managed accounts must reauthenticate through the existing account service; do not infer host paths or alter runtime target selection in the renderer.
- If the account is removed or changed externally before the click resolves, the IPC may reject with the service's existing "no longer exists" error. Clear the busy state, leave the menu open, and log the failure, matching existing status-bar account-switching error handling.
- If an inactive-usage preview fetch is already in flight, the explicit post-reauth fetch may no-op. Do not claim the usage bars are guaranteed to refresh immediately; they update from the current fetch, the next open, or a later refresh.
- If the menu closes while reauthentication is in flight, the handler may still finish and refresh settings; no unmounted DOM assumptions.

## Rollout

1. Update `CodexSwitcherMenu` state and handlers for account sign-in.
2. Add a focused inline unavailable/sign-in render path for Codex inactive usage rows.
3. Run `pnpm run typecheck` and `pnpm run lint`.
4. Add or update focused tests if this touches main-process cache behavior. There is no existing component test for `CodexSwitcherMenu`; do not pretend coverage exists there.
5. Validate in Electron with an inactive Codex managed account that shows `Sign in to see usage`, including a WSL-managed account when available.

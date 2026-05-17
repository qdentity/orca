# Terminal Set Title Custom Label

## Problem

Right-clicking a single terminal pane and choosing `Set Title...` appears to accept the new label, but an active Codex agent can immediately replace the visible tab label with its next OSC title update. The user intent is different in single-pane and split-pane layouts:

- In a single-pane terminal tab, `Set Title...` is effectively a tab-label action because there is no separate pane selection to disambiguate.
- In a split terminal tab, `Set Title...` labels the selected pane overlay while the tab label should continue following the active pane's runtime title.

The goal is to make a user-set single-pane terminal title survive Codex title churn while preserving existing split-pane behavior.

## Current Behavior

- Terminal pane titles are local React state keyed by ephemeral pane id and persisted through leaf ids in the terminal layout snapshot: `src/renderer/src/components/terminal-pane/TerminalPane.tsx:226`.
- `Set Title...` from the terminal context menu resolves the clicked pane and calls the pane rename flow: `src/renderer/src/components/terminal-pane/use-terminal-pane-context-menu.ts:195`.
- Submitting the pane rename writes `paneTitles`, updates `paneTitlesRef`, and persists the layout snapshot: `src/renderer/src/components/terminal-pane/TerminalPane.tsx:998`.
- Active PTY OSC title changes update the runtime pane title and, when the pane is active, call `updateTabTitle`: `src/renderer/src/components/terminal-pane/pty-connection.ts:224`.
- The rendered tab label prefers `customTitle` over the volatile runtime `title`: `src/renderer/src/components/tab-bar/SortableTab.tsx:192` and `src/renderer/src/components/tab-bar/SortableTab.tsx:321`.
- The store-level fallback title also gives `customTitle` top priority: `src/renderer/src/store/slices/terminals.ts:53`.
- `updateTabTitle` updates the live `title` field used by OSC title changes: `src/renderer/src/store/slices/terminals.ts:781`.
- `setTabCustomTitle` updates the stable user-owned label: `src/renderer/src/store/slices/terminals.ts:961`.
- Split-pane lifecycle already treats active pane runtime titles as tab-title drivers when panes close or focus changes: `src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts:704` and `src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts:723`.

The failure mode is that single-pane `Set Title...` currently behaves like a pane overlay title only. It does not claim the tab's `customTitle`, so the next active Codex OSC update can still change the tab's live `title` and therefore the visible label.

## Proposed Design

When the pane rename is submitted:

1. Continue updating `paneTitles` and `paneTitlesRef` exactly as today so the pane overlay and persisted layout snapshot keep working.
2. If the terminal manager has one or zero panes, also call `setTabCustomTitle(tabId, trimmed, { preservePaneTitleMirror: true })` and persist that exact mirrored value in `terminalLayoutsByTabId[tabId].paneTitleMirroredCustomTitle` as the value this pane flow owns on the tab.
3. If the terminal manager has more than one pane, do not write `customTitle`; preserve split-pane semantics where the title labels the pane overlay and the tab label follows the active pane's runtime title.
4. When a terminal transitions from one pane to multiple panes, clear `customTitle` only if the current tab `customTitle` still equals the value mirrored by this pane-title flow. Keep the pane overlay title. This restores split-pane runtime-title behavior without clearing explicit tab renames made through the tab UI.
5. When the user removes a single-pane pane title through the overlay close affordance, or clears the inline title and submits it, clear `customTitle` under the same ownership check: only clear the value the pane-title flow mirrored, not an unrelated explicit tab label.
6. Leave OSC title handling unchanged. Codex can continue writing runtime titles through `updateTabTitle`; the tab renderer already prefers `customTitle`, so user-owned single-pane labels remain visible without suppressing the underlying runtime title.

This keeps the change narrow and uses existing store precedence instead of introducing a new terminal-title ownership model.

## User-Facing Semantics

| Layout state | User action | Pane overlay | Tab label |
| --- | --- | --- | --- |
| Single pane | `Set Title...` with non-empty text | Shows the custom label on the pane. | Uses the same custom label through `customTitle`, so Codex OSC churn cannot replace it visually. |
| Single pane | Empty submit while a title exists | Clears the pane overlay. | Clears the mirrored `customTitle` if this flow still owns it. |
| Single pane | Empty submit on an untitled pane | No change. | No change; empty input remains cancel/no-op. |
| Single pane | Overlay remove-title button | Clears the pane overlay. | Clears the mirrored `customTitle` if this flow still owns it. |
| Single pane becomes split | User splits the terminal after setting a pane title. | The original pane keeps its overlay title. | Drops the mirrored `customTitle` and resumes following the active pane runtime title. |
| Split pane | `Set Title...` on a selected pane | Shows or updates only that pane's overlay title. | Continues following the active pane's runtime title. |
| Split pane | Focus active pane changes | Pane overlays remain local. | Existing lifecycle sync updates the tab runtime title to the newly active pane. |

The important distinction is ownership: the pane-title flow may clear only the tab label it wrote or restored with the persisted mirror marker. If the user separately renames the tab, even to the same text, that explicit tab label wins until the tab rename UI clears or changes it.

## Architecture and Data Flow

```text
[Terminal context menu]
          |
          v
[TerminalPane rename state] ---> [paneTitles / paneTitlesRef] ---> [layout snapshot titlesByLeafId]
          |
          +-- single pane only --> [tabsByWorktree.customTitle]
          |
          +-- single pane only --> [layout snapshot paneTitleMirroredCustomTitle]
                                      |
                                      v
[PTY OSC title] -------------> [tabsByWorktree.title] -----> [SortableTab renders customTitle ?? title]
```

Data-flow paths:

- Happy path: the user submits a non-empty single-pane title, `paneTitlesRef` is updated before persistence, `setTabCustomTitle` writes the stable tab label, and later `updateTabTitle` calls continue updating runtime state without changing the rendered tab label.
- Nil manager path: if `managerRef.current` is temporarily null during submit, treat the layout as single-pane. That matches the only visible user intent available from this `TerminalPane`; there is no split manager to preserve.
- Empty input path: trimmed input length `0` cancels only when the pane has no title. If a title exists, it routes through the same removal path as the overlay remove button and clears the mirrored `customTitle` only under the ownership check.
- Upstream/runtime error path: SSH, PTY, and OSC failures remain outside this change. The mirrored label is renderer/store state, so a transport error can stop future runtime title updates but cannot erase a user-set `customTitle`.

## Invalidation and Concurrency

- Double submit remains guarded by `renameSubmittedRef`; Enter followed by blur must not write or persist twice.
- OSC title updates may race immediately after rename submit. This is safe because they write `title`, while the visible tab label prefers `customTitle`.
- Split creation is the main invalidation event. If pane count moves from one to more than one, the `TerminalPane` should clear only the `customTitle` value it mirrored from pane rename. This avoids the stale-label bug where a former single-pane label would keep hiding active split-pane runtime titles.
- Explicit tab rename remains independent. Generic `setTabCustomTitle` calls clear `paneTitleMirroredCustomTitle`, including same-text renames, so later split/remove actions do not clear a tab-owned label.
- The mirrored ownership marker is persisted in the terminal layout snapshot. Restore, shutdown capture, and the immediate post-restore layout persist preserve it while the layout remains single-pane and the current tab `customTitle` still matches the marker.

## Edge Cases

- Empty rename input should remove an existing pane title, but remain a cancel/no-op for an untitled pane.
- Double submit from Enter followed by blur should still be guarded by `renameSubmittedRef`.
- Split panes should not receive a tab `customTitle` from pane-level `Set Title...`, because that would hide active pane runtime changes across all splits.
- A single-pane title that is mirrored into `customTitle` should be cleared when the user later splits the terminal, while the original pane overlay title remains in `paneTitles`.
- A restored single-pane title should keep its persisted `paneTitleMirroredCustomTitle` through shutdown capture and the initial post-restore layout persist, then clear the mirrored `customTitle` if the user splits after relaunch.
- A restored tab explicitly renamed to the same text as the pane title should clear the persisted mirror marker and survive a later split.
- Removing the pane overlay title in a single-pane tab should clear the mirrored `customTitle`; removing a pane overlay in a split tab should not touch `customTitle`.
- Single-pane behavior should tolerate `managerRef.current` being temporarily null by treating the layout as a single pane, matching the safest visible user intent.
- Existing tab rename UI and launch flows that already use `setTabCustomTitle` should continue to work because this design reuses the same field and render precedence.
- SSH terminals should behave the same as local terminals because the fix is renderer/store state precedence, not PTY transport or filesystem behavior.

## Test Plan

- Add a consolidated Playwright regression in `tests/e2e/terminal-panes.spec.ts` that:
  - Opens the terminal context menu on a single pane.
  - Chooses `Set Title...`.
  - Enters a custom label.
  - Asserts the active tab's store entry has `customTitle`.
  - Simulates an active Codex OSC title update by calling `updateTabTitle`.
  - Asserts the rendered sortable tab keeps `data-tab-title` equal to the custom label.
- In the same Playwright launch, cover:
  - Removing a single-pane pane title clears the mirrored `customTitle`, removes the visible title bar, and removes the persisted `titlesByLeafId` entry.
  - Clearing the inline title input and pressing Enter uses the same removal path.
  - The inline title controls are keyboard accessible, use title-specific accessible names, expose a named textbox, and provide a tooltip-backed remove button with a 24px target.
  - Splitting after a single-pane pane title clears only the mirrored `customTitle`, keeps the pane overlay title, and lets the tab label follow active runtime titles again.
  - If the tab bar later writes a different explicit `customTitle`, splitting does not clear that unrelated tab-owned label.
  - Split-pane pane titles remain pane-local and do not overwrite the existing tab `customTitle`.
- Add restart/remount Playwright coverage in `tests/e2e/terminal-restart-persistence.spec.ts` proving a restored single-pane title preserves ownership, then clears the mirrored `customTitle` when the user splits after relaunch.
- Add restart/remount coverage proving an explicit same-text tab rename clears the mirror marker and survives a later split.
- Unit coverage is not necessary for the primary bug because the observable regression crosses context-menu UI, pane rename state, Zustand tab state, and tab rendering. A Playwright test catches the real integration failure.
- Run:
  - `npx playwright test tests/e2e/terminal-panes.spec.ts --config tests/playwright.config.ts --project=electron-headless -g "Set Title ownership"`
  - `npx playwright test tests/e2e/terminal-restart-persistence.spec.ts --config tests/playwright.config.ts --project=electron-headless -g "restored single-pane Set Title ownership|restored same-text explicit tab title"`
  - `pnpm typecheck`
  - `pnpm lint`

## Rollout Order

1. Add the design doc.
2. Update `TerminalPane.tsx` to select `setTabCustomTitle` and write it only for single-pane rename submits.
3. Track the mirrored single-pane value locally so split transitions and remove-title can clear only labels owned by the pane-title flow.
4. Add the focused Playwright regressions.
5. Run targeted Playwright coverage.
6. Run full required checks: `pnpm typecheck` and `pnpm lint`.
7. Run review lanes for code, security, tests, UX, perf, and Windows/Linux compatibility because the change touches terminal UI state and hot OSC title paths.
8. Validate manually in Electron by setting a single-pane terminal title while an agent is actively updating the terminal title, splitting that terminal, and confirming the split tab label follows the active pane again.

## Ref-Oss

`ref-oss` was not used. This is a narrow Orca-specific interaction between pane title state, tab `customTitle`, and active terminal OSC title updates. Mature OSS terminal behavior would not materially reduce risk because the key design choice depends on Orca's existing tab-render precedence and split-pane runtime-title ownership.

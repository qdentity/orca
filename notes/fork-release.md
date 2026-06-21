# Fork release (qdentity/orca)

Rolling release pipeline for the internal fork. Every push to `main` builds the
fork's code for **macOS-arm64** (ad-hoc, unsigned) and **Linux-x64** and
publishes it to `qdentity/orca` GitHub Releases as the new latest.
Workflow: `.github/workflows/fork-release.yml`. Upstream's `release-cut.yml` and
the other CI stay on disk but are disabled on the fork (see below).

## Versioning

A fork can't drive upstream's version line, and both the pacman `pkgver` (no `-`
allowed) and electron-updater need a monotonic, hyphen-free `X.Y.Z`. So each run
derives:

```
version = <upstream major>.<upstream minor>.<git commit count>     e.g. 1.4.5184
```

- `MAJOR.MINOR` is read from `package.json` (prerelease suffix stripped) and so
  follows whatever upstream base is merged into `main`.
- The patch is `git rev-list --count HEAD` — strictly increasing, so every build
  is an "upgrade" to `vercmp`. Survives workflow renames (unlike run numbers).
- It's written into `package.json` **only inside the CI checkout** before
  building — never committed back to `main` (that would retrigger the workflow
  forever).

Don't rebase/force-push `main` (would make the commit count non-monotonic).
Merging `upstream/main` is fine — it just bumps the base and/or the count.

## Releasing

Just push to `main` (or merge `upstream/main`). The workflow runs automatically:
`prepare` (compute version + draft) → `build` (mac ∥ linux) → `publish` (flip to
latest). ~15 min. Manual runs: Actions → **Fork Release** → Run workflow.

Rapid pushes coalesce (concurrency `cancel-in-progress`); only the newest commit
becomes a release. Artifacts on each release: `orca-linux.AppImage` / `.deb` /
`.rpm`, `orca-macos-arm64.dmg` + zip, `latest-linux.yml` / `latest-mac.yml`.

The publish target is overridden on the electron-builder CLI
(`-c.publish.owner=qdentity ...`) so nothing in the upstream config is edited —
keeps merges from `stablyai/orca` conflict-free.

## macOS: ad-hoc / not notarized

No Apple credentials are used, so the `.dmg` is ad-hoc signed and not notarized:

- **First launch is blocked by Gatekeeper.** Clear quarantine once per install:
  `xattr -dr com.apple.quarantine /Applications/Orca.app`
  (or System Settings → Privacy & Security → "Open Anyway"; on macOS 15 the old
  right-click→Open no longer works).
- **In-app auto-update won't apply on macOS** (Squirrel.Mac needs a stable
  Developer ID). Re-download the `.dmg` to update.
- **"Computer Use" TCC grants** re-prompt after each install (ad-hoc identity
  changes per build).

Wire up the 5 Apple secrets + set `ORCA_MAC_RELEASE=1` later if these annoy.

## Consumers

`dvic/omarchy-dotfiles` (`packages/orca-ide-bin/PKGBUILD`, `scripts/orca.sh`)
points at `qdentity/orca` releases and pulls `orca-linux.AppImage`. `orca.sh`
reads `releases/latest`, refreshes `pkgver` + checksums, and upgrades via
`vercmp` — so rolling versions are picked up with no manual edits.

## Workflows on the fork

Only two are kept: `fork-release.yml` (this) and `pr.yml`
(lint/typecheck/test/build:unpack on PRs).

All other upstream workflows were **deleted** on the fork, not disabled.
GitHub lazily registers workflows on forks (a file is only `gh workflow disable`-able
after its trigger first fires), so disabling couldn't be done up front — deletion
is immediate and keeps the fork's CI truly minimal. Removed: `release-cut.yml`,
`e2e.yml`, `readme-downloads-badge.yml`, `computer-e2e.yml`,
`golden-e2e-experiment.yml`, `mobile.yml`, `mobile-android-release.yml`,
`mobile-ios-release.yml`, `track-community-prs.yaml`, `issue-os-labeler.yaml`,
`pullfrog.yml`, `terminal-perf.yml`, `homebrew-bump.yml`.

Tradeoff: a `git merge upstream/main` that touches a deleted file yields a
modify/delete conflict — resolve by re-`git rm`-ing it.

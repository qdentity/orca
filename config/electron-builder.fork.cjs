// Why: the fork ships macOS for internal Apple Silicon use only, so restrict the
// upstream dual-arch (x64 + arm64) mac config to arm64. Everything else is
// inherited from the canonical config — this file only narrows the mac targets,
// so upstream changes flow through untouched (no edit to electron-builder.config.cjs).
const base = require('./electron-builder.config.cjs')

module.exports = {
  ...base,
  mac: {
    ...base.mac,
    target: [
      { target: 'dmg', arch: ['arm64'] },
      // zip is kept (arm64) because electron-builder's mac updater manifest
      // (latest-mac.yml) references it; the dmg alone would leave a dangling ref.
      { target: 'zip', arch: ['arm64'] }
    ]
  }
}

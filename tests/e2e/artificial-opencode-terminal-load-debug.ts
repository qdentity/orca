import type { Page } from '@stablyai/playwright-test'

type SyntheticOpenCodeWindow = Window & {
  __terminalPtyAckGate?: {
    hold: (ptyIds: string[]) => void
    release: () => void
    snapshot: () => TerminalPtyAckGateSnapshot
  }
  __terminalPtyOutputDebug?: {
    reset: () => void
    snapshot: () => TerminalPtyOutputDebugSnapshot
  }
  __terminalOutputSchedulerDebug?: {
    reset: () => void
    snapshot: () => TerminalOutputSchedulerDebugSnapshot
  }
}

// Why: the renderer hidden-skip grammar is deleted — hidden bytes are dropped
// in main (gate) or ride the background queue. Only the mode-2031 fact-reply
// counter still has a renderer-side producer.
export type TerminalPtyOutputDebugSnapshot = {
  hiddenRendererMode2031ReplyCount: number
}

export type TerminalOutputSchedulerDebugSnapshot = {
  backgroundEnqueueCount: number
  deferredForegroundEnqueueCount: number
  foregroundWriteCount: number
  backgroundWriteCount: number
  deferredForegroundWriteCount: number
  flushWriteCount: number
  scheduledDrainCount: number
  queuedTerminalCount: number
  queuedChars: number
  peakQueuedTerminalCount: number
  peakQueuedChars: number
  peakQueuedCharsByTerminal: number
  droppedBacklogCount: number
  drainWrites: number[]
}

export type TerminalPtyAckGateSnapshot = {
  gatedPtyCount: number
  heldAckCount: number
  heldAckChars: number
}

export type MainPtyPressureDebugSnapshot = {
  pendingPtyCount: number
  pendingChars: number
  maxPendingCharsByPty: number
  rendererInFlightPtyCount: number
  rendererInFlightChars: number
  maxRendererInFlightCharsByPty: number
  activeRendererPtyCount: number
  flushScheduled: boolean
  peakPendingChars: number
  peakMaxPendingCharsByPty: number
  peakRendererInFlightChars: number
  peakMaxRendererInFlightCharsByPty: number
  ackGatedFlushSkipCount: number
  // Phase-4 hidden-delivery gate: bytes dropped in main after model ingestion.
  hiddenDeliveryGatedPtyCount: number
  deliveryInterestPtyCount: number
  hiddenDeliveryDroppedChars: number
  hiddenDeliveryDroppedChunks: number
  pendingDroppedChars: number
}

export async function resetTerminalPtyOutputDebug(page: Page): Promise<void> {
  await page.evaluate(async () => {
    ;(window as SyntheticOpenCodeWindow).__terminalPtyOutputDebug?.reset()
    ;(window as SyntheticOpenCodeWindow).__terminalOutputSchedulerDebug?.reset()
    await window.api.pty.resetRendererDeliveryDebug()
  })
}

export async function readTerminalPtyOutputDebug(
  page: Page
): Promise<TerminalPtyOutputDebugSnapshot | null> {
  return page.evaluate(() => {
    return (window as SyntheticOpenCodeWindow).__terminalPtyOutputDebug?.snapshot() ?? null
  })
}

export async function readTerminalOutputSchedulerDebug(
  page: Page
): Promise<TerminalOutputSchedulerDebugSnapshot | null> {
  return page.evaluate(() => {
    return (window as SyntheticOpenCodeWindow).__terminalOutputSchedulerDebug?.snapshot() ?? null
  })
}

export async function readMainPtyPressureDebug(
  page: Page
): Promise<MainPtyPressureDebugSnapshot | null> {
  return page.evaluate(async () => {
    return window.api.pty.getRendererDeliveryDebugSnapshot()
  })
}

export async function holdTerminalAckGate(page: Page, ptyIds: string[]): Promise<void> {
  await page.evaluate((ids) => {
    const gate = (window as SyntheticOpenCodeWindow).__terminalPtyAckGate
    if (!gate) {
      throw new Error('terminal PTY ACK gate is unavailable')
    }
    gate.hold(ids)
  }, ptyIds)
}

export async function releaseTerminalAckGate(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as SyntheticOpenCodeWindow).__terminalPtyAckGate?.release()
  })
}

export async function readTerminalAckGateDebug(
  page: Page
): Promise<TerminalPtyAckGateSnapshot | null> {
  return page.evaluate(() => {
    return (window as SyntheticOpenCodeWindow).__terminalPtyAckGate?.snapshot() ?? null
  })
}

import { useLayoutEffect, useState } from 'react'

export type ActivityTerminalPortalTarget = {
  target: HTMLElement
  worktreeId: string
  tabId: string
}

let currentTarget: HTMLElement | null = null
const subscribers = new Set<(target: HTMLElement | null) => void>()

// Why: replaces a body-wide MutationObserver. ActivityPrototypePage owns the
// target div's lifecycle and publishes here on mount/unmount; Terminal
// subscribes. Avoids global DOM observation while activity is open.
export function setActivityTerminalPortalTarget(target: HTMLElement | null): void {
  if (currentTarget === target) {
    return
  }
  currentTarget = target
  for (const subscriber of subscribers) {
    subscriber(target)
  }
}

export function useActivityTerminalPortalTarget(enabled: boolean): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(enabled ? currentTarget : null)

  useLayoutEffect(() => {
    if (!enabled) {
      setTarget(null)
      return
    }
    setTarget(currentTarget)
    const subscriber = (next: HTMLElement | null): void => setTarget(next)
    subscribers.add(subscriber)
    return () => {
      subscribers.delete(subscriber)
    }
  }, [enabled])

  return target
}

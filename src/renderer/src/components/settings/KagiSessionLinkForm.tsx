import { useState } from 'react'
import { toast } from 'sonner'
import { normalizeKagiSessionLink } from '../../../../shared/browser-url'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

type KagiSessionLinkDraftState = {
  sourceLink: string
  draft: string
}

function createKagiSessionLinkDraftState(
  browserKagiSessionLink: string | null | undefined
): KagiSessionLinkDraftState {
  const sourceLink = browserKagiSessionLink ?? ''
  return {
    sourceLink,
    draft: sourceLink
  }
}

function resolveKagiSessionLinkDraftState(
  state: KagiSessionLinkDraftState,
  browserKagiSessionLink: string | null | undefined
): KagiSessionLinkDraftState {
  const sourceLink = browserKagiSessionLink ?? ''
  return state.sourceLink === sourceLink ? state : { sourceLink, draft: sourceLink }
}

export function KagiSessionLinkForm(): React.JSX.Element {
  const browserKagiSessionLink = useAppStore((s) => s.browserKagiSessionLink)
  const setBrowserKagiSessionLink = useAppStore((s) => s.setBrowserKagiSessionLink)
  const [draftState, setDraftState] = useState(() =>
    createKagiSessionLinkDraftState(browserKagiSessionLink)
  )

  const resolvedDraftState = resolveKagiSessionLinkDraftState(draftState, browserKagiSessionLink)
  if (resolvedDraftState !== draftState) {
    // Why: the masked draft tracks persisted secret updates without committing
    // accidental typing back to settings or waiting for an after-paint Effect.
    setDraftState(resolvedDraftState)
  }
  const draft = resolvedDraftState.draft
  const updateDraft = (nextDraft: string): void => {
    setDraftState((current) => ({
      ...resolveKagiSessionLinkDraftState(current, browserKagiSessionLink),
      draft: nextDraft
    }))
  }

  const save = (): void => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setBrowserKagiSessionLink(null)
      setDraftState(createKagiSessionLinkDraftState(null))
      toast.success('Kagi session link cleared.')
      return
    }
    const normalized = normalizeKagiSessionLink(trimmed)
    if (!normalized) {
      toast.error('Enter a Kagi private session link from https://kagi.com/search?token=...')
      return
    }
    setBrowserKagiSessionLink(normalized)
    setDraftState(createKagiSessionLinkDraftState(normalized))
    toast.success('Kagi session link saved.')
  }

  return (
    <form
      className="flex flex-col items-end gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <p className="max-w-72 text-right text-[11px] leading-snug text-muted-foreground">
        Optional private session link for Kagi auth.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          value={draft}
          onChange={(e) => updateDraft(e.target.value)}
          placeholder="https://kagi.com/search?token=..."
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          aria-label="Kagi private session link"
          className="h-7 w-72 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">
          Save
        </Button>
        {browserKagiSessionLink ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              setBrowserKagiSessionLink(null)
              setDraftState(createKagiSessionLinkDraftState(null))
              toast.success('Kagi session link cleared.')
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  )
}

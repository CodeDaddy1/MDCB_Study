'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function GenerateQuestionsButton({
  deckId,
  disabled,
}: {
  deckId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function onClick() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/decks/${deckId}/generate`, {
        method: 'POST',
      })
      const body = (await res.json().catch(() => null)) as {
        error?: string
        concepts?: number
        persisted?: number
      } | null
      if (!res.ok) throw new Error(body?.error ?? 'Generation failed')
      setMsg(
        !body?.concepts
          ? 'All concepts already have questions.'
          : `Added ${body.persisted ?? 0} verified question(s) from ${body.concepts} concept(s).`,
      )
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={busy || disabled}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
      >
        {busy ? 'Generating…' : 'Generate questions'}
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CreateDeckForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, visibility }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error ?? 'Failed to create deck')
      }
      const { deck } = (await res.json()) as { deck: { id: string } }
      router.push(`/decks/${deck.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deck')
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[var(--radius-lg)] border border-border bg-card p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deck title (e.g. MDCB — Radiation Physics)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <div className="flex flex-col gap-3 sm:w-44">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create deck'}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </form>
  )
}

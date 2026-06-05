'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DocumentStatus } from '@/lib/database.types'

interface Doc {
  id: string
  filename: string
  status: DocumentStatus
  error: string | null
}

const POLL_MS = 4000
const isPending = (s: DocumentStatus) => s === 'uploaded' || s === 'processing'

export function DocumentsPanel({
  deckId,
  initial,
}: {
  deckId: string
  initial: Doc[]
}) {
  const router = useRouter()
  const [docs, setDocs] = useState<Doc[]>(initial)
  const [working, setWorking] = useState<Record<string, boolean>>({})
  const wasPending = useRef(initial.some((d) => isPending(d.status)))

  useEffect(() => {
    setDocs(initial)
  }, [initial])

  const refresh = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select('id, filename, status, error')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true })
    if (!data) return
    setDocs(data)
    const pendingNow = data.some((d) => isPending(d.status))
    // When the last pending doc settles, re-fetch the server component so the
    // concept/chunk counts and concept list update.
    if (wasPending.current && !pendingNow) router.refresh()
    wasPending.current = pendingNow
  }, [deckId, router])

  useEffect(() => {
    if (!docs.some((d) => isPending(d.status))) return
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [docs, refresh])

  async function process(id: string) {
    setWorking((w) => ({ ...w, [id]: true }))
    try {
      await fetch(`/api/documents/${id}/ingest`, { method: 'POST' })
      await refresh()
      router.refresh()
    } finally {
      setWorking((w) => ({ ...w, [id]: false }))
    }
  }

  if (docs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No documents yet. Upload source material to begin.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {docs.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {doc.filename}
            </p>
            {doc.status === 'failed' && doc.error && (
              <p className="mt-0.5 truncate text-xs text-destructive">
                {doc.error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <StatusBadge status={doc.status} />
            {(doc.status === 'uploaded' || doc.status === 'failed') && (
              <button
                onClick={() => process(doc.id)}
                disabled={working[doc.id]}
                className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
              >
                {working[doc.id]
                  ? 'Processing…'
                  : doc.status === 'failed'
                    ? 'Retry'
                    : 'Process'}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const styles: Record<DocumentStatus, string> = {
    uploaded: 'bg-muted text-muted-foreground',
    processing: 'bg-accent/10 text-accent',
    ready: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  )
}

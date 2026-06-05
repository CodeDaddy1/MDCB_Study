'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'study-materials'
const ACCEPT = '.pdf,.pptx,.ppt,.docx,.doc,.txt,.md'

export function UploadDocument({ deckId }: { deckId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      // Path convention enforced by Storage RLS: <deckId>/<uuid>/<filename>.
      const docFolder = crypto.randomUUID()
      const path = `${deckId}/${docFolder}/${file.name}`

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        })
      if (upErr) throw upErr

      const { data: doc, error: insErr } = await supabase
        .from('documents')
        .insert({
          deck_id: deckId,
          filename: file.name,
          storage_path: path,
          mime_type: file.type || null,
          status: 'uploaded',
        })
        .select('id')
        .single()
      if (insErr) throw insErr

      // Kick ingestion (best-effort — the cron route also picks up 'uploaded'
      // docs). Don't await: ingestion can take much longer than this request.
      void fetch(`/api/documents/${doc.id}/ingest`, { method: 'POST' }).catch(
        () => {},
      )

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="text-right">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90">
        {busy ? 'Uploading…' : 'Upload document'}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onChange}
          disabled={busy}
          className="hidden"
        />
      </label>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}

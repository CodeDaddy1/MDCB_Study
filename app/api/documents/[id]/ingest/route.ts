import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ingestDocument, extractConcepts } from '@/lib/agents/expert'

// Ingestion (extract → embed) can be slow for large PDFs. 60s is the Hobby
// ceiling; on Pro you can raise this to 300 for very large documents.
export const maxDuration = 60

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Look up the document, then confirm the caller OWNS its deck (RLS lets
  // non-owners read shared decks — ingestion must be owner-only).
  const { data: doc } = await supabase
    .from('documents')
    .select('id, deck_id')
    .eq('id', id)
    .single()
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { data: ownedDeck } = await supabase
    .from('decks')
    .select('id')
    .eq('id', doc.deck_id)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!ownedDeck) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await ingestDocument(id)
  const concepts =
    result.status === 'ready' ? await extractConcepts(doc.deck_id) : null

  return NextResponse.json({ result, concepts })
}

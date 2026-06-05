import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestDocument, extractConcepts, type IngestResult } from '@/lib/agents/expert'

// Idempotent cron sweep: pick up documents stuck in 'uploaded' and ingest them,
// then refresh concepts for any deck that changed. No automatic retries; runs in
// UTC. Authenticated with CRON_SECRET (this route is excluded from middleware).
export const maxDuration = 300

const MAX_PER_RUN = 5

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true
  return new URL(request.url).searchParams.get('secret') === secret
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('documents')
    .select('id, deck_id')
    .eq('status', 'uploaded')
    .limit(MAX_PER_RUN)

  const results: IngestResult[] = []
  const touchedDecks = new Set<string>()
  for (const doc of pending ?? []) {
    const result = await ingestDocument(doc.id)
    results.push(result)
    if (result.status === 'ready') touchedDecks.add(doc.deck_id)
  }

  for (const deckId of touchedDecks) {
    await extractConcepts(deckId)
  }

  return NextResponse.json({
    processed: results.length,
    results,
    decksReindexed: [...touchedDecks],
  })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateForDeck } from '@/lib/agents/quiz-generator'

// Generation calls Sonnet per concept; keep within the Hobby 60s ceiling by
// bounding how many concepts each request covers. Call again to cover more.
export const maxDuration = 60

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const { deckId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only the deck owner may generate questions.
  const { data: deck } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!deck) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await generateForDeck(deckId, { perConcept: 2, maxConcepts: 5 })
  return NextResponse.json(result)
}

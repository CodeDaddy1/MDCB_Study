import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DeckVisibility } from '@/lib/database.types'

const VISIBILITIES: DeckVisibility[] = ['private', 'unlisted', 'public']

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown
    description?: unknown
    visibility?: unknown
  } | null

  const title = String(body?.title ?? '').trim()
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  const description = body?.description
    ? String(body.description).trim() || null
    : null
  const visibility = VISIBILITIES.includes(body?.visibility as DeckVisibility)
    ? (body?.visibility as DeckVisibility)
    : 'private'

  // owner_id is set server-side from the session; RLS also enforces it.
  const { data, error } = await supabase
    .from('decks')
    .insert({ owner_id: user.id, title, description, visibility })
    .select('id')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ deck: data })
}

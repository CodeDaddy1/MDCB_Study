import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CreateDeckForm } from '@/components/create-deck-form'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: decks } = await supabase
    .from('decks')
    .select('id, title, description, visibility, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Your decks
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a deck, upload source material, and the Source Expert turns it
          into grounded concepts.
        </p>
      </div>

      <CreateDeckForm />

      {decks && decks.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {decks.map((deck) => (
            <li key={deck.id}>
              <Link
                href={`/decks/${deck.id}`}
                className="block rounded-[var(--radius-lg)] border border-border bg-card p-5 transition hover:border-ring hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium text-foreground">{deck.title}</h2>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {deck.visibility}
                  </span>
                </div>
                {deck.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {deck.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
          No decks yet. Create your first one above.
        </p>
      )}
    </div>
  )
}

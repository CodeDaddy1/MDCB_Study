import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UploadDocument } from '@/components/upload-document'
import { DocumentsPanel } from '@/components/documents-panel'
import { GenerateQuestionsButton } from '@/components/generate-questions-button'

export default async function DeckPage({
  params,
}: {
  params: Promise<{ deckId: string }>
}) {
  const { deckId } = await params
  const supabase = await createClient()

  const { data: deck } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single()
  if (!deck) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isOwner = user?.id === deck.owner_id

  const [
    { data: documents },
    { data: concepts },
    { count: chunkCount },
    { count: questionCount },
  ] = await Promise.all([
    supabase
      .from('documents')
      .select('id, filename, status, error')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true }),
    supabase
      .from('concepts')
      .select('id, name, description')
      .eq('deck_id', deckId)
      .order('name', { ascending: true }),
    supabase
      .from('chunks')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId),
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId)
      .eq('verified', true),
  ])

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All decks
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {deck.title}
        </h1>
        {deck.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {deck.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Stat label="documents" value={documents?.length ?? 0} />
          <Stat label="chunks" value={chunkCount ?? 0} />
          <Stat label="concepts" value={concepts?.length ?? 0} />
          <Stat label="questions" value={questionCount ?? 0} />
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Source material
          </h2>
          {isOwner && <UploadDocument deckId={deckId} />}
        </div>
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
          <DocumentsPanel deckId={deckId} initial={documents ?? []} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Concepts</h2>
        {concepts && concepts.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {concepts.map((c) => (
              <li
                key={c.id}
                className="rounded-[var(--radius-lg)] border border-border bg-card p-4"
              >
                <p className="font-medium text-foreground">{c.name}</p>
                {c.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Concepts appear here once a document is processed.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Practice</h2>
          {isOwner && (
            <GenerateQuestionsButton
              deckId={deckId}
              disabled={!concepts || concepts.length === 0}
            />
          )}
        </div>
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
          {questionCount && questionCount > 0 ? (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {questionCount}
                </span>{' '}
                verified question{questionCount === 1 ? '' : 's'} ready — each
                with the correct answer plus why every option is right or wrong.
              </p>
              <Link
                href={`/decks/${deckId}/quiz`}
                className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Take quiz
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {concepts && concepts.length > 0
                ? 'No questions yet. Generate verified MCQs from this deck’s concepts.'
                : 'Questions can be generated once documents are processed into concepts.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1">
      <span className="font-semibold text-foreground">{value}</span> {label}
    </span>
  )
}

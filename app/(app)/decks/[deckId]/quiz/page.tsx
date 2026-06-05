import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuizRunner, type QuizQuestion } from '@/components/quiz-runner'
import type { StoredMcqPayload, StoredMcqAnswer } from '@/lib/schemas'

export default async function QuizPage({
  params,
}: {
  params: Promise<{ deckId: string }>
}) {
  const { deckId } = await params
  const supabase = await createClient()

  const { data: deck } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', deckId)
    .single()
  if (!deck) notFound()

  // Only verified MCQs are ever served.
  const { data: rows } = await supabase
    .from('questions')
    .select('id, prompt, payload, answer, explanation')
    .eq('deck_id', deckId)
    .eq('type', 'mcq')
    .eq('verified', true)
    .order('created_at', { ascending: true })

  const questions: QuizQuestion[] = (rows ?? [])
    .map((r) => {
      const payload = (r.payload ?? {}) as unknown as StoredMcqPayload
      const answer = (r.answer ?? {}) as unknown as StoredMcqAnswer
      return {
        id: r.id,
        prompt: r.prompt,
        options: payload.options ?? [],
        rationales: payload.rationales ?? [],
        correctIndex: answer.correct_index ?? -1,
        explanation: r.explanation ?? '',
      }
    })
    .filter((q) => q.options.length >= 2 && q.correctIndex >= 0)

  return (
    <div className="space-y-6">
      <Link
        href={`/decks/${deckId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {deck.title}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Practice quiz
      </h1>
      <QuizRunner questions={questions} />
    </div>
  )
}

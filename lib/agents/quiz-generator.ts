import 'server-only'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAnthropic, MODELS } from '@/lib/anthropic'
import { generatedQuizSchema } from '@/lib/schemas'
import { retrieve, verify } from '@/lib/agents/expert'

const RETRIEVE_K = 8

const QUIZ_SYSTEM = `You are an expert medical dosimetry educator writing board-exam practice questions for the MDCB (Medical Dosimetry Certification Board) exam. You write multiple-choice questions grounded ONLY in the provided SOURCE CHUNKS (lecture material and answer keys).

Strict rules:
- Every question must be fully answerable from the SOURCE CHUNKS. Never use outside knowledge or invent facts.
- Each question has exactly 4 options with EXACTLY ONE correct option (is_correct: true).
- For EVERY option write a "rationale": for the correct option, explain WHY it is correct; for each incorrect option, explain SPECIFICALLY why it is wrong (the misconception or error it represents), grounded in the source.
- Distractors must be plausible but clearly wrong per the source. Never use "all of the above" or "none of the above".
- "explanation" is the key teaching point: a concise statement of why the correct answer is correct and what concept the item tests.
- "source_indices" lists the 1-based numbers of the chunks (e.g. [1, 3]) that support the question and answer. Cite only chunks you actually used.
- "difficulty" is 1 (easy) to 5 (hard), or null.`

export interface GenerateConceptResult {
  conceptId: string
  drafted: number
  persisted: number
}

/** Generate and persist verified MCQs for a single concept. */
export async function generateForConcept(
  deckId: string,
  conceptId: string,
  count = 3,
): Promise<GenerateConceptResult> {
  const admin = createAdminClient()
  const { data: concept } = await admin
    .from('concepts')
    .select('id, name, description')
    .eq('id', conceptId)
    .single()
  if (!concept) return { conceptId, drafted: 0, persisted: 0 }

  // Retrieve grounding chunks (handouts AND answer keys are both ingested).
  const query = concept.description
    ? `${concept.name}. ${concept.description}`
    : concept.name
  const chunks = await retrieve(deckId, query, RETRIEVE_K)
  if (chunks.length === 0) return { conceptId, drafted: 0, persisted: 0 }

  const context = chunks
    .map((c, i) => `[${i + 1}] (chunk ${c.chunkId})\n${c.content}`)
    .join('\n\n---\n\n')

  const anthropic = getAnthropic()
  const response = await anthropic.messages.parse({
    model: MODELS.GENERATION,
    max_tokens: 8000,
    system: [
      { type: 'text', text: QUIZ_SYSTEM },
      {
        type: 'text',
        text: `SOURCE CHUNKS:\n\n${context}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Write ${count} board-style multiple-choice questions for the concept "${concept.name}". Ground every question and every option rationale strictly in the SOURCE CHUNKS above, and cite the chunk indices you used.`,
      },
    ],
    output_config: { format: zodOutputFormat(generatedQuizSchema) },
  })

  const parsed = response.parsed_output
  if (!parsed) return { conceptId, drafted: 0, persisted: 0 }

  let persisted = 0
  for (const q of parsed.questions) {
    const correctIdx = q.options.findIndex((o) => o.is_correct)
    const correctCount = q.options.filter((o) => o.is_correct).length
    // Must have ≥2 options and exactly one correct answer.
    if (q.options.length < 2 || correctCount !== 1 || correctIdx < 0) continue

    // Map 1-based source indices → chunk ids.
    const citedChunkIds = Array.from(
      new Set(
        q.source_indices
          .filter((n) => n >= 1 && n <= chunks.length)
          .map((n) => chunks[n - 1].chunkId),
      ),
    )
    if (citedChunkIds.length === 0) continue

    // Verifier (Source Expert) confirms the correct answer is supported.
    const verdict = await verify({
      prompt: q.prompt,
      answer: q.options[correctIdx].text,
      chunkIds: citedChunkIds,
    })
    if (!verdict.supported) continue

    const { data: inserted, error } = await admin
      .from('questions')
      .insert({
        deck_id: deckId,
        type: 'mcq',
        prompt: q.prompt,
        payload: {
          options: q.options.map((o) => o.text),
          rationales: q.options.map((o) => o.rationale),
        },
        answer: { correct_index: correctIdx },
        explanation: q.explanation,
        source_chunk_ids: citedChunkIds,
        verified: true,
        difficulty: q.difficulty ?? null,
      })
      .select('id')
      .single()
    if (error || !inserted) continue

    await admin
      .from('question_concepts')
      .insert({ question_id: inserted.id, concept_id: conceptId })
    persisted += 1
  }

  return { conceptId, drafted: parsed.questions.length, persisted }
}

export interface GenerateDeckResult {
  concepts: number
  drafted: number
  persisted: number
}

/**
 * Generate questions for concepts in a deck that don't yet have any. Bounded by
 * maxConcepts so one request stays within the function time limit; call again
 * to cover more concepts.
 */
export async function generateForDeck(
  deckId: string,
  opts: { perConcept?: number; maxConcepts?: number } = {},
): Promise<GenerateDeckResult> {
  const perConcept = opts.perConcept ?? 2
  const maxConcepts = opts.maxConcepts ?? 5
  const admin = createAdminClient()

  const { data: concepts } = await admin
    .from('concepts')
    .select('id')
    .eq('deck_id', deckId)
  if (!concepts || concepts.length === 0) {
    return { concepts: 0, drafted: 0, persisted: 0 }
  }

  // Skip concepts that already have questions.
  const { data: deckQuestions } = await admin
    .from('questions')
    .select('id')
    .eq('deck_id', deckId)
  const qIds = (deckQuestions ?? []).map((q) => q.id)
  let covered = new Set<string>()
  if (qIds.length) {
    const { data: linked } = await admin
      .from('question_concepts')
      .select('concept_id')
      .in('question_id', qIds)
    covered = new Set((linked ?? []).map((l) => l.concept_id))
  }
  const todo = concepts.filter((c) => !covered.has(c.id)).slice(0, maxConcepts)

  let drafted = 0
  let persisted = 0
  for (const c of todo) {
    const r = await generateForConcept(deckId, c.id, perConcept)
    drafted += r.drafted
    persisted += r.persisted
  }

  return { concepts: todo.length, drafted, persisted }
}

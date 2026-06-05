import 'server-only'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractSegments } from '@/lib/ingest/extract'
import { chunkSegments } from '@/lib/ingest/chunk'
import { embedDocuments, embedQuery, EMBEDDING_DIM } from '@/lib/voyage'
import { getAnthropic, MODELS } from '@/lib/anthropic'
import { conceptListSchema, verifySchema } from '@/lib/schemas'
import type { Json } from '@/lib/database.types'

const STORAGE_BUCKET = 'study-materials'
// ~45k tokens of source material is plenty to extract concepts from while
// keeping cost sane. Larger decks are evenly sampled across all chunks.
const MAX_CONCEPT_CONTEXT_CHARS = 180_000
const CHUNK_INSERT_BATCH = 200

// ============================================================
//  1a. Ingest — extract → chunk → embed → store
// ============================================================

export interface IngestResult {
  documentId: string
  status: 'ready' | 'failed'
  chunks: number
  error?: string
}

/**
 * Ingest a single document: download from Storage, extract text, chunk, embed
 * with Voyage, and write `chunks`. Idempotent — re-running replaces the
 * document's existing chunks. Updates `documents.status` along the way.
 */
export async function ingestDocument(documentId: string): Promise<IngestResult> {
  const admin = createAdminClient()

  const { data: doc, error } = await admin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()
  if (error || !doc) throw new Error(`Document ${documentId} not found`)

  await admin
    .from('documents')
    .update({ status: 'processing', error: null })
    .eq('id', documentId)

  try {
    const { data: file, error: dlErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .download(doc.storage_path)
    if (dlErr || !file) {
      throw new Error(`Storage download failed: ${dlErr?.message ?? 'no file'}`)
    }
    const buffer = Buffer.from(await file.arrayBuffer())

    const segments = await extractSegments(buffer, doc.filename, doc.mime_type)
    const chunks = chunkSegments(segments)
    if (chunks.length === 0) {
      throw new Error('No extractable text found in document')
    }

    const embeddings = await embedDocuments(chunks.map((c) => c.content))
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: ${embeddings.length} vs ${chunks.length} chunks`,
      )
    }
    if (embeddings[0] && embeddings[0].length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding dimension ${embeddings[0].length} != ${EMBEDDING_DIM} (chunks.embedding is vector(${EMBEDDING_DIM}))`,
      )
    }

    // Idempotent: drop any prior chunks for this document before re-inserting.
    await admin.from('chunks').delete().eq('document_id', documentId)

    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      deck_id: doc.deck_id,
      ord: c.ord,
      content: c.content,
      embedding: toVector(embeddings[i]),
      source_loc: c.source_loc as Json,
    }))
    for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
      const { error: insErr } = await admin
        .from('chunks')
        .insert(rows.slice(i, i + CHUNK_INSERT_BATCH))
      if (insErr) throw new Error(`Chunk insert failed: ${insErr.message}`)
    }

    await admin
      .from('documents')
      .update({ status: 'ready', error: null })
      .eq('id', documentId)

    return { documentId, status: 'ready', chunks: chunks.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from('documents')
      .update({ status: 'failed', error: message.slice(0, 1000) })
      .eq('id', documentId)
    return { documentId, status: 'failed', chunks: 0, error: message }
  }
}

// ============================================================
//  1b. Extract concepts — dedup against existing, with hierarchy
// ============================================================

const CONCEPT_SYSTEM = `You are the Source Expert for a study app. You read source material and produce a deduplicated list of the key CONCEPTS a learner must master.

Rules:
- Only extract concepts that are actually present in the source material. Never invent concepts or facts beyond the text.
- A concept is an atomic, testable knowledge unit (a principle, definition, formula, procedure, relationship, or classification) — not a whole chapter and not a trivial keyword.
- Give each concept a concise, canonical name and a one- to two-sentence description grounded in the source.
- Use parent_name to express hierarchy when a concept is clearly a sub-topic of another concept in your list; otherwise set parent_name to null.
- Do NOT duplicate any concept in the "existing concepts" list provided by the user.`

export interface ExtractConceptsResult {
  created: number
  total: number
}

/**
 * Extract concepts for a deck from its ingested chunks and insert new ones,
 * de-duplicating against concepts that already exist for the deck.
 */
export async function extractConcepts(
  deckId: string,
): Promise<ExtractConceptsResult> {
  const admin = createAdminClient()

  const { data: chunkRows } = await admin
    .from('chunks')
    .select('content, ord')
    .eq('deck_id', deckId)
    .order('ord', { ascending: true })
  if (!chunkRows || chunkRows.length === 0) return { created: 0, total: 0 }

  const corpus = sampleCorpus(
    chunkRows.map((c) => c.content),
    MAX_CONCEPT_CONTEXT_CHARS,
  )

  const { data: existing } = await admin
    .from('concepts')
    .select('id, name')
    .eq('deck_id', deckId)
  const existingNames = new Set(
    (existing ?? []).map((c) => c.name.trim().toLowerCase()),
  )

  const anthropic = getAnthropic()
  const response = await anthropic.messages.parse({
    model: MODELS.GENERATION,
    max_tokens: 8000,
    system: [
      { type: 'text', text: CONCEPT_SYSTEM },
      {
        type: 'text',
        text: `SOURCE MATERIAL:\n\n${corpus}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Existing concepts (do NOT duplicate these): ${
          existing && existing.length
            ? existing.map((c) => c.name).join('; ')
            : '(none yet)'
        }\n\nExtract the deduplicated concept list from the source material now.`,
      },
    ],
    output_config: { format: zodOutputFormat(conceptListSchema) },
  })

  const parsed = response.parsed_output
  if (!parsed) return { created: 0, total: existing?.length ?? 0 }

  const toInsert = parsed.concepts.filter(
    (c) => c.name.trim() && !existingNames.has(c.name.trim().toLowerCase()),
  )
  if (toInsert.length === 0) {
    return { created: 0, total: existing?.length ?? 0 }
  }

  // First pass: insert new concepts without parents.
  const { data: inserted, error: insErr } = await admin
    .from('concepts')
    .insert(
      toInsert.map((c) => ({
        deck_id: deckId,
        name: c.name.trim(),
        description: c.description?.trim() || null,
      })),
    )
    .select('id, name')
  if (insErr) throw new Error(`Concept insert failed: ${insErr.message}`)

  // Second pass: resolve parent_name → parent_id across existing + new.
  const idByName = new Map<string, string>()
  for (const c of existing ?? []) idByName.set(c.name.trim().toLowerCase(), c.id)
  for (const c of inserted ?? []) idByName.set(c.name.trim().toLowerCase(), c.id)

  for (const c of toInsert) {
    if (!c.parent_name) continue
    const childId = idByName.get(c.name.trim().toLowerCase())
    const parentId = idByName.get(c.parent_name.trim().toLowerCase())
    if (childId && parentId && childId !== parentId) {
      await admin.from('concepts').update({ parent_id: parentId }).eq('id', childId)
    }
  }

  const created = inserted?.length ?? 0
  return { created, total: (existing?.length ?? 0) + created }
}

// ============================================================
//  1c. Retrieve — vector search over a deck's chunks
// ============================================================

export interface RetrievedChunk {
  chunkId: string
  content: string
  source_loc: Json | null
  similarity: number
}

/** Embed a query and return the top-k most similar chunks in a deck. */
export async function retrieve(
  deckId: string,
  query: string,
  k = 8,
): Promise<RetrievedChunk[]> {
  const admin = createAdminClient()
  const embedding = await embedQuery(query)
  const { data, error } = await admin.rpc('match_chunks', {
    p_deck_id: deckId,
    p_query_embedding: toVector(embedding),
    p_match_count: k,
  })
  if (error) throw new Error(`retrieve failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    chunkId: r.id,
    content: r.content,
    source_loc: r.source_loc,
    similarity: r.similarity,
  }))
}

// ============================================================
//  1d. Verify — fact-check an answer against cited chunks
// ============================================================

const VERIFY_SYSTEM = `You are a strict fact-checker for a study app. You are given some CITED SOURCE CHUNKS, a QUESTION PROMPT, and a PROPOSED ANSWER.

Decide whether the proposed answer is FULLY supported by the cited chunk text:
- "supported" is true ONLY if the answer is directly and completely supported by the cited chunks.
- If the answer is unsupported, only partially supported, or contradicted by the chunks, "supported" is false.
- An answer with no relevant supporting chunk is always "supported": false.
- Never use outside knowledge — judge strictly against the cited chunk text.
- supporting_chunk_id: the id of the single chunk that best supports the answer, or null if none does.
- reason: one concise sentence explaining the decision.`

export interface VerifyInput {
  prompt: string
  answer: string
  chunkIds: string[]
}

export interface VerifyResult {
  supported: boolean
  supportingChunkId: string | null
  reason: string
}

/** Ask Haiku whether an answer is supported by its cited source chunks. */
export async function verify(input: VerifyInput): Promise<VerifyResult> {
  if (input.chunkIds.length === 0) {
    return {
      supported: false,
      supportingChunkId: null,
      reason: 'No source chunks were cited.',
    }
  }

  const admin = createAdminClient()
  const { data: chunks } = await admin
    .from('chunks')
    .select('id, content')
    .in('id', input.chunkIds)
  if (!chunks || chunks.length === 0) {
    return {
      supported: false,
      supportingChunkId: null,
      reason: 'Cited source chunks were not found.',
    }
  }

  const cited = chunks
    .map((c) => `[chunk ${c.id}]\n${c.content}`)
    .join('\n\n---\n\n')

  const anthropic = getAnthropic()
  const response = await anthropic.messages.parse({
    model: MODELS.VERIFICATION,
    max_tokens: 1024,
    system: VERIFY_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `CITED SOURCE CHUNKS:\n\n${cited}\n\nQUESTION PROMPT:\n${input.prompt}\n\nPROPOSED ANSWER:\n${input.answer}\n\nIs the proposed answer fully supported by the cited chunks?`,
      },
    ],
    output_config: { format: zodOutputFormat(verifySchema) },
  })

  const out = response.parsed_output
  if (!out) {
    return {
      supported: false,
      supportingChunkId: null,
      reason: 'Verifier returned no structured output.',
    }
  }
  return {
    supported: out.supported,
    supportingChunkId: out.supporting_chunk_id,
    reason: out.reason,
  }
}

// ============================================================
//  Helpers
// ============================================================

/** Serialize an embedding as a pgvector literal: `[0.1,0.2,...]`. */
function toVector(vec: number[]): string {
  return `[${vec.join(',')}]`
}

/**
 * Join chunk texts up to a char budget. If the corpus is larger, sample chunks
 * at an even stride so the whole deck is represented (not just the front).
 */
function sampleCorpus(texts: string[], maxChars: number): string {
  const total = texts.reduce((n, t) => n + t.length + 2, 0)
  if (total <= maxChars) return texts.join('\n\n')

  const target = Math.max(1, Math.floor(texts.length * (maxChars / total)))
  const step = Math.max(1, Math.floor(texts.length / target))
  const out: string[] = []
  let used = 0
  for (let i = 0; i < texts.length && used < maxChars; i += step) {
    out.push(texts[i])
    used += texts[i].length + 2
  }
  return out.join('\n\n')
}

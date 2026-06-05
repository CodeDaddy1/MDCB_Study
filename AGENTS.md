# AGENTS.md

Specifications for the application's **runtime AI agents**. These are TypeScript
services under `lib/agents/` that call the Anthropic and Voyage APIs at runtime.
They are **not** Claude Code subagents — they are part of the shipped product.

There are exactly **two** agents. Resist the urge to add more: the calendar,
streaks, scores, and growth features are plain SQL + app code and must not call
an LLM.

Shared principles for both agents:

- **Grounding.** Every factual claim must trace to specific source chunks.
  Neither agent may assert anything not supported by retrieved material.
- **Validation.** All model output is parsed with Zod (`lib/schemas.ts`) before
  it is written to the database. Reject and retry on parse failure.
- **Citations are mandatory.** Generated content carries `source_chunk_ids`.
- **Cost.** Use `claude-sonnet-4-6` for generation/extraction and
  `claude-haiku-4-5-20251001` for high-volume verification/grading. Use prompt
  caching on the shared source-material context.

---

## Agent 1 — Source Expert  (`lib/agents/expert.ts`)

Owns the source material and is the authority for grounding and fact-checking.
Four responsibilities:

### 1a. Ingest
- **Trigger:** a document finishes uploading (`documents.status = 'uploaded'`).
- **Input:** a file in Supabase Storage (PDF / pptx / plain text).
- **Process:** extract text → chunk (~500–800 tokens, ~15% overlap, respect
  headings/page boundaries) → embed each chunk with Voyage `voyage-4-lite` →
  insert into `chunks` with `source_loc` (page/heading) for citation.
- **Output:** rows in `chunks`; set `documents.status = 'ready'` (or `'failed'` + `error`).

### 1b. Extract concepts
- **Trigger:** after ingest of a deck's documents.
- **Process:** pass over the chunks with Claude to produce a deduplicated list of
  concepts `{ name, description, parent_name? }`. Match against existing
  `concepts` for the deck before inserting to avoid duplicates.
- **Output:** rows in `concepts` (with optional `parent_id` hierarchy).

### 1c. Retrieve
- **Input:** a query/topic + `deck_id`.
- **Process:** embed the query with Voyage, vector-search `chunks`
  (cosine, HNSW index) filtered to that deck, return top-k with their ids.
- **Output:** `{ chunkId, content, source_loc }[]` — the citation set.

### 1d. Verify (fact-check)
- **Input:** a question (prompt + answer) and its candidate `source_chunk_ids`.
- **Process:** ask Claude (`haiku`) whether the answer is fully supported by the
  cited chunk text. Strict: unsupported, partially supported, or contradicted → fail.
- **Output:** `{ supported: boolean, supportingChunkId?: string, reason: string }`.

**Guardrails:** never invent facts beyond retrieved text; if retrieval returns
nothing relevant, say so rather than guessing; a claim with no supporting chunk
is always `supported: false`.

---

## Agent 2 — Quiz Generator + Verifier  (`lib/agents/quiz-generator.ts`)

Produces verified questions and flashcards for a deck.

- **Trigger:** (a) after concept extraction, to seed a deck's question bank; and
  (b) lazily when a user opens a deck and needs items for due concepts.
- **Concept selection (app logic, not the LLM):** for the daily quiz, pull
  concepts from `concept_mastery` that are **due and weakest** (FSRS). For a new
  deck, cover all concepts.
- **Process (generate → verify loop):**
  1. For each target concept, call `Expert.retrieve` to get grounding chunks.
  2. Ask Claude (`sonnet`) to draft N candidate questions, each citing the
     chunk ids it used.
  3. Run `Expert.verify` on every candidate.
  4. Persist **only** candidates that pass, with `verified = true`, linked to
     their concept(s) via `question_concepts`.

### Question types (must match `questions.payload` / `questions.answer`)

- **mcq** — `payload {"options": [...]}`, `answer {"correct_index": n}`.
  Distractors must be plausible but clearly wrong per the source. No "all of the above".
- **ordered_steps** (math/process) — `payload {"steps": [...correct order]}`,
  `answer {"order": [0,1,2,...]}`. There must be a single correct order derivable
  from the source. Graded by longest-common-subsequence for partial credit (`lib/scoring.ts`).
- **term** (flashcard / memorization) — `payload {"term","definition"}`,
  `answer {"definition"}`. The definition must appear in or follow directly from the source.
- **short_answer** — `payload {"rubric"}`, `answer {"reference"}`. Graded by
  `haiku` against the rubric + cited chunk.

**Guardrails:** only `verified = true` questions are ever served (enforced again
at query time). No trick questions, no ambiguous answers, no content outside the
deck's source material.

# CLAUDE.md

Project memory for Claude Code. This is the file Claude Code loads natively.
Agent specifications live in `AGENTS.md` and are imported below.

@AGENTS.md

---

## What this is

A multi-user, Quizlet-style study app. Users create **decks**, upload source
material (PDFs, slide decks, notes), and the app generates **verified** quizzes
and flashcards grounded in that material. It tracks per-concept mastery with
spaced repetition, plus streaks, scores, a calendar, and growth charts.

## Stack

- **Next.js** (App Router, TypeScript strict) on **Vercel**
- **Supabase**: Postgres + Auth + Storage + **pgvector**
- **Anthropic API** (Claude) for concept extraction, quiz generation, grading
- **Voyage AI** for embeddings (REST; no first-party Node SDK)
- **ts-fsrs** for spaced-repetition mastery scheduling
- **Zod** for validating all LLM output before it touches the DB
- Tailwind + lucide-react + recharts for UI

## Package manager

**pnpm only.** Never `npm`/`yarn`.

## Commands

- `pnpm dev` — local dev
- `pnpm build` — production build (must pass before any "done")
- `pnpm typecheck` — `tsc --noEmit` (must pass before any "done")
- `pnpm lint` — eslint
- Migrations live in `supabase/migrations/`; apply with the Supabase CLI or SQL editor.

## Architecture

Two clean layers, enforced by Row Level Security (see the migration):

- **Content** — `decks, documents, chunks, concepts, questions` — owned per-deck
  by its creator. Readable by others only if the deck is public/unlisted.
- **Learning state** — `quizzes, attempts, concept_mastery, daily_activity,
  user_stats` — always scoped to the individual user (`user_id = auth.uid()`).

Only **two** runtime AI agents exist (`lib/agents/`). Everything else
(calendar, streaks, scores, growth) is plain SQL + app code — do **not** add LLM
calls to those. See `AGENTS.md`.

## Repo layout

```
app/            App Router. (auth)/ for login, (app)/ for the authed product, api/ for route handlers
lib/supabase/   server.ts, client.ts, middleware.ts (@supabase/ssr)
lib/anthropic.ts  Claude client + model constants
lib/voyage.ts     embeddings via REST
lib/agents/       expert.ts, quiz-generator.ts  (the two AI services)
lib/fsrs.ts       ts-fsrs wrapper for mastery updates
lib/scoring.ts    per-type grading (incl. LCS for ordered_steps)
lib/schemas.ts    Zod schemas for question payload/answer shapes
supabase/migrations/
```

## Conventions

- TypeScript strict; **named exports** (no default exports outside Next.js page/layout files).
- All external input and **all LLM output** is parsed with Zod before use.
- Server-only secrets are read in server contexts only. Never import the
  service-role client into a Client Component.
- Keep route handlers thin; business logic lives in `lib/`.

## Critical rules (load-bearing — do not violate)

1. **RLS is the security boundary.** The `SUPABASE_SERVICE_ROLE_KEY` bypasses
   RLS and may be used **only** in trusted server code (cron, admin tasks),
   never in anything reachable by the browser. No secret goes in a `NEXT_PUBLIC_*` var.
2. **Only serve `verified = true` questions.** A question is verified only after
   the verifier pass confirms its answer is supported by its cited
   `source_chunk_ids`. Never display or quiz on unverified questions.
3. **Every generated question must cite `source_chunk_ids`.** No citation → not verified.
4. **Embedding dimension is fixed by the model.** `chunks.embedding` is
   `vector(1024)` to match `voyage-4-lite`. Changing the embedding model
   requires a migration to the new dimension AND re-embedding all chunks.
5. **Daily quizzes are generated lazily** on first open and cached per
   `(user, deck, date)` via the `quizzes` unique constraint. Never pre-generate
   for all users in a cron job — generation exceeds the function timeout.
6. **Cron routes verify `CRON_SECRET`,** run in UTC, and have no automatic
   retries. Keep them idempotent.
7. **Daily quiz selection is driven by FSRS** — pick concepts that are *due and
   weak* from `concept_mastery`, not random questions.

## Model constants (verify latest in docs.claude.com before changing)

- Generation / concept extraction: `claude-sonnet-4-6`
- High-volume verification & grading: `claude-haiku-4-5-20251001`
- Embeddings: Voyage `voyage-4-lite` (1024-dim)
- Use Anthropic **prompt caching** on the source-material context to cut cost.

## Out of scope for now

Billing/Stripe, OCR (material is text-extractable), social/sharing UI beyond
public decks. Do not build these unless asked.

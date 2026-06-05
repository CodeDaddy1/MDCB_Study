# StudyApp

A multi-user, Quizlet-style study app. Upload source material; get verified,
source-grounded quizzes and flashcards with spaced-repetition mastery tracking,
streaks, scores, a calendar, and growth charts.

## Requirements

- **Node 20+** and **pnpm** (`corepack enable && corepack prepare pnpm@latest --activate`)
- A **Supabase** project (free tier is fine to start)
- An **Anthropic API key** — https://console.anthropic.com
- A **Voyage AI API key** (embeddings) — https://www.voyageai.com
- A **Vercel** account for deployment

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS — never expose |
| `ANTHROPIC_API_KEY` | server only | |
| `VOYAGE_API_KEY` | server only | |
| `CRON_SECRET` | server only | protects cron routes; any random string |

## Setup

1. `pnpm install`
2. **Database:** apply the migrations in `supabase/migrations/` in order
   (`0001` schema, `0002` storage policies, `0003` vector-search RPC). Use the
   Supabase CLI (`supabase db push`), the SQL editor, or the helper:
   `SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_ID=<ref> node scripts/apply-migration.mjs`
   (the script needs a Personal Access Token — the API keys can't run DDL).
   `0001` creates the `pgcrypto`/`vector` extensions, all tables, and RLS.
3. **Storage:** migration `0002` creates the private `study-materials` bucket
   and its RLS policies (a user may read/write objects only under a deck id
   they own — path convention `<deckId>/<uuid>/<filename>`). No manual setup
   needed once `0002` is applied.
4. `cp .env.example .env.local` and fill in the keys above.
5. `pnpm dev` → http://localhost:3000

## Key dependencies

- `next`, `react`, `react-dom`
- `@supabase/supabase-js`, `@supabase/ssr`
- `@anthropic-ai/sdk`
- `ts-fsrs` (spaced repetition)
- `zod` (validate LLM output)
- `unpdf` (PDF text extraction, serverless-friendly), `officeparser` (pptx/notes)
- `tailwindcss`, `lucide-react`, `recharts`

Voyage AI has no first-party Node SDK — call its embeddings REST endpoint with
`fetch` from server code (`lib/voyage.ts`).

## Deployment (Vercel)

1. Push to GitHub, import into Vercel.
2. Add all env vars in the Vercel project settings (mark the non-`NEXT_PUBLIC_`
   ones appropriately).
3. Cron is configured in `vercel.json`. Note: the **Hobby** plan allows
   once-daily cron with a ~10s function timeout and is non-commercial; for a
   real product use **Pro** (per-minute cron, 300s timeout). Cron does not do
   the heavy LLM work — quizzes are generated lazily on first open.

## Architecture

See `CLAUDE.md` (coding rules + the content/learning-state split) and
`AGENTS.md` (the two runtime AI agents: Source Expert and Quiz Generator).

## Build order

1. Schema ✅ (`supabase/migrations/0001_initial_schema.sql`)
2. Scaffold ✅ — Next.js + Supabase SSR clients + auth + config
3. Ingestion pipeline ✅ — Source Expert (`lib/agents/expert.ts`): extract →
   chunk → embed (Voyage) → concepts, plus storage policies (`0002`) and the
   `match_chunks` retrieval RPC (`0003`). Driven by
   `POST /api/documents/[id]/ingest` and the idempotent cron sweep
   `GET /api/cron/ingest`.
4. Quiz generator + verifier ✅ (MCQ) — `lib/agents/quiz-generator.ts`: drafts
   board-style MCQs grounded in handouts + answer-key chunks, each option with a
   rationale (why correct / why wrong), Verifier-checked before storage
   (`verified=true`). Trigger: `POST /api/decks/[deckId]/generate` (owner-gated).
   Other three question types still to add.
5. Study loop UI — _partial_: `/decks/[deckId]/quiz` renders verified MCQs with
   per-option reasoning + score. FSRS-driven daily selection still to add.
6. Progress layer (FSRS mastery, calendar, streaks, scores, growth charts)

### Seeding from local PDFs
`scripts/seed-deck.mjs` bulk-uploads the local MDCB PDFs into a deck and drives
ingestion through `/api/cron/ingest` (needs the app running with AI keys). See
the script header for usage. `scripts/extract-pdf.mjs` dumps a PDF's text per
page (debugging / offline study).

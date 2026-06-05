-- ============================================================
--  StudyApp — initial schema  (Supabase / Postgres + pgvector)
--
--  Tenancy model:
--    CONTENT        (decks, documents, chunks, concepts, questions)
--                   is owned per-deck by its creator.
--    LEARNING STATE (quizzes, attempts, concept_mastery,
--                   daily_activity, user_stats) is always
--                   scoped to the individual user.
--
--  This lets any user study a public deck while their streaks,
--  scores and mastery remain private to them.
-- ============================================================

-- ---------- Extensions --------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists vector;      -- pgvector

-- ---------- Enums -------------------------------------------
create type deck_visibility as enum ('private', 'unlisted', 'public');
create type question_type   as enum ('mcq', 'ordered_steps', 'term', 'short_answer');
create type document_status as enum ('uploaded', 'processing', 'ready', 'failed');
create type review_rating   as enum ('again', 'hard', 'good', 'easy');
create type mastery_state   as enum ('new', 'learning', 'review', 'relearning');

-- ---------- Profiles (1:1 with auth.users) ------------------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Decks (study sets) ------------------------------
create table decks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text,
  visibility  deck_visibility not null default 'private',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index decks_owner_idx on decks(owner_id);
create index decks_visibility_idx on decks(visibility) where visibility <> 'private';

-- ---------- Documents (uploaded source material) ------------
create table documents (
  id           uuid primary key default gen_random_uuid(),
  deck_id      uuid not null references decks(id) on delete cascade,
  filename     text not null,
  storage_path text not null,          -- path inside the Supabase Storage bucket
  mime_type    text,
  status       document_status not null default 'uploaded',
  error        text,
  created_at   timestamptz not null default now()
);
create index documents_deck_idx on documents(deck_id);

-- ---------- Chunks (embedded source text) -------------------
-- IMPORTANT: vector(N) must match your embedding model's output
-- dimension. voyage-4-lite defaults to 1024. Change here if you
-- pick a different model / output_dimension.
create table chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  deck_id     uuid not null references decks(id) on delete cascade,  -- denormalized for RLS + filtering
  ord         int  not null,
  content     text not null,
  embedding   vector(1024),
  source_loc  jsonb,        -- e.g. {"page": 12, "heading": "Le Chatelier's principle"}
  created_at  timestamptz not null default now()
);
create index chunks_document_idx  on chunks(document_id);
create index chunks_deck_idx       on chunks(deck_id);
create index chunks_embedding_idx  on chunks using hnsw (embedding vector_cosine_ops);

-- ---------- Concepts (extracted knowledge units) -----------
create table concepts (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references decks(id) on delete cascade,
  name        text not null,
  description text,
  parent_id   uuid references concepts(id) on delete set null,   -- optional hierarchy
  created_at  timestamptz not null default now()
);
create index concepts_deck_idx   on concepts(deck_id);
create index concepts_parent_idx on concepts(parent_id);

-- ---------- Questions (all quiz / flashcard items) ----------
--  payload / answer shapes by type:
--    mcq           payload {"options": [...]}              answer {"correct_index": 2}
--    ordered_steps payload {"steps": [...correct order]}   answer {"order": [0,1,2,3]}
--    term          payload {"term": "...", "definition":"..."}  answer {"definition": "..."}
--    short_answer  payload {"rubric": "..."}               answer {"reference": "..."}
create table questions (
  id               uuid primary key default gen_random_uuid(),
  deck_id          uuid not null references decks(id) on delete cascade,
  type             question_type not null,
  prompt           text not null,
  payload          jsonb not null default '{}'::jsonb,
  answer           jsonb not null default '{}'::jsonb,
  explanation      text,
  source_chunk_ids uuid[] not null default '{}',   -- citations -> chunks (the "fact check" trail)
  verified         boolean not null default false, -- true once it passes the verifier pass
  difficulty       smallint,                       -- optional 1..5
  created_at       timestamptz not null default now()
);
create index questions_deck_idx     on questions(deck_id);
create index questions_verified_idx on questions(deck_id, verified);

-- ---------- Question <-> Concept (m2m) ----------------------
create table question_concepts (
  question_id uuid not null references questions(id) on delete cascade,
  concept_id  uuid not null references concepts(id) on delete cascade,
  primary key (question_id, concept_id)
);
create index question_concepts_concept_idx on question_concepts(concept_id);

-- ---------- Quizzes (one daily quiz per user/deck/day) ------
create table quizzes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  deck_id    uuid not null references decks(id) on delete cascade,
  quiz_date  date not null default current_date,
  status     text not null default 'in_progress',  -- in_progress | completed
  created_at timestamptz not null default now(),
  unique (user_id, deck_id, quiz_date)
);
create index quizzes_user_idx on quizzes(user_id, quiz_date);

create table quiz_items (
  quiz_id     uuid not null references quizzes(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  ord         int  not null,
  primary key (quiz_id, question_id)
);

-- ---------- Attempts (every answer + flashcard review) ------
create table attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  question_id   uuid not null references questions(id) on delete cascade,
  quiz_id       uuid references quizzes(id) on delete set null,
  response      jsonb,
  is_correct    boolean,
  partial_score numeric(4,3),   -- 0..1, e.g. LCS ratio for ordered_steps
  rating        review_rating,  -- set for flashcard / FSRS reviews
  time_ms       int,
  answered_at   timestamptz not null default now()
);
create index attempts_user_time_idx on attempts(user_id, answered_at);
create index attempts_question_idx  on attempts(question_id);

-- ---------- Per-user, per-concept mastery (FSRS state) ------
create table concept_mastery (
  user_id     uuid not null references auth.users(id) on delete cascade,
  concept_id  uuid not null references concepts(id) on delete cascade,
  stability   double precision not null default 0,
  difficulty  double precision not null default 0,
  due         timestamptz not null default now(),
  last_review timestamptz,
  reps        int not null default 0,
  lapses      int not null default 0,
  state       mastery_state not null default 'new',
  updated_at  timestamptz not null default now(),
  primary key (user_id, concept_id)
);
create index concept_mastery_due_idx on concept_mastery(user_id, due);

-- ---------- Daily activity (calendar heatmap + streak src) --
create table daily_activity (
  user_id       uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  items_done    int  not null default 0,
  points        int  not null default 0,
  primary key (user_id, activity_date)
);

-- ---------- Rollup stats (streaks, totals) ------------------
create table user_stats (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  current_streak   int  not null default 0,
  longest_streak   int  not null default 0,
  last_active_date date,
  total_points     int  not null default 0,
  updated_at       timestamptz not null default now()
);

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

-- Helper: may the current user READ this deck?
create or replace function can_read_deck(d uuid)
returns boolean language sql stable
security definer set search_path = public as $$
  select exists (
    select 1 from decks
    where id = d
      and (owner_id = auth.uid() or visibility in ('public', 'unlisted'))
  );
$$;

-- Helper: does the current user OWN this deck?
create or replace function owns_deck(d uuid)
returns boolean language sql stable
security definer set search_path = public as $$
  select exists (select 1 from decks where id = d and owner_id = auth.uid());
$$;

-- Enable RLS everywhere
alter table profiles          enable row level security;
alter table decks             enable row level security;
alter table documents         enable row level security;
alter table chunks            enable row level security;
alter table concepts          enable row level security;
alter table questions         enable row level security;
alter table question_concepts enable row level security;
alter table quizzes           enable row level security;
alter table quiz_items        enable row level security;
alter table attempts          enable row level security;
alter table concept_mastery   enable row level security;
alter table daily_activity    enable row level security;
alter table user_stats        enable row level security;

-- profiles: any signed-in user can read display names; edit only your own
create policy profiles_read   on profiles for select to authenticated using (true);
create policy profiles_update on profiles for update using (id = auth.uid());

-- decks: read if owner or shared; write only if owner
create policy decks_read   on decks for select
  using (owner_id = auth.uid() or visibility in ('public', 'unlisted'));
create policy decks_insert on decks for insert with check (owner_id = auth.uid());
create policy decks_update on decks for update using (owner_id = auth.uid());
create policy decks_delete on decks for delete using (owner_id = auth.uid());

-- CONTENT tables: read if deck readable, write if deck owned
create policy documents_read  on documents for select using (can_read_deck(deck_id));
create policy documents_write on documents for all
  using (owns_deck(deck_id)) with check (owns_deck(deck_id));

create policy chunks_read  on chunks for select using (can_read_deck(deck_id));
create policy chunks_write on chunks for all
  using (owns_deck(deck_id)) with check (owns_deck(deck_id));

create policy concepts_read  on concepts for select using (can_read_deck(deck_id));
create policy concepts_write on concepts for all
  using (owns_deck(deck_id)) with check (owns_deck(deck_id));

create policy questions_read  on questions for select using (can_read_deck(deck_id));
create policy questions_write on questions for all
  using (owns_deck(deck_id)) with check (owns_deck(deck_id));

create policy qconcepts_read on question_concepts for select
  using (exists (select 1 from questions q where q.id = question_id and can_read_deck(q.deck_id)));
create policy qconcepts_write on question_concepts for all
  using (exists (select 1 from questions q where q.id = question_id and owns_deck(q.deck_id)))
  with check (exists (select 1 from questions q where q.id = question_id and owns_deck(q.deck_id)));

-- LEARNING STATE tables: strictly your own rows
create policy quizzes_own on quizzes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy quiz_items_own on quiz_items for all
  using (exists (select 1 from quizzes z where z.id = quiz_id and z.user_id = auth.uid()))
  with check (exists (select 1 from quizzes z where z.id = quiz_id and z.user_id = auth.uid()));

create policy attempts_own on attempts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy concept_mastery_own on concept_mastery for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy daily_activity_own on daily_activity for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_stats_own on user_stats for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
--  NOTE: Supabase Storage bucket policies are configured
--  separately (storage.objects). Create a private bucket named
--  'study-materials' and add a policy allowing a user to read/
--  write objects only under a path prefixed with their deck id
--  that they own. We'll set that up with the ingestion pipeline.
-- ============================================================

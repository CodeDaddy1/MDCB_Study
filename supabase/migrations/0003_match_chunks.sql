-- ============================================================
--  Vector search RPC for Source Expert retrieval (1c).
--  Cosine distance over the HNSW index on chunks.embedding.
--  SECURITY INVOKER (default): RLS on `chunks` still applies to the
--  caller; the service-role client bypasses RLS as usual.
-- ============================================================

create or replace function match_chunks(
  p_deck_id uuid,
  p_query_embedding vector(1024),
  p_match_count int default 8
)
returns table (
  id uuid,
  content text,
  source_loc jsonb,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    c.id,
    c.content,
    c.source_loc,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from chunks c
  where c.deck_id = p_deck_id
    and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit greatest(p_match_count, 1);
$$;

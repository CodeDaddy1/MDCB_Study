-- ============================================================
--  Storage: private 'study-materials' bucket + RLS policies
--
--  Objects are stored under "<deck_id>/<uuid>/<filename>". A user may
--  read/write objects only under a deck they own. owns_deck() is the
--  SECURITY DEFINER helper defined in 0001_initial_schema.sql.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('study-materials', 'study-materials', false)
on conflict (id) do nothing;

drop policy if exists "study_materials_select" on storage.objects;
drop policy if exists "study_materials_insert" on storage.objects;
drop policy if exists "study_materials_update" on storage.objects;
drop policy if exists "study_materials_delete" on storage.objects;

create policy "study_materials_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-materials'
    and owns_deck(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy "study_materials_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-materials'
    and owns_deck(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy "study_materials_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'study-materials'
    and owns_deck(nullif((storage.foldername(name))[1], '')::uuid)
  )
  with check (
    bucket_id = 'study-materials'
    and owns_deck(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy "study_materials_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'study-materials'
    and owns_deck(nullif((storage.foldername(name))[1], '')::uuid)
  );

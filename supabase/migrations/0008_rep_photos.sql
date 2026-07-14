-- Rep profile photos. First real use of Supabase Storage in this project.

alter table reps add column photo_url text;

-- Bucket must be created once via Studio (Storage → New bucket → "rep-photos",
-- Public bucket: on) since bucket creation isn't available through plain SQL
-- migrations — this file only sets up the access policies on storage.objects.
-- Expected object path convention: rep-photos/<rep_id>/<filename>.

create policy "public can read rep photos"
  on storage.objects for select
  using (bucket_id = 'rep-photos');

create policy "reps can upload their own photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'rep-photos'
    and (storage.foldername(name))[1] = (select id::text from reps where auth_user_id = auth.uid())
  );

create policy "reps can replace their own photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'rep-photos'
    and (storage.foldername(name))[1] = (select id::text from reps where auth_user_id = auth.uid())
  );

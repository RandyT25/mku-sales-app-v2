-- Photo attachments on competitor intel logs (backlog item from v2-brain.md).
-- Optional proof photo (e.g. a price tag/invoice) per log entry.
--
-- IMPORTANT — learned from the rep-photos bucket (0008) shipping without this
-- step ever being confirmed done: the bucket must be created manually in
-- Studio BEFORE this is considered live. SQL migrations cannot create
-- storage buckets. Studio → Storage → New bucket → name it exactly
-- "intel-photos" → Public bucket: on. Then verify with a real upload —
-- don't just ship the code and assume it works.
-- Expected object path convention: intel-photos/<rep_id>/<filename>.

alter table competitor_logs add column photo_url text;

-- Team-wide read, matching competitor_logs' own select policy (0003) —
-- any rep can see any other rep's intel entries, including photos.
create policy "public can read intel photos"
  on storage.objects for select
  using (bucket_id = 'intel-photos');

create policy "reps can upload their own intel photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'intel-photos'
    and (storage.foldername(name))[1] = (select id::text from reps where auth_user_id = auth.uid())
  );

create policy "reps can replace their own intel photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'intel-photos'
    and (storage.foldername(name))[1] = (select id::text from reps where auth_user_id = auth.uid())
  );

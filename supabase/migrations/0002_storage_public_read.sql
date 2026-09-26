-- Storage: public read of guidance clips. Writes stay on the secret key (service role).
-- Apply in the Supabase SQL editor if not already present.

alter table storage.objects enable row level security;

drop policy if exists "public read clips" on storage.objects;
create policy "public read clips"
on storage.objects
for select
using (bucket_id = 'clips');

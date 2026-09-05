-- Public sprite bucket. Runtime character atlases are loaded from here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-assets',
  'game-assets',
  true,
  10485760,
  array['image/png', 'application/json']
)
on conflict (id) do update set public = true;

drop policy if exists game_assets_read on storage.objects;
create policy game_assets_read on storage.objects
  for select using (bucket_id = 'game-assets');

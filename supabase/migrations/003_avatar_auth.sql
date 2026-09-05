-- Bind avatars to Auth users. Email + password accounts own their characters.

alter table public.avatars add column if not exists user_id uuid references auth.users (id) on delete cascade;
create index if not exists avatars_user_idx on public.avatars (user_id);

drop policy if exists avatars_read on public.avatars;
create policy avatars_read on public.avatars for select using (auth.uid() = user_id);

drop policy if exists avatars_write on public.avatars;
create policy avatars_write on public.avatars for insert with check (auth.uid() = user_id);

drop policy if exists avatars_update on public.avatars;
create policy avatars_update on public.avatars for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists avatars_delete on public.avatars;
create policy avatars_delete on public.avatars for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.avatars to authenticated;

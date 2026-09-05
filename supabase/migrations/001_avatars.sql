-- Player progress for Thiên Mệnh Nghịch Đồ.
-- Publishable key can read/write because there is no Auth user yet.
-- Each client only upserts the row matching its persistent tmnd.pid.

create table if not exists public.avatars (
  id uuid primary key,
  name text not null,
  character text not null,
  level integer not null default 1,
  xp integer not null default 0,
  hp integer,
  spiritual_power integer,
  inventory jsonb not null default '{}'::jsonb,
  zone text not null default 'ngoai-mon',
  x double precision not null default 1200,
  y double precision not null default 940,
  updated_at timestamptz not null default now()
);

alter table public.avatars add column if not exists hp integer;
alter table public.avatars add column if not exists spiritual_power integer;

alter table public.avatars enable row level security;

drop policy if exists avatars_read on public.avatars;
create policy avatars_read on public.avatars for select using (true);

drop policy if exists avatars_write on public.avatars;
create policy avatars_write on public.avatars for insert with check (true);

drop policy if exists avatars_update on public.avatars;
create policy avatars_update on public.avatars for update using (true) with check (true);

grant select, insert, update on table public.avatars to anon, authenticated;

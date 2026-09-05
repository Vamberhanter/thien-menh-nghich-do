-- Rooms, occupancy, spawn bind, and shared zone snapshots.
-- Run this in the game project's SQL editor (uzhcmgzpmdachfxohgoh).

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
alter table public.avatars add column if not exists spawn jsonb;
alter table public.avatars add column if not exists room_id text;

create table if not exists public.rooms (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id text not null references public.rooms (id) on delete cascade,
  player_id uuid not null,
  name text not null,
  character text not null,
  last_seen timestamptz not null default now(),
  primary key (room_id, player_id)
);

create index if not exists room_members_seen_idx on public.room_members (last_seen desc);

create table if not exists public.zone_states (
  room_id text not null references public.rooms (id) on delete cascade,
  zone text not null,
  snap jsonb not null,
  host_id uuid,
  updated_at timestamptz not null default now(),
  primary key (room_id, zone)
);

alter table public.avatars enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.zone_states enable row level security;

drop policy if exists avatars_read on public.avatars;
create policy avatars_read on public.avatars for select using (true);
drop policy if exists avatars_write on public.avatars;
create policy avatars_write on public.avatars for insert with check (true);
drop policy if exists avatars_update on public.avatars;
create policy avatars_update on public.avatars for update using (true) with check (true);

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select using (true);
drop policy if exists rooms_write on public.rooms;
create policy rooms_write on public.rooms for insert with check (true);
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update using (true) with check (true);

drop policy if exists room_members_read on public.room_members;
create policy room_members_read on public.room_members for select using (true);
drop policy if exists room_members_write on public.room_members;
create policy room_members_write on public.room_members for insert with check (true);
drop policy if exists room_members_update on public.room_members;
create policy room_members_update on public.room_members for update using (true) with check (true);
drop policy if exists room_members_delete on public.room_members;
create policy room_members_delete on public.room_members for delete using (true);

drop policy if exists zone_states_read on public.zone_states;
create policy zone_states_read on public.zone_states for select using (true);
drop policy if exists zone_states_write on public.zone_states;
create policy zone_states_write on public.zone_states for insert with check (true);
drop policy if exists zone_states_update on public.zone_states;
create policy zone_states_update on public.zone_states for update using (true) with check (true);

grant select, insert, update on table public.avatars to anon, authenticated;
grant select, insert, update on table public.rooms to anon, authenticated;
grant select, insert, update, delete on table public.room_members to anon, authenticated;
grant select, insert, update on table public.zone_states to anon, authenticated;

insert into public.rooms (id, name)
values
  ('thien-menh', 'Thiên Mệnh'),
  ('ngoai-mon', 'Ngoại Môn'),
  ('huyet-ma', 'Huyết Ma Cốc')
on conflict (id) do nothing;

alter table public.rooms replica identity full;
alter table public.room_members replica identity full;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.rooms';
  exception
    when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.room_members';
  exception
    when duplicate_object then null;
  end;
end $$;

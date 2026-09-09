-- Run this in the game project's SQL editor (uzhcmgzpmdachfxohgoh) — same as
-- 002_rooms.sql. The Supabase MCP connector attached to this session points
-- at a different account's projects, so it cannot apply this migration for
-- you; paste it into the SQL editor by hand.
--
-- Map Editor drafts: one row per map id, the full editor state as JSON.
-- Lets a designer close the browser mid-edit (or start a brand-new,
-- not-yet-registered map) and pick the exact same state back up later.
-- Same shape and policy as zone_states in 002_rooms.sql — open read/write,
-- no per-user ownership, matching how the rest of this table's siblings work.

create table if not exists public.map_drafts (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.map_drafts enable row level security;

drop policy if exists map_drafts_read on public.map_drafts;
create policy map_drafts_read on public.map_drafts for select using (true);
drop policy if exists map_drafts_write on public.map_drafts;
create policy map_drafts_write on public.map_drafts for insert with check (true);
drop policy if exists map_drafts_update on public.map_drafts;
create policy map_drafts_update on public.map_drafts for update using (true) with check (true);

grant select, insert, update on table public.map_drafts to anon, authenticated;

-- Visited teleport nodes, stored as a JSON array of zone ids.
alter table public.avatars add column if not exists warps jsonb not null default '[]'::jsonb;

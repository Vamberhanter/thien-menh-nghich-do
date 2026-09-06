-- Client MAX_LEVEL is 18 (Luyện Khí 1–9 + Trúc Cơ 1–9).
alter table public.avatars drop constraint if exists avatars_level_slice;
alter table public.avatars
  add constraint avatars_level_slice check (level >= 1 and level <= 18);

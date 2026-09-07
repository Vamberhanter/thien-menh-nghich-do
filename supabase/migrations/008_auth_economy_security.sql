-- Restore Supabase Auth ownership and add the server-authoritative economy.
-- Legacy rows are preserved. Avatars whose old public.users account cannot be
-- matched to auth.users remain inaccessible until an administrator assigns them.

-- Re-link public profiles to Auth without exposing the legacy password_hash.
insert into public.users (id, email, created_at, updated_at)
select id, email, created_at, now()
from auth.users
where email is not null
on conflict (id) do update
set email = excluded.email,
    updated_at = now();

create or replace function public.sync_public_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.users (id, email, created_at, updated_at)
  values (new.id, new.email, coalesce(new.created_at, now()), now())
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
  after insert or update of email on auth.users
  for each row execute function public.sync_public_user();

-- Accounts created after migration 006 exist only in public.users. Their bcrypt
-- hashes are compatible with GoTrue, so promote them without changing ids or
-- passwords. Skip an email that already has an Auth account; ownership below
-- will map that profile by email instead.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current
)
select
  '00000000-0000-0000-0000-000000000000',
  pu.id,
  'authenticated',
  'authenticated',
  lower(pu.email),
  pu.password_hash,
  now(),
  pu.created_at,
  now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  '{}'::jsonb,
  false,
  '',
  '',
  '',
  '',
  ''
from public.users pu
where coalesce(pu.password_hash, '') <> ''
  and not exists (select 1 from auth.users au where au.id = pu.id)
  and not exists (select 1 from auth.users au where lower(au.email) = lower(pu.email));

insert into auth.identities (
  user_id, identity_data, provider, provider_id, last_sign_in_at,
  created_at, updated_at
)
select
  au.id,
  jsonb_build_object('sub', au.id::text, 'email', au.email, 'email_verified', true),
  'email',
  au.id::text,
  now(),
  au.created_at,
  now()
from auth.users au
join public.users pu on pu.id = au.id
where au.email is not null
  and not exists (
    select 1 from auth.identities ai
    where ai.user_id = au.id and ai.provider = 'email'
  );

-- Prefer an exact id match. For accounts created by the old custom auth flow,
-- use the unique email to recover ownership when a Supabase Auth user exists.
update public.avatars a
set user_id = au.id
from public.users pu
join auth.users au on lower(au.email) = lower(pu.email)
where a.user_id = pu.id
  and a.user_id is distinct from au.id;

alter table public.avatars drop constraint if exists avatars_user_id_fkey;
alter table public.avatars
  add constraint avatars_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade
  not valid;

alter table public.avatars add column if not exists coins bigint not null default 0;
alter table public.avatars add column if not exists stat_points integer not null default 0;
alter table public.avatars add column if not exists skill_points integer not null default 0;
alter table public.avatars add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.avatars add column if not exists skills jsonb not null default '{}'::jsonb;
alter table public.avatars add column if not exists gems integer not null default 0;
alter table public.avatars add column if not exists quest_state jsonb not null default '{}'::jsonb;
alter table public.avatars add column if not exists farm_state jsonb not null default '{"plots":[]}'::jsonb;
alter table public.avatars add column if not exists tracked_quests jsonb not null default '[]'::jsonb;

alter table public.avatars drop constraint if exists avatars_coins_nonnegative;
alter table public.avatars add constraint avatars_coins_nonnegative check (coins >= 0);
alter table public.avatars drop constraint if exists avatars_stat_points_nonnegative;
alter table public.avatars add constraint avatars_stat_points_nonnegative check (stat_points >= 0);
alter table public.avatars drop constraint if exists avatars_skill_points_nonnegative;
alter table public.avatars add constraint avatars_skill_points_nonnegative check (skill_points >= 0);
alter table public.avatars drop constraint if exists avatars_gems_nonnegative;
alter table public.avatars add constraint avatars_gems_nonnegative check (gems >= 0);
alter table public.avatars drop constraint if exists avatars_attributes_object;
alter table public.avatars add constraint avatars_attributes_object
  check (jsonb_typeof(attributes) = 'object');
alter table public.avatars drop constraint if exists avatars_skills_object;
alter table public.avatars add constraint avatars_skills_object
  check (jsonb_typeof(skills) = 'object');

create table if not exists public.item_defs (
  key text primary key,
  name text not null,
  description text not null default '',
  item_type text not null,
  rarity text not null default 'common',
  max_stack integer not null default 1 check (max_stack > 0),
  buy_price bigint check (buy_price is null or buy_price >= 0),
  sell_price bigint check (sell_price is null or sell_price >= 0),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  gem_slots integer not null default 0 check (gem_slots >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.item_defs
  (key, name, item_type, rarity, max_stack, buy_price, sell_price, attributes, gem_slots)
values
  ('spirit-stone', 'Linh thạch', 'consumable', 'common', 20, 12, 5, '{}', 0),
  ('spirit-herb', 'Thanh linh thảo', 'consumable', 'common', 20, 24, 10, '{}', 0),
  ('blood-berry', 'Huyết quả', 'consumable', 'common', 20, 38, 16, '{}', 0),
  ('earth-fruit', 'Địa linh quả', 'consumable', 'rare', 20, 58, 24, '{}', 0),
  ('essence-root', 'Hoàng tinh căn', 'consumable', 'rare', 10, 110, 45, '{}', 0),
  ('spirit-herb-seed', 'Hạt Thanh Linh Thảo', 'material', 'common', 20, 8, 2, '{}', 0),
  ('blood-berry-seed', 'Hạt Huyết Quả', 'material', 'common', 20, 14, 4, '{}', 0),
  ('earth-fruit-seed', 'Hạt Địa Linh Quả', 'material', 'rare', 20, 24, 7, '{}', 0),
  ('essence-root-seed', 'Mầm Hoàng Tinh Căn', 'material', 'rare', 20, 50, 14, '{}', 0),
  ('iron-sword', 'Kiếm phế sắt', 'weapon', 'common', 1, 90, 35, '{"attack":4}', 1),
  ('bronze-sword', 'Thanh Đồng kiếm', 'weapon', 'rare', 1, 180, 70, '{"attack":7}', 1),
  ('jade-sword', 'Linh Ngọc kiếm', 'weapon', 'rare', 1, 360, 140, '{"attack":9,"maxSpiritualPower":5}', 2),
  ('demon-sword', 'Nghịch Đồ ma kiếm', 'weapon', 'epic', 1, null, 500, '{"attack":32,"maxHp":40}', 2),
  ('hong-ngoc-1', 'Hồng Ngọc bậc 1', 'gem', 'common', 20, null, 20, '{"attack":2}', 0),
  ('hong-ngoc-2', 'Hồng Ngọc bậc 2', 'gem', 'rare', 20, null, 80, '{"attack":5}', 0),
  ('hong-ngoc-3', 'Hồng Ngọc bậc 3', 'gem', 'epic', 20, null, 180, '{"attack":9}', 0),
  ('lam-ngoc-1', 'Lam Ngọc bậc 1', 'gem', 'common', 20, null, 20, '{"maxSpiritualPower":3}', 0),
  ('lam-ngoc-2', 'Lam Ngọc bậc 2', 'gem', 'rare', 20, null, 80, '{"maxSpiritualPower":7}', 0),
  ('lam-ngoc-3', 'Lam Ngọc bậc 3', 'gem', 'epic', 20, null, 180, '{"maxSpiritualPower":12}', 0),
  ('luc-ngoc-1', 'Lục Ngọc bậc 1', 'gem', 'common', 20, null, 20, '{"maxHp":12}', 0),
  ('luc-ngoc-2', 'Lục Ngọc bậc 2', 'gem', 'rare', 20, null, 80, '{"maxHp":28}', 0),
  ('luc-ngoc-3', 'Lục Ngọc bậc 3', 'gem', 'epic', 20, null, 180, '{"maxHp":50}', 0),
  ('hoang-ngoc-1', 'Hoàng Ngọc bậc 1', 'gem', 'common', 20, null, 20, '{"defense":1}', 0),
  ('hoang-ngoc-2', 'Hoàng Ngọc bậc 2', 'gem', 'rare', 20, null, 80, '{"defense":3}', 0),
  ('hoang-ngoc-3', 'Hoàng Ngọc bậc 3', 'gem', 'epic', 20, null, 180, '{"defense":5}', 0)
on conflict (key) do update set
  name = excluded.name,
  item_type = excluded.item_type,
  rarity = excluded.rarity,
  max_stack = excluded.max_stack,
  buy_price = excluded.buy_price,
  sell_price = excluded.sell_price,
  attributes = excluded.attributes,
  gem_slots = excluded.gem_slots,
  updated_at = now();

create table if not exists public.avatar_items (
  id bigint generated by default as identity primary key,
  avatar_id uuid not null references public.avatars (id) on delete cascade,
  item_key text not null references public.item_defs (key),
  quantity integer not null default 1 check (quantity > 0),
  equipped_slot text,
  enhancement_level integer not null default 0 check (enhancement_level >= 0),
  gems jsonb not null default '[]'::jsonb check (jsonb_typeof(gems) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (avatar_id, item_key)
);
create index if not exists avatar_items_avatar_idx on public.avatar_items (avatar_id);

update public.avatars
set coins = greatest(
  coins,
  case
    when coalesce(inventory ->> 'coins', '') ~ '^[0-9]+$'
      then (inventory ->> 'coins')::bigint
    else 0
  end
);

insert into public.avatar_items (avatar_id, item_key, quantity)
select a.id, bag.item_key, count(*)::integer
from public.avatars a
cross join lateral jsonb_array_elements_text(coalesce(a.inventory -> 'bag', '[]'::jsonb))
  as bag(item_key)
join public.item_defs d on d.key = bag.item_key
where bag.item_key is not null and bag.item_key <> ''
group by a.id, bag.item_key
on conflict (avatar_id, item_key) do update
set quantity = greatest(public.avatar_items.quantity, excluded.quantity),
    updated_at = now();

create table if not exists public.currency_ledger (
  id bigint generated always as identity primary key,
  avatar_id uuid not null references public.avatars (id) on delete cascade,
  currency text not null default 'coins' check (currency in ('coins', 'gems')),
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null,
  reference_id text,
  created_at timestamptz not null default now()
);
create index if not exists currency_ledger_avatar_idx
  on public.currency_ledger (avatar_id, created_at desc);
create unique index if not exists currency_ledger_reward_once_idx
  on public.currency_ledger (avatar_id, reason, reference_id)
  where reference_id is not null and reason like 'reward:%';

create table if not exists public.reward_receipts (
  avatar_id uuid not null references public.avatars (id) on delete cascade,
  reason text not null,
  reference_id text not null,
  created_at timestamptz not null default now(),
  primary key (avatar_id, reason, reference_id)
);

create table if not exists public.quest_defs (
  key text primary key,
  name text not null,
  description text not null default '',
  target integer not null default 1 check (target > 0),
  reward_coins bigint not null default 0 check (reward_coins >= 0),
  reward_xp integer not null default 0 check (reward_xp >= 0),
  reward_items jsonb not null default '{}'::jsonb check (jsonb_typeof(reward_items) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.quest_defs
  (key, name, description, target, reward_coins, reward_xp, reward_items)
values
  ('q01-nhap-mon', 'Bước Vào Ngoại Môn', 'Bái kiến trưởng lão.', 1, 20, 30, '{}'),
  ('q02-thu-luyen', 'Lần Đầu Thử Luyện', 'Đánh bại 3 Linh Cóc.', 3, 30, 45, '{}'),
  ('q03-linh-thao', 'Hương Linh Thảo', 'Thu thập linh thảo cho Dược Sư.', 5, 45, 65, '{"spirit-stone":2}'),
  ('q04-rung-ngoai-mon', 'Đường Vào Rừng', 'Tìm tới Rừng Ngoại Môn.', 1, 50, 75, '{}'),
  ('q05-lang-quan', 'Xà Quần Rình Rập', 'Tiêu diệt 5 Thanh Xà.', 5, 70, 100, '{}'),
  ('q06-linh-thach', 'Linh Thạch Ngũ Hành', 'Thu thập Mộc Linh Thạch.', 3, 90, 125, '{}'),
  ('q07-huyet-ma-coc', 'Dấu Vết Huyết Ma', 'Tiến vào Huyết Ma Cốc.', 5, 120, 170, '{}'),
  ('q08-cuu-de-tu', 'Cứu Đồng Môn', 'Tìm đệ tử bị thương.', 1, 140, 190, '{"blood-berry":2}'),
  ('q09-pha-tran', 'Phá Huyết Trận', 'Phá Viêm Thạch Khôi và tiến tới đàn.', 4, 180, 240, '{}'),
  ('q10-coc-chu', 'Huyết Ma Cốc Chủ', 'Đánh bại Huyết Ma Cốc Chủ.', 1, 350, 400, '{"demon-sword":1}')
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  target = excluded.target,
  reward_coins = excluded.reward_coins,
  reward_xp = excluded.reward_xp,
  reward_items = excluded.reward_items,
  updated_at = now();

create table if not exists public.avatar_quests (
  avatar_id uuid not null references public.avatars (id) on delete cascade,
  quest_key text not null references public.quest_defs (key),
  progress integer not null default 0 check (progress >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'claimed')),
  completed_at timestamptz,
  reward_claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (avatar_id, quest_key)
);

create table if not exists public.farm_plots (
  id bigint generated by default as identity primary key,
  avatar_id uuid not null references public.avatars (id) on delete cascade,
  plot_no integer not null check (plot_no >= 0),
  crop_key text,
  state text not null default 'empty' check (state in ('empty', 'planted', 'ready')),
  planted_at timestamptz,
  ready_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  updated_at timestamptz not null default now(),
  unique (avatar_id, plot_no)
);

alter table public.avatars enable row level security;
alter table public.users enable row level security;
alter table public.item_defs enable row level security;
alter table public.avatar_items enable row level security;
alter table public.currency_ledger enable row level security;
alter table public.reward_receipts enable row level security;
alter table public.quest_defs enable row level security;
alter table public.avatar_quests enable row level security;
alter table public.farm_plots enable row level security;

drop policy if exists avatars_read on public.avatars;
drop policy if exists avatars_write on public.avatars;
drop policy if exists avatars_update on public.avatars;
drop policy if exists avatars_delete on public.avatars;
create policy avatars_read on public.avatars for select to authenticated
  using ((select auth.uid()) = user_id);
create policy avatars_write on public.avatars for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy avatars_update on public.avatars for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy avatars_delete on public.avatars for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists users_no_direct on public.users;
drop policy if exists users_read on public.users;
drop policy if exists users_write on public.users;
drop policy if exists users_update on public.users;
create policy users_read on public.users for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists item_defs_read on public.item_defs;
create policy item_defs_read on public.item_defs for select to authenticated using (active);
drop policy if exists quest_defs_read on public.quest_defs;
create policy quest_defs_read on public.quest_defs for select to authenticated using (active);

drop policy if exists avatar_items_read on public.avatar_items;
create policy avatar_items_read on public.avatar_items for select to authenticated
  using (exists (
    select 1 from public.avatars a
    where a.id = avatar_items.avatar_id and a.user_id = (select auth.uid())
  ));
drop policy if exists currency_ledger_read on public.currency_ledger;
create policy currency_ledger_read on public.currency_ledger for select to authenticated
  using (exists (
    select 1 from public.avatars a
    where a.id = currency_ledger.avatar_id and a.user_id = (select auth.uid())
  ));
drop policy if exists avatar_quests_read on public.avatar_quests;
create policy avatar_quests_read on public.avatar_quests for select to authenticated
  using (exists (
    select 1 from public.avatars a
    where a.id = avatar_quests.avatar_id and a.user_id = (select auth.uid())
  ));
drop policy if exists farm_plots_read on public.farm_plots;
create policy farm_plots_read on public.farm_plots for select to authenticated
  using (exists (
    select 1 from public.avatars a
    where a.id = farm_plots.avatar_id and a.user_id = (select auth.uid())
  ));

-- Remove anonymous access and limit direct avatar writes to non-economic,
-- legacy-compatible columns. Economy tables are changed only through RPCs.
revoke all on table public.avatars from anon, authenticated;
grant select, delete on table public.avatars to authenticated;
grant insert (
  id, name, character, level, xp, hp, spiritual_power, inventory,
  attributes, skills, quest_state, farm_state, tracked_quests,
  zone, x, y, spawn, warps, room_id, user_id, updated_at
) on public.avatars to authenticated;
grant update (
  id, name, character, level, xp, hp, spiritual_power, inventory,
  attributes, skills, quest_state, farm_state, tracked_quests,
  zone, x, y, spawn, warps, room_id, user_id, updated_at
) on public.avatars to authenticated;

revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;
revoke all on function public.register_account(text, text) from public, anon, authenticated;
revoke all on function public.login_account(text, text) from public, anon, authenticated;
revoke all on function public.touch_user_login(uuid) from public, anon, authenticated;
revoke all on function public.sync_public_user() from public, anon, authenticated;

revoke all on table public.item_defs from anon, authenticated;
revoke all on table public.avatar_items from anon, authenticated;
revoke all on table public.currency_ledger from anon, authenticated;
revoke all on table public.reward_receipts from anon, authenticated;
revoke all on table public.quest_defs from anon, authenticated;
revoke all on table public.avatar_quests from anon, authenticated;
revoke all on table public.farm_plots from anon, authenticated;
grant select on table public.item_defs, public.avatar_items, public.currency_ledger,
  public.quest_defs, public.avatar_quests, public.farm_plots to authenticated;

create or replace function public.buy_item(
  p_avatar_id uuid,
  p_item_key text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_price bigint;
  v_total bigint;
  v_balance bigint;
  v_max_stack integer;
begin
  if p_quantity < 1 or p_quantity > 999 then
    raise exception 'Invalid quantity' using errcode = '22023';
  end if;

  select coins into v_balance
  from public.avatars
  where id = p_avatar_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Avatar not found' using errcode = 'P0002'; end if;

  select buy_price, max_stack into v_price, v_max_stack
  from public.item_defs
  where key = p_item_key and active and buy_price is not null
  for share;
  if not found then raise exception 'Item is not for sale' using errcode = 'P0002'; end if;
  if p_quantity > v_max_stack then raise exception 'Item stack is full' using errcode = '22003'; end if;

  v_total := v_price * p_quantity;
  if v_balance < v_total then raise exception 'Insufficient coins' using errcode = 'P0001'; end if;

  insert into public.avatar_items (avatar_id, item_key, quantity)
  values (p_avatar_id, p_item_key, p_quantity)
  on conflict (avatar_id, item_key) do update
  set quantity = public.avatar_items.quantity + excluded.quantity,
      updated_at = now()
  where public.avatar_items.quantity + excluded.quantity <= v_max_stack;
  if not found then raise exception 'Item stack is full' using errcode = '22003'; end if;

  update public.avatars set coins = coins - v_total where id = p_avatar_id
  returning coins into v_balance;
  if v_total > 0 then
    insert into public.currency_ledger (avatar_id, delta, balance_after, reason, reference_id)
    values (p_avatar_id, -v_total, v_balance, 'buy:item', p_item_key);
  end if;
  return jsonb_build_object('coins', v_balance, 'item_key', p_item_key, 'quantity', p_quantity);
end;
$$;

create or replace function public.sell_item(
  p_avatar_id uuid,
  p_item_key text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_price bigint;
  v_total bigint;
  v_balance bigint;
  v_owned integer;
  v_legacy_index integer;
begin
  if p_quantity < 1 or p_quantity > 999 then
    raise exception 'Invalid quantity' using errcode = '22023';
  end if;

  select coins into v_balance
  from public.avatars
  where id = p_avatar_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Avatar not found' using errcode = 'P0002'; end if;

  select sell_price into v_price
  from public.item_defs
  where key = p_item_key and active and sell_price is not null
  for share;
  if not found then raise exception 'Item cannot be sold' using errcode = 'P0002'; end if;

  select quantity into v_owned
  from public.avatar_items
  where avatar_id = p_avatar_id and item_key = p_item_key
  for update;
  if not found then
    if p_quantity <> 1 then
      raise exception 'Insufficient item quantity' using errcode = 'P0001';
    end if;
    select (entry.ordinality - 1)::integer into v_legacy_index
    from public.avatars a
    cross join lateral jsonb_array_elements(coalesce(a.inventory -> 'bag', '[]'::jsonb))
      with ordinality as entry(value, ordinality)
    where a.id = p_avatar_id and entry.value = to_jsonb(p_item_key)
    limit 1;
    if v_legacy_index is null then
      raise exception 'Insufficient item quantity' using errcode = 'P0001';
    end if;
    update public.avatars
    set inventory = jsonb_set(inventory, array['bag', v_legacy_index::text], 'null'::jsonb)
    where id = p_avatar_id;
  elsif v_owned < p_quantity then
    raise exception 'Insufficient item quantity' using errcode = 'P0001';
  elsif v_owned = p_quantity then
    delete from public.avatar_items where avatar_id = p_avatar_id and item_key = p_item_key;
  else
    update public.avatar_items
    set quantity = quantity - p_quantity, updated_at = now()
    where avatar_id = p_avatar_id and item_key = p_item_key;
  end if;

  v_total := v_price * p_quantity;
  update public.avatars set coins = coins + v_total where id = p_avatar_id
  returning coins into v_balance;
  if v_total > 0 then
    insert into public.currency_ledger (avatar_id, delta, balance_after, reason, reference_id)
    values (p_avatar_id, v_total, v_balance, 'sell:item', p_item_key);
  end if;
  return jsonb_build_object('coins', v_balance, 'item_key', p_item_key, 'quantity', p_quantity);
end;
$$;

create or replace function public.claim_quest_reward(
  p_avatar_id uuid,
  p_quest_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_quest public.quest_defs%rowtype;
  v_balance bigint;
  v_item record;
begin
  select coins into v_balance
  from public.avatars
  where id = p_avatar_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Avatar not found' using errcode = 'P0002'; end if;

  select * into v_quest from public.quest_defs
  where key = p_quest_key and active
  for share;
  if not found then raise exception 'Quest not found' using errcode = 'P0002'; end if;

  perform 1 from public.avatar_quests
  where avatar_id = p_avatar_id
    and quest_key = p_quest_key
    and status = 'completed'
    and progress >= v_quest.target
    and reward_claimed_at is null
  for update;
  if not found then raise exception 'Reward is unavailable or already claimed' using errcode = 'P0001'; end if;

  update public.avatar_quests
  set status = 'claimed', reward_claimed_at = now(), updated_at = now()
  where avatar_id = p_avatar_id and quest_key = p_quest_key;

  update public.avatars
  set coins = coins + v_quest.reward_coins,
      xp = xp + v_quest.reward_xp
  where id = p_avatar_id
  returning coins into v_balance;

  if v_quest.reward_coins > 0 then
    insert into public.currency_ledger (avatar_id, delta, balance_after, reason, reference_id)
    values (p_avatar_id, v_quest.reward_coins, v_balance, 'reward:quest', p_quest_key);
  end if;

  for v_item in select key, value from jsonb_each_text(v_quest.reward_items)
  loop
    if v_item.value::integer <= 0 then
      raise exception 'Invalid quest item reward';
    end if;
    insert into public.avatar_items (avatar_id, item_key, quantity)
    values (p_avatar_id, v_item.key, v_item.value::integer)
    on conflict (avatar_id, item_key) do update
    set quantity = public.avatar_items.quantity + excluded.quantity,
        updated_at = now();
  end loop;

  return jsonb_build_object('coins', v_balance, 'xp', v_quest.reward_xp, 'items', v_quest.reward_items);
end;
$$;

-- Backend-only generic reward entry point. reference_id makes retries idempotent.
create or replace function public.reward_avatar(
  p_avatar_id uuid,
  p_coins bigint,
  p_xp integer,
  p_reason text,
  p_reference_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance bigint;
begin
  if p_coins < 0 or p_xp < 0 or p_reason is null or btrim(p_reason) = ''
     or p_reference_id is null or btrim(p_reference_id) = '' then
    raise exception 'Invalid reward' using errcode = '22023';
  end if;
  if p_coins = 0 and p_xp = 0 then
    raise exception 'Empty reward' using errcode = '22023';
  end if;

  select coins into v_balance from public.avatars where id = p_avatar_id for update;
  if not found then raise exception 'Avatar not found' using errcode = 'P0002'; end if;

  insert into public.reward_receipts (avatar_id, reason, reference_id)
  values (p_avatar_id, p_reason, p_reference_id)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('coins', v_balance, 'duplicate', true);
  end if;

  update public.avatars
  set coins = coins + p_coins, xp = xp + p_xp
  where id = p_avatar_id
  returning coins into v_balance;
  if p_coins > 0 then
    insert into public.currency_ledger (avatar_id, delta, balance_after, reason, reference_id)
    values (p_avatar_id, p_coins, v_balance, 'reward:' || p_reason, p_reference_id);
  end if;
  return jsonb_build_object('coins', v_balance, 'xp', p_xp, 'duplicate', false);
end;
$$;

revoke all on function public.buy_item(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.sell_item(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.claim_quest_reward(uuid, text) from public, anon, authenticated;
revoke all on function public.reward_avatar(uuid, bigint, integer, text, text) from public, anon, authenticated;
grant execute on function public.buy_item(uuid, text, integer) to authenticated;
grant execute on function public.sell_item(uuid, text, integer) to authenticated;
grant execute on function public.claim_quest_reward(uuid, text) to authenticated;
grant execute on function public.reward_avatar(uuid, bigint, integer, text, text) to service_role;

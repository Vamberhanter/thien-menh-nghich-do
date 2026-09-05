-- Game accounts visible in the Table Editor. Password stays in auth.users.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

insert into public.users (id, email, created_at, updated_at)
select id, email, created_at, now()
from auth.users
where email is not null
on conflict (id) do update set email = excluded.email, updated_at = now();

alter table public.avatars drop constraint if exists avatars_user_id_fkey;
alter table public.avatars
  add constraint avatars_user_id_fkey
  foreign key (user_id) references public.users (id) on delete cascade;

alter table public.users enable row level security;

drop policy if exists users_read on public.users;
create policy users_read on public.users for select using (auth.uid() = id);

drop policy if exists users_write on public.users;
create policy users_write on public.users for insert with check (auth.uid() = id);

drop policy if exists users_update on public.users;
create policy users_update on public.users for update using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on table public.users to authenticated;
grant select, insert on table public.users to anon;

create or replace function public.sync_public_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, created_at, updated_at)
  values (new.id, new.email, now(), now())
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
  after insert or update of email on auth.users
  for each row
  execute function public.sync_public_user();

create or replace function public.touch_user_login(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users
  set last_login_at = now(), updated_at = now()
  where id = p_id;
$$;

grant execute on function public.touch_user_login(uuid) to authenticated, anon;

create or replace function public.register_account(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid := gen_random_uuid();
  normalized text;
begin
  normalized := lower(trim(p_email));
  if position('@' in normalized) = 0 then
    raise exception 'Email không hợp lệ';
  end if;
  if length(p_password) < 6 then
    raise exception 'Mật khẩu tối thiểu 6 ký tự';
  end if;
  if exists (select 1 from public.users where email = normalized)
     or exists (select 1 from auth.users where email = normalized) then
    raise exception 'Email này đã có tài khoản';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current
  ) values (
    '00000000-0000-0000-0000-000000000000',
    uid,
    'authenticated',
    'authenticated',
    normalized,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb,
    false,
    '',
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at,
    email
  ) values (
    uid,
    jsonb_build_object('sub', uid::text, 'email', normalized, 'email_verified', true),
    'email',
    uid::text,
    now(),
    now(),
    now(),
    normalized
  );

  insert into public.users (id, email, created_at, updated_at, last_login_at)
  values (uid, normalized, now(), now(), now())
  on conflict (id) do update
    set email = excluded.email,
        last_login_at = now(),
        updated_at = now();

  return jsonb_build_object('ok', true, 'id', uid);
end;
$$;

-- Accounts live only in public.users. Login / register do not call Auth.

alter table public.users drop constraint if exists users_id_fkey;
alter table public.users add column if not exists password_hash text;

update public.users u
set password_hash = au.encrypted_password
from auth.users au
where au.id = u.id
  and u.password_hash is null
  and au.encrypted_password is not null;

alter table public.users alter column password_hash set default '';

drop trigger if exists on_auth_user_sync on auth.users;

drop policy if exists avatars_read on public.avatars;
create policy avatars_read on public.avatars for select using (true);
drop policy if exists avatars_write on public.avatars;
create policy avatars_write on public.avatars for insert with check (true);
drop policy if exists avatars_update on public.avatars;
create policy avatars_update on public.avatars for update using (true) with check (true);
drop policy if exists avatars_delete on public.avatars;
create policy avatars_delete on public.avatars for delete using (true);

grant select, insert, update, delete on table public.avatars to anon, authenticated;

drop policy if exists users_read on public.users;
drop policy if exists users_write on public.users;
drop policy if exists users_update on public.users;
create policy users_no_direct on public.users for all using (false) with check (false);

create or replace function public.register_account(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  if exists (select 1 from public.users where email = normalized) then
    raise exception 'Email này đã có tài khoản';
  end if;

  insert into public.users (id, email, password_hash, created_at, updated_at, last_login_at)
  values (
    uid,
    normalized,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    now(),
    now()
  );

  return jsonb_build_object('id', uid, 'email', normalized);
end;
$$;

create or replace function public.login_account(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  row public.users;
  normalized text;
begin
  normalized := lower(trim(p_email));
  select * into row from public.users where email = normalized;
  if not found then
    raise exception 'Sai email hoặc mật khẩu';
  end if;
  if row.password_hash is null or row.password_hash = '' then
    raise exception 'Tài khoản chưa có mật khẩu. Hãy đăng ký lại.';
  end if;
  if extensions.crypt(p_password, row.password_hash) <> row.password_hash then
    raise exception 'Sai email hoặc mật khẩu';
  end if;

  update public.users
  set last_login_at = now(), updated_at = now()
  where id = row.id;

  return jsonb_build_object('id', row.id, 'email', row.email);
end;
$$;

grant execute on function public.register_account(text, text) to anon, authenticated;
grant execute on function public.login_account(text, text) to anon, authenticated;

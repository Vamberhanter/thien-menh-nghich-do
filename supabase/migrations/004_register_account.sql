-- Signup without /auth/v1/signup so the built-in email rate limit cannot 429.

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
  if exists (select 1 from auth.users where email = normalized) then
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

  return jsonb_build_object('ok', true, 'id', uid);
end;
$$;

revoke all on function public.register_account(text, text) from public;
grant execute on function public.register_account(text, text) to anon, authenticated;

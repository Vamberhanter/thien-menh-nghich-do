create or replace function public.claim_client_quest_reward(
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
  v_status text;
  v_balance bigint;
  v_item record;
begin
  select
    a.coins,
    a.quest_state #>> array['quests', p_quest_key, 'status']
  into v_balance, v_status
  from public.avatars a
  where a.id = p_avatar_id and a.user_id = auth.uid()
  for update;
  if not found then raise exception 'Avatar not found'; end if;
  if v_status not in ('completed', 'claimed') then
    raise exception 'Quest objectives are incomplete';
  end if;

  select * into v_quest
  from public.quest_defs
  where key = p_quest_key and active
  for share;
  if not found then raise exception 'Quest not found'; end if;

  insert into public.reward_receipts (avatar_id, reason, reference_id)
  values (p_avatar_id, 'quest', p_quest_key)
  on conflict do nothing;
  if not found then
    return jsonb_build_object(
      'coins', v_balance,
      'xp', 0,
      'items', '{}'::jsonb,
      'duplicate', true
    );
  end if;

  update public.avatars
  set coins = coins + v_quest.reward_coins
  where id = p_avatar_id
  returning coins into v_balance;

  if v_quest.reward_coins > 0 then
    insert into public.currency_ledger
      (avatar_id, delta, balance_after, reason, reference_id)
    values
      (p_avatar_id, v_quest.reward_coins, v_balance, 'reward:quest', p_quest_key);
  end if;

  for v_item in select key, value from jsonb_each_text(v_quest.reward_items)
  loop
    insert into public.avatar_items (avatar_id, item_key, quantity)
    values (p_avatar_id, v_item.key, v_item.value::integer)
    on conflict (avatar_id, item_key) do update
    set quantity = public.avatar_items.quantity + excluded.quantity,
        updated_at = now();
  end loop;

  return jsonb_build_object(
    'coins', v_balance,
    'xp', v_quest.reward_xp,
    'items', v_quest.reward_items,
    'duplicate', false
  );
end;
$$;

revoke all on function public.claim_client_quest_reward(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_client_quest_reward(uuid, text)
  to authenticated;

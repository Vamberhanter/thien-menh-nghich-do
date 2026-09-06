revoke all on function public.buy_item(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.sell_item(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.buy_item(uuid, text, integer) to authenticated;
grant execute on function public.sell_item(uuid, text, integer) to authenticated;

drop policy if exists reward_receipts_deny_client on public.reward_receipts;
create policy reward_receipts_deny_client
  on public.reward_receipts
  for select
  to authenticated
  using (false);

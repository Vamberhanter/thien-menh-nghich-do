-- Allow Kết Đan ranks (global levels 19–27).
alter table public.avatars drop constraint if exists avatars_level_slice;
alter table public.avatars
  add constraint avatars_level_slice check (level >= 1 and level <= 27);

insert into public.item_defs
  (key, name, item_type, rarity, max_stack, buy_price, sell_price, attributes, gem_slots)
values
  ('linh-cot-trung', 'Linh cốt trung phẩm', 'material', 'rare', 20, 95, 28, '{}', 0),
  ('yeu-dan', 'Yêu đan', 'material', 'rare', 10, 140, 40, '{}', 0),
  ('ket-dan-dan', 'Kết Đan đan', 'material', 'epic', 5, 780, 280, '{}', 0)
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

-- Breakthrough materials sold at Ngoại môn merchant.
insert into public.item_defs
  (key, name, item_type, rarity, max_stack, buy_price, sell_price, attributes, gem_slots)
values
  ('yeu-huyet', 'Yêu huyết', 'material', 'common', 30, 28, 8, '{}', 0),
  ('linh-cot-ha', 'Linh cốt hạ phẩm', 'material', 'common', 20, 48, 14, '{}', 0),
  ('truc-co-dan', 'Trúc Cơ đan', 'material', 'epic', 5, 320, 120, '{}', 0)
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

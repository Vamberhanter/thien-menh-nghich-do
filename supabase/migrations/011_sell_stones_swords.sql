-- Sellable linh thạch variants and mid/high-tier swords for shop + sell_item RPC.
insert into public.item_defs
  (key, name, item_type, rarity, max_stack, buy_price, sell_price, attributes, gem_slots)
values
  ('wood-stone', 'Mộc linh thạch', 'consumable', 'common', 20, null, 15, '{"cultivationXp":18}', 0),
  ('water-stone', 'Thủy linh thạch', 'consumable', 'common', 20, null, 24, '{"cultivationXp":28}', 0),
  ('fire-stone', 'Hỏa linh thạch', 'consumable', 'common', 20, null, 38, '{"cultivationXp":42}', 0),
  ('earth-stone', 'Thổ linh thạch', 'consumable', 'common', 20, null, 55, '{"cultivationXp":58}', 0),
  ('void-stone', 'Hư Không linh thạch', 'consumable', 'rare', 20, null, 80, '{"cultivationXp":85}', 0),
  ('gale-sword', 'Phong Vũ kiếm', 'equip', 'common', 1, null, 180, '{"attack":11,"speed":12}', 1),
  ('frost-sword', 'Hàn Băng kiếm', 'equip', 'common', 1, null, 220, '{"attack":14,"maxSpiritualPower":6}', 1),
  ('thunder-sword', 'Lôi Đình kiếm', 'equip', 'common', 1, null, 270, '{"attack":17,"speed":10}', 1),
  ('venom-sword', 'Độc Vụ kiếm', 'equip', 'common', 1, null, 320, '{"attack":20,"defense":3}', 1),
  ('flame-sword', 'Viêm Dương kiếm', 'equip', 'rare', 1, null, 380, '{"attack":23,"maxHp":20}', 2),
  ('blood-sword', 'Huyết Sát kiếm', 'equip', 'rare', 1, null, 450, '{"attack":27,"maxHp":30}', 2),
  ('demon-sword', 'Nghịch Đồ ma kiếm', 'equip', 'epic', 1, null, 500, '{"attack":32,"maxHp":40,"maxSpiritualPower":10}', 2)
on conflict (key) do update set
  name = excluded.name,
  item_type = excluded.item_type,
  rarity = excluded.rarity,
  max_stack = excluded.max_stack,
  buy_price = coalesce(excluded.buy_price, public.item_defs.buy_price),
  sell_price = excluded.sell_price,
  attributes = excluded.attributes,
  gem_slots = excluded.gem_slots,
  updated_at = now();

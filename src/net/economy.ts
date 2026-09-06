import { getSupabase } from './supabase';

export interface EconomyReceipt {
  coins: number;
  itemKey: string;
  quantity: number;
}

export interface QuestRewardReceipt {
  coins: number;
  xp: number;
  items: Record<string, number>;
  duplicate: boolean;
}

function receipt(raw: unknown): EconomyReceipt {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    coins: Math.max(0, Number(value.coins) || 0),
    itemKey: String(value.item_key ?? ''),
    quantity: Math.max(1, Number(value.quantity) || 1),
  };
}

export async function buyServerItem(
  avatarId: string,
  itemKey: string,
  quantity = 1,
): Promise<EconomyReceipt> {
  const { data, error } = await getSupabase().rpc('buy_item', {
    p_avatar_id: avatarId,
    p_item_key: itemKey,
    p_quantity: quantity,
  });
  if (error) throw new Error(error.message);
  return receipt(data);
}

export async function sellServerItem(
  avatarId: string,
  itemKey: string,
  quantity = 1,
): Promise<EconomyReceipt> {
  const { data, error } = await getSupabase().rpc('sell_item', {
    p_avatar_id: avatarId,
    p_item_key: itemKey,
    p_quantity: quantity,
  });
  if (error) throw new Error(error.message);
  return receipt(data);
}

export async function claimServerQuestReward(
  avatarId: string,
  questKey: string,
): Promise<QuestRewardReceipt> {
  const { data, error } = await getSupabase().rpc('claim_client_quest_reward', {
    p_avatar_id: avatarId,
    p_quest_key: questKey,
  });
  if (error) throw new Error(error.message);
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    coins: Math.max(0, Number(value.coins) || 0),
    xp: Math.max(0, Number(value.xp) || 0),
    items:
      value.items && typeof value.items === 'object'
        ? (value.items as Record<string, number>)
        : {},
    duplicate: Boolean(value.duplicate),
  };
}

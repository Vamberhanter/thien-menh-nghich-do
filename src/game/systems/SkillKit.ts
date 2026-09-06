import type { SkillClass } from './SkillSystem';
import { SKILL_CATALOG, SKILL_TREES } from './SkillSystem';
import type { SkillDefinition } from './CombatSystem';
import {
  AO_ANH_BO,
  BANG_PHACH_TRAM,
  BANG_TINH_TRAN,
  HU_VO_KIEM_KHI,
  HUYET_DIEM_TRAM,
  LIET_ANH_BO,
  SUONG_ANH_BO,
  TAM_THU_HONG,
  TINH_KHONG_TRAN,
  TINH_MANG_TRAM,
} from './CombatSystem';

/** Keyboard / pad binding labels for the character panel. */
export type KitBindKey = 'K' | 'L' | 'Space' | 'U';

export interface KitBinding {
  /** Tree skill ids for combat slots 0..n-1 (K, L, Space, …). */
  slots: readonly string[];
  /** Tree skill id for ultimate slot (U). */
  ultimate: string;
  /** Base kit defs aligned with `slots` (before tree scaling). */
  bases: readonly SkillDefinition[];
  /** Display key labels aligned with slots + ultimate. */
  keys: readonly KitBindKey[];
}

export const KIT_BINDINGS: Readonly<Record<SkillClass, KitBinding>> = {
  lamuyen: {
    slots: ['ly-kiem-thuc', 'pha-khong', 'ngu-kiem-bo'],
    ultimate: 'van-kiem-quy-tong',
    bases: [
      HU_VO_KIEM_KHI,
      { name: 'Phá Không', damageMultiplier: 1.8, cooldown: 3200, spiritCost: 9 },
      { name: 'Ngự Kiếm Bộ', damageMultiplier: 0, cooldown: 1000, spiritCost: 5 },
    ],
    keys: ['K', 'L', 'Space', 'U'],
  },
  nhuyen: {
    slots: ['han-bang-chuong', 'bang-lien', 'suong-anh-bo'],
    ultimate: 'thien-ly-bang-phong',
    bases: [BANG_PHACH_TRAM, BANG_TINH_TRAN, SUONG_ANH_BO],
    keys: ['K', 'L', 'Space', 'U'],
  },
  huyetlang: {
    slots: ['huyet-tram', 'huyet-bao', 'ma-anh-xung'],
    ultimate: 'ma-than-giang-the',
    bases: [HUYET_DIEM_TRAM, TAM_THU_HONG, LIET_ANH_BO],
    keys: ['K', 'L', 'Space', 'U'],
  },
  miku: {
    slots: ['am-nhan', 'that-huyen-khuc', 'ao-vu-bo'],
    ultimate: 'van-am-trieu-tong',
    bases: [TINH_MANG_TRAM, TINH_KHONG_TRAN, AO_ANH_BO],
    keys: ['K', 'L', 'Space', 'U'],
  },
};

const ULTIMATE_BASE: SkillDefinition = {
  name: 'Tuyệt kỹ',
  damageMultiplier: 2.8,
  cooldown: 16000,
  spiritCost: 18,
  recovery: 400,
};

/** First active with no prerequisites — seeded at rank 1 for new heroes. */
export function starterSkillId(classId: SkillClass): string | null {
  const found = SKILL_TREES[classId].find(
    (node) => node.kind === 'active' && Object.keys(node.prerequisites).length === 0,
  );
  return found?.id ?? null;
}

export function seedStarterRanks(classId: SkillClass): Record<string, number> {
  const id = starterSkillId(classId);
  return id ? { [id]: 1 } : {};
}

export function kitBindHint(skillId: string, classId: SkillClass): string | null {
  const bind = KIT_BINDINGS[classId];
  const slot = bind.slots.indexOf(skillId);
  if (slot >= 0) return bind.keys[slot] ?? null;
  if (bind.ultimate === skillId) return 'U';
  return null;
}

function scaleDef(base: SkillDefinition, treeId: string, rank: number): SkillDefinition {
  const node = SKILL_CATALOG[treeId];
  const locked = rank < 1;
  const safeRank = Math.max(1, rank);
  const treeMult = node?.effect.damageMultiplier;
  const damageMultiplier =
    base.damageMultiplier <= 0
      ? 0
      : (treeMult ?? base.damageMultiplier) * (1 + (safeRank - 1) * 0.08);
  const spiritCost = node?.effect.spiritualCost ?? base.spiritCost;
  const cooldown = node?.effect.cooldownSeconds
    ? Math.round(node.effect.cooldownSeconds * 1000)
    : base.cooldown;
  return {
    ...base,
    name: node?.name ?? base.name,
    damageMultiplier,
    spiritCost,
    cooldown,
    locked,
    treeId,
  };
}

/** Builds kit slots + ultimate from tree ranks (locked when rank 0). */
export function buildCombatKit(
  classId: SkillClass,
  ranks: Readonly<Record<string, number>>,
): SkillDefinition[] {
  const bind = KIT_BINDINGS[classId];
  const slots = bind.slots.map((id, index) =>
    scaleDef(bind.bases[index] ?? HU_VO_KIEM_KHI, id, ranks[id] ?? 0),
  );
  const ultNode = SKILL_CATALOG[bind.ultimate];
  const ultRank = ranks[bind.ultimate] ?? 0;
  const ultimate = scaleDef(
    {
      ...ULTIMATE_BASE,
      name: ultNode?.name ?? ULTIMATE_BASE.name,
      damageMultiplier: ultNode?.effect.damageMultiplier ?? ULTIMATE_BASE.damageMultiplier,
      spiritCost: ultNode?.effect.spiritualCost ?? ULTIMATE_BASE.spiritCost,
      cooldown: ultNode?.effect.cooldownSeconds
        ? Math.round(ultNode.effect.cooldownSeconds * 1000)
        : ULTIMATE_BASE.cooldown,
      frost: classId === 'nhuyen' ? 3 : undefined,
    },
    bind.ultimate,
    ultRank,
  );
  return [...slots, ultimate];
}

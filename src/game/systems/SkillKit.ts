import type { SkillClass } from './SkillSystem';
import { SKILL_CATALOG, SKILL_TREES } from './SkillSystem';
import type { SkillDefinition } from './CombatSystem';
import {
  AO_ANH_BO,
  BANG_PHACH_TRAM,
  BANG_TINH_TRAN,
  CAN_DAU_VAN,
  CUU_U_NO_DIEM,
  HANG_MA_CHAN_LOI,
  HUYET_DIEM_TRAM,
  HUYET_KIEM_SAT,
  LAC_ANH_KIEM_QUANG,
  NGU_KIEM_HANH,
  PHAN_THIEN_MA_DIEM,
  THANH_PHONG_TRAM,
  LIET_ANH_BO,
  SUONG_ANH_BO,
  TAM_THU_HONG,
  TINH_KHONG_TRAN,
  TINH_MANG_TRAM,
  VAN_KIEM_QUY_TONG,
} from './CombatSystem';

/** Keyboard / pad binding labels for the character panel. */
export type KitBindKey = 'K' | 'L' | 'O' | 'Space' | 'U';

export interface KitBinding {
  /** Tree skill ids for combat slots 0..n-1 (K, L, Space, …). */
  slots: readonly string[];
  /** Tree skill id for ultimate slot (U). */
  ultimate: string;
  /**
   * The ultimate's own definition, when it has one.
   *
   * Slots and tails are built from the kit's real definitions; the ultimate was
   * built from `ULTIMATE_BASE` for every character, so anything the tree does
   * not override — `recovery` above all — came from that placeholder and the
   * written definition was dead code. It cost Vạn Kiếm Quy Tông its hold: 400ms
   * against a technique that runs 1900, so she dropped out of the air with the
   * sword rain still falling.
   *
   * Optional because only hers has been checked against its art. The other four
   * still take the placeholder, which is what they have always taken.
   */
  ultimateBase?: SkillDefinition;
  /** Base kit defs aligned with `slots` (before tree scaling). */
  bases: readonly SkillDefinition[];
  /**
   * Slots that sit *past* the ultimate, with their bases.
   *
   * Only Tôn Ngộ Không has any. Three kits are three techniques plus an
   * ultimate, so "ultimate last" describes them exactly; he has four drawn
   * techniques and the cloud, and his ultimate is the fourth of those rather
   * than the end of the list. The alternative was to renumber `WukongSlot` so
   * the cloud came before the ultimate, which would have put the HUD order out
   * of step with the sheets the art was drawn on.
   */
  tail?: readonly string[];
  tailBases?: readonly SkillDefinition[];
  /** Display key labels aligned with the built kit: slots, ultimate, tail. */
  keys: readonly KitBindKey[];
}

export const KIT_BINDINGS: Readonly<Record<SkillClass, KitBinding>> = {
  wukong: {
    // In `WukongSlot` order — Nova, Lance, Wrath, then Dragon as the ultimate
    // and the cloud on slot 4. The entity casts by those indices, so this list
    // is what makes each key fire the technique the HUD names against it.
    slots: ['cuu-u-no-diem', 'hang-ma-chan-loi', 'phan-thien-ma-diem'],
    ultimate: 'ma-nguyet-tram',
    // His own definitions rather than restated numbers, so the tree scales the
    // same values the kit actually fires.
    bases: [CUU_U_NO_DIEM, HANG_MA_CHAN_LOI, PHAN_THIEN_MA_DIEM],
    tail: ['can-dau-van'],
    tailBases: [CAN_DAU_VAN],
    keys: ['K', 'L', 'U', 'O', 'Space'],
  },
  // Same five-slot shape as Tôn Ngộ Không, in `KiemTienSlot` order — Cut,
  // Lance, then Rain as the ultimate and Blood and the flight past it.
  kiemtien: {
    slots: ['thanh-phong-tram', 'lac-anh-kiem-quang'],
    ultimate: 'van-kiem-quy-tong',
    ultimateBase: VAN_KIEM_QUY_TONG,
    bases: [THANH_PHONG_TRAM, LAC_ANH_KIEM_QUANG],
    tail: ['huyet-kiem-sat', 'ngu-kiem-hanh'],
    tailBases: [HUYET_KIEM_SAT, NGU_KIEM_HANH],
    keys: ['K', 'L', 'U', 'O', 'Space'],
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

/** Tree ids in built-kit order, so a slot index means the same thing everywhere. */
function kitOrder(bind: KitBinding): readonly string[] {
  return [...bind.slots, bind.ultimate, ...(bind.tail ?? [])];
}

export function kitBindHint(skillId: string, classId: SkillClass): string | null {
  const bind = KIT_BINDINGS[classId];
  const slot = kitOrder(bind).indexOf(skillId);
  if (slot < 0) return null;
  return bind.keys[slot] ?? null;
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
    scaleDef(bind.bases[index] ?? CUU_U_NO_DIEM, id, ranks[id] ?? 0),
  );
  const ultNode = SKILL_CATALOG[bind.ultimate];
  const ultRank = ranks[bind.ultimate] ?? 0;
  const ultBase = bind.ultimateBase ?? ULTIMATE_BASE;
  const ultimate = scaleDef(
    {
      ...ultBase,
      name: ultNode?.name ?? ultBase.name,
      damageMultiplier: ultNode?.effect.damageMultiplier ?? ultBase.damageMultiplier,
      spiritCost: ultNode?.effect.spiritualCost ?? ultBase.spiritCost,
      cooldown: ultNode?.effect.cooldownSeconds
        ? Math.round(ultNode.effect.cooldownSeconds * 1000)
        : ultBase.cooldown,
      frost: classId === 'nhuyen' ? 3 : undefined,
    },
    bind.ultimate,
    ultRank,
  );
  const tail = (bind.tail ?? []).map((id, index) =>
    scaleDef(bind.tailBases?.[index] ?? CAN_DAU_VAN, id, ranks[id] ?? 0),
  );
  return [...slots, ultimate, ...tail];
}

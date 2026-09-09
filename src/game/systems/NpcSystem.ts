import type { ZoneId } from '../zones';

export type NpcRole = 'quest' | 'merchant' | 'gem' | 'alchemy';

export interface NpcDefinition {
  id: string;
  name: string;
  /**
   * What this NPC is for.
   *
   * Still here after dialogue arrived, because it is the fallback: an NPC whose
   * conversation has not been written yet opens the panel it always did, and
   * the marker's colour is drawn from it. It is no longer the *only* thing that
   * decides what talking to them does.
   */
  role: NpcRole;
  zone: ZoneId;
  x: number;
  y: number;
  /**
   * Conversation to open, from `data/dialogue.ts`. Defaults to the NPC's own
   * id, which is how all seven are keyed — spelled out only when one NPC
   * should share another's tree or carry two.
   */
  dialogueId?: string;
}

export const NPCS: readonly NpcDefinition[] = [
  { id: 'truong-lao', name: 'Trưởng Lão Ngoại Môn', role: 'quest', zone: 'ngoai-mon', x: 1120, y: 850 },
  { id: 'duoc-su', name: 'Dược Sư', role: 'merchant', zone: 'ngoai-mon', x: 1320, y: 850 },
  { id: 'khambao-su', name: 'Khảm Bảo Sư', role: 'gem', zone: 'ngoai-mon', x: 1450, y: 960 },
  { id: 'luyen-dan-su', name: 'Luyện Đan Sư', role: 'alchemy', zone: 'ngoai-mon', x: 1520, y: 820 },
  { id: 'du-phuong-thuong', name: 'Du Phương Thương', role: 'quest', zone: 'ngoai-mon', x: 980, y: 1100 },
  { id: 'de-tu-bi-thuong', name: 'Đệ Tử Bị Thương', role: 'quest', zone: 'huyet-ma-coc', x: 420, y: 1600 },
  { id: 'phong-linh-su', name: 'Phong Linh Sứ', role: 'quest', zone: 'thanh-phong-coc', x: 420, y: 900 },
];

export function npcsInZone(zone: ZoneId): readonly NpcDefinition[] {
  return NPCS.filter((npc) => npc.zone === zone);
}

/** The tree an NPC opens — their own id unless they name another. */
export function dialogueIdFor(npc: NpcDefinition): string {
  return npc.dialogueId ?? npc.id;
}

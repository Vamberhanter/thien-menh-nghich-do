import { HUYET_MA_COC } from './huyetMaCoc';
import { NGOAI_MON } from './ngoaiMon';
import { RUNG_NGOAI_MON } from './rungNgoaiMon';
import type { ZoneDef, ZoneId } from './types';

export type { ZoneDef, ZoneId, MobKind, GroundKind, PortalDef } from './types';
export {
  MOB_XP,
  BOSS_XP,
  STONE_XP,
  MOB_DROPS,
  BOSS_DROPS,
} from './types';

export const ZONES: Record<ZoneId, ZoneDef> = {
  'ngoai-mon': NGOAI_MON,
  'rung-ngoai-mon': RUNG_NGOAI_MON,
  'huyet-ma-coc': HUYET_MA_COC,
};

export const DEFAULT_ZONE: ZoneId = 'ngoai-mon';

export const ZONE_ORDER: readonly ZoneId[] = ['ngoai-mon', 'rung-ngoai-mon', 'huyet-ma-coc'];

export function zoneOf(id: string): ZoneDef {
  return ZONES[id as ZoneId] ?? NGOAI_MON;
}

/** Standing point after a warp — just south of the huyết mạch. */
export function warpStand(id: ZoneId): { x: number; y: number } {
  const zone = zoneOf(id);
  return { x: zone.shrine.x, y: zone.shrine.y + 50 };
}

import { HUYET_MA_COC } from './huyetMaCoc';
import { LINH_DIEN } from './linhDien';
import { NGOAI_MON } from './ngoaiMon';
import { RUNG_NGOAI_MON } from './rungNgoaiMon';
import { THANH_PHONG_COC } from './thanhPhongCoc';
import type { ZoneDef, ZoneId } from './types';

export type {
  ChestDef,
  ChestTier,
  FarmDecorDef,
  FarmDecorKind,
  FarmPlotDef,
  GroundKind,
  MobKind,
  PlantDef,
  PlantKind,
  PortalDef,
  ZoneDef,
  ZoneId,
} from './types';
export {
  MOB_XP,
  BOSS_XP,
  STONE_XP,
  MOB_DROPS,
  BOSS_DROPS,
  WIND_BOSS_DROPS,
} from './types';

export const ZONES: Record<ZoneId, ZoneDef> = {
  'ngoai-mon': NGOAI_MON,
  'linh-dien': LINH_DIEN,
  'rung-ngoai-mon': RUNG_NGOAI_MON,
  'huyet-ma-coc': HUYET_MA_COC,
  'thanh-phong-coc': THANH_PHONG_COC,
};

export const DEFAULT_ZONE: ZoneId = 'ngoai-mon';

export const ZONE_ORDER: readonly ZoneId[] = [
  'ngoai-mon',
  'linh-dien',
  'rung-ngoai-mon',
  'huyet-ma-coc',
  'thanh-phong-coc',
];

export function zoneOf(id: string): ZoneDef {
  return ZONES[id as ZoneId] ?? NGOAI_MON;
}

/** Standing point after a warp — just south of the dedicated travel altar. */
export function warpStand(id: ZoneId): { x: number; y: number } {
  const zone = zoneOf(id);
  return { x: zone.waypoint.x, y: zone.waypoint.y + 70 };
}

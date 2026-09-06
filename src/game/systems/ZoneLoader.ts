import type { ZoneId } from '../zones';

export interface ZoneAccessContext {
  level: number;
  /** Quests finished enough to unlock content (completed or claimed). */
  finishedQuests: ReadonlySet<string>;
}

export interface ZoneAccess {
  allowed: boolean;
  reason?: string;
}

export function canEnterZone(zone: ZoneId, context: Readonly<ZoneAccessContext>): ZoneAccess {
  if (zone === 'huyet-ma-coc') {
    if (context.level < 5) return { allowed: false, reason: 'Cần đạt Luyện Khí 5' };
  }
  if (zone === 'thanh-phong-coc' && context.level < 10) {
    return { allowed: false, reason: 'Cần đạt Trúc Cơ 1 (cấp 10)' };
  }
  if (zone === 'rung-ngoai-mon' && context.level < 3) {
    return { allowed: false, reason: 'Cần đạt Luyện Khí 3' };
  }
  return { allowed: true };
}

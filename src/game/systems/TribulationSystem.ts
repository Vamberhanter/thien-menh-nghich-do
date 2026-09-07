/** Heavenly tribulation before realm breakthrough. */

export const TRIBULATION_DURATION_MS = 45_000;
export const TRIBULATION_FAIL_COOLDOWN_MS = 8_000;

export interface TribulationPlan {
  mobKinds: ReadonlyArray<'serpent' | 'drake' | 'troll' | 'golem' | 'fire-drake' | 'ember-golem'>;
  count: number;
  label: string;
}

/** Scale trash wave by the peak level being broken through. */
export function planTribulation(fromLevel: number): TribulationPlan {
  if (fromLevel >= 18) {
    return {
      mobKinds: ['fire-drake', 'ember-golem', 'troll'],
      count: 3,
      label: 'Thiên Kiếp Kết Đan',
    };
  }
  if (fromLevel >= 9) {
    return {
      mobKinds: ['drake', 'golem', 'serpent'],
      count: 3,
      label: 'Thiên Kiếp Trúc Cơ',
    };
  }
  return {
    mobKinds: ['serpent', 'drake'],
    count: 2,
    label: 'Thiên Kiếp',
  };
}

export type TribulationPhase = 'idle' | 'active' | 'cooldown';

export interface TribulationState {
  phase: TribulationPhase;
  endsAt: number;
  cooldownUntil: number;
  remaining: number;
  label: string;
}

export function idleTribulation(): TribulationState {
  return { phase: 'idle', endsAt: 0, cooldownUntil: 0, remaining: 0, label: '' };
}

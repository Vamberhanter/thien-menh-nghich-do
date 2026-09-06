export type GemType = 'hong-ngoc' | 'lam-ngoc' | 'luc-ngoc' | 'hoang-ngoc';
export type GemTier = 1 | 2 | 3;
export type GemBonusStat = 'attack' | 'maxHp' | 'maxSpiritualPower' | 'defense';

export interface GemDefinition {
  id: string;
  name: string;
  type: GemType;
  tier: GemTier;
  bonus: Readonly<Partial<Record<GemBonusStat, number>>>;
}

export interface SocketState {
  socketCount: 0 | 1 | 2;
  gems: Array<string | null>;
}

export type GemError =
  | 'invalid-socket-count'
  | 'unknown-gem'
  | 'invalid-socket'
  | 'socket-occupied'
  | 'socket-empty'
  | 'gem-unavailable';

export type GemResult =
  | { ok: true; state: SocketState; gem: GemDefinition; inventoryDelta: Record<string, number> }
  | { ok: false; state: SocketState; error: GemError };

const GEM_NAMES: Readonly<Record<GemType, string>> = {
  'hong-ngoc': 'Hồng Ngọc',
  'lam-ngoc': 'Lam Ngọc',
  'luc-ngoc': 'Lục Ngọc',
  'hoang-ngoc': 'Hoàng Ngọc',
};

const GEM_STATS: Readonly<Record<GemType, GemBonusStat>> = {
  'hong-ngoc': 'attack',
  'lam-ngoc': 'maxSpiritualPower',
  'luc-ngoc': 'maxHp',
  'hoang-ngoc': 'defense',
};

const GEM_VALUES: Readonly<Record<GemBonusStat, readonly [number, number, number]>> = {
  attack: [2, 5, 9],
  maxHp: [12, 28, 50],
  maxSpiritualPower: [3, 7, 12],
  defense: [1, 3, 5],
};

const GEM_TYPES = Object.keys(GEM_NAMES) as GemType[];

export const GEM_CATALOG: Readonly<Record<string, GemDefinition>> = Object.freeze(
  Object.fromEntries(
    GEM_TYPES.flatMap((type) =>
      ([1, 2, 3] as const).map((tier) => {
        const stat = GEM_STATS[type];
        const id = `${type}-${tier}`;
        return [
          id,
          {
            id,
            name: `${GEM_NAMES[type]} bậc ${tier}`,
            type,
            tier,
            bonus: { [stat]: GEM_VALUES[stat][tier - 1] },
          } satisfies GemDefinition,
        ];
      }),
    ),
  ),
);

export function createSocketState(socketCount: 0 | 1 | 2): SocketState {
  return { socketCount, gems: Array.from({ length: socketCount }, () => null) };
}

export function snapshotSockets(state: Readonly<SocketState>): SocketState {
  const count = state.socketCount === 1 || state.socketCount === 2 ? state.socketCount : 0;
  return {
    socketCount: count,
    gems: Array.from({ length: count }, (_, index) => {
      const gemId = state.gems[index];
      return gemId && GEM_CATALOG[gemId] ? gemId : null;
    }),
  };
}

export function socketGem(
  state: Readonly<SocketState>,
  socketIndex: number,
  gemId: string,
  available = 1,
): GemResult {
  const next = snapshotSockets(state);
  const gem = GEM_CATALOG[gemId];
  if (!gem) return { ok: false, state: next, error: 'unknown-gem' };
  if (!Number.isInteger(socketIndex) || socketIndex < 0 || socketIndex >= next.socketCount) {
    return { ok: false, state: next, error: 'invalid-socket' };
  }
  if (next.gems[socketIndex]) return { ok: false, state: next, error: 'socket-occupied' };
  if (!Number.isInteger(available) || available < 1) {
    return { ok: false, state: next, error: 'gem-unavailable' };
  }
  next.gems[socketIndex] = gemId;
  return { ok: true, state: next, gem, inventoryDelta: { [gemId]: -1 } };
}

export function removeGem(state: Readonly<SocketState>, socketIndex: number): GemResult {
  const next = snapshotSockets(state);
  if (!Number.isInteger(socketIndex) || socketIndex < 0 || socketIndex >= next.socketCount) {
    return { ok: false, state: next, error: 'invalid-socket' };
  }
  const gemId = next.gems[socketIndex];
  if (!gemId) return { ok: false, state: next, error: 'socket-empty' };
  const gem = GEM_CATALOG[gemId];
  next.gems[socketIndex] = null;
  return { ok: true, state: next, gem, inventoryDelta: { [gemId]: 1 } };
}

export function gemBonuses(
  state: Readonly<SocketState>,
): Partial<Record<GemBonusStat, number>> {
  const total: Partial<Record<GemBonusStat, number>> = {};
  for (const gemId of snapshotSockets(state).gems) {
    const gem = gemId ? GEM_CATALOG[gemId] : undefined;
    if (!gem) continue;
    for (const [stat, amount] of Object.entries(gem.bonus)) {
      const key = stat as GemBonusStat;
      total[key] = (total[key] ?? 0) + (amount ?? 0);
    }
  }
  return total;
}

export interface DamageFormula {
  attack: number;
  defense: number;
  multiplier?: number;
  flatBonus?: number;
  criticalChance?: number;
  criticalMultiplier?: number;
}

export interface DamageResolution {
  damage: number;
  critical: boolean;
}

/** Shared deterministic damage formula; pass a seeded random source in tests/server simulation. */
export function resolveDamage(
  input: Readonly<DamageFormula>,
  random: () => number = Math.random,
): DamageResolution {
  const chance = Math.max(0, Math.min(1, input.criticalChance ?? 0.05));
  const critical = random() < chance;
  const raw =
    Math.max(1, input.attack) * Math.max(0, input.multiplier ?? 1) +
    (input.flatBonus ?? 0);
  const mitigated = raw * (100 / (100 + Math.max(0, input.defense)));
  const damage = mitigated * (critical ? Math.max(1, input.criticalMultiplier ?? 1.5) : 1);
  return { damage: Math.max(1, Math.round(damage)), critical };
}

/** The five trainable attributes. Kept independent from scenes and persistence. */
export const ATTRIBUTE_KEYS = [
  'thePhach',
  'lucDao',
  'linhLuc',
  'thanPhap',
  'canCot',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export interface AttributeValues {
  thePhach: number;
  lucDao: number;
  linhLuc: number;
  thanPhap: number;
  canCot: number;
}

export interface DerivedAttributeBonuses {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  maxSpiritualPower: number;
}

export interface AttributeState {
  values: AttributeValues;
  availablePoints: number;
}

export type AttributeError =
  | 'invalid-attribute'
  | 'invalid-amount'
  | 'insufficient-points'
  | 'below-minimum';

export type AttributeResult =
  | { ok: true; state: AttributeState; spent: number; refunded: number }
  | { ok: false; state: AttributeState; error: AttributeError };

export const BASE_ATTRIBUTES: Readonly<AttributeValues> = Object.freeze({
  thePhach: 0,
  lucDao: 0,
  linhLuc: 0,
  thanPhap: 0,
  canCot: 0,
});

export const ATTRIBUTE_LABELS: Readonly<Record<AttributeKey, string>> = Object.freeze({
  thePhach: 'Thể Phách',
  lucDao: 'Lực Đạo',
  linhLuc: 'Linh Lực',
  thanPhap: 'Thân Pháp',
  canCot: 'Căn Cốt',
});

function integer(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function cloneValues(values?: Partial<AttributeValues>): AttributeValues {
  return {
    thePhach: integer(values?.thePhach ?? 0),
    lucDao: integer(values?.lucDao ?? 0),
    linhLuc: integer(values?.linhLuc ?? 0),
    thanPhap: integer(values?.thanPhap ?? 0),
    canCot: integer(values?.canCot ?? 0),
  };
}

export function createAttributeState(
  availablePoints = 0,
  values: Partial<AttributeValues> = BASE_ATTRIBUTES,
): AttributeState {
  return { values: cloneValues(values), availablePoints: integer(availablePoints) };
}

export function isAttributeKey(value: string): value is AttributeKey {
  return (ATTRIBUTE_KEYS as readonly string[]).includes(value);
}

export function allocateAttribute(
  state: Readonly<AttributeState>,
  attribute: AttributeKey,
  amount = 1,
): AttributeResult {
  const snapshot = snapshotAttributes(state);
  if (!isAttributeKey(attribute)) return { ok: false, state: snapshot, error: 'invalid-attribute' };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, state: snapshot, error: 'invalid-amount' };
  }
  if (snapshot.availablePoints < amount) {
    return { ok: false, state: snapshot, error: 'insufficient-points' };
  }
  snapshot.values[attribute] += amount;
  snapshot.availablePoints -= amount;
  return { ok: true, state: snapshot, spent: amount, refunded: 0 };
}

export function refundAttribute(
  state: Readonly<AttributeState>,
  attribute: AttributeKey,
  amount = 1,
  minimum = 0,
): AttributeResult {
  const snapshot = snapshotAttributes(state);
  if (!isAttributeKey(attribute)) return { ok: false, state: snapshot, error: 'invalid-attribute' };
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(minimum) || minimum < 0) {
    return { ok: false, state: snapshot, error: 'invalid-amount' };
  }
  if (snapshot.values[attribute] - amount < minimum) {
    return { ok: false, state: snapshot, error: 'below-minimum' };
  }
  snapshot.values[attribute] -= amount;
  snapshot.availablePoints += amount;
  return { ok: true, state: snapshot, spent: 0, refunded: amount };
}

/**
 * Bonuses are additive. Căn Cốt reinforces both health and defence while
 * Thể Phách remains the strongest source of health.
 */
export function deriveAttributeBonuses(values: Readonly<AttributeValues>): DerivedAttributeBonuses {
  return {
    maxHp: values.thePhach * 10 + values.canCot * 4,
    attack: values.lucDao * 2,
    defense: values.thePhach + values.canCot * 2,
    speed: values.thanPhap * 3,
    maxSpiritualPower: values.linhLuc * 3 + values.canCot,
  };
}

export function snapshotAttributes(state: Readonly<AttributeState>): AttributeState {
  return createAttributeState(state.availablePoints, state.values);
}

export type SkillClass = 'wukong' | 'nhuyen' | 'huyetlang' | 'miku';
export type SkillKind = 'active' | 'passive';

export interface SkillEffect {
  stat?: 'attack' | 'defense' | 'maxHp' | 'speed' | 'maxSpiritualPower';
  value?: number;
  damageMultiplier?: number;
  cooldownSeconds?: number;
  spiritualCost?: number;
  description: string;
}

export interface SkillNode {
  id: string;
  classId: SkillClass;
  name: string;
  kind: SkillKind;
  maxRank: number;
  requiredLevel: number;
  prerequisites: Readonly<Record<string, number>>;
  costPerRank: number;
  effect: SkillEffect;
}

export interface SkillTreeState {
  classId: SkillClass;
  availablePoints: number;
  ranks: Record<string, number>;
}

export type SkillError =
  | 'unknown-skill'
  | 'wrong-class'
  | 'invalid-amount'
  | 'level-required'
  | 'prerequisite-required'
  | 'max-rank'
  | 'insufficient-points'
  | 'dependent-skill';

export type SkillResult =
  | { ok: true; state: SkillTreeState; node: SkillNode; pointsChanged: number }
  | { ok: false; state: SkillTreeState; error: SkillError; node?: SkillNode };

const node = (
  classId: SkillClass,
  id: string,
  name: string,
  kind: SkillKind,
  requiredLevel: number,
  prerequisites: Readonly<Record<string, number>>,
  effect: SkillEffect,
  maxRank = 3,
  costPerRank = 1,
): SkillNode => ({
  id,
  classId,
  name,
  kind,
  maxRank,
  requiredLevel,
  prerequisites,
  costPerRank,
  effect,
});

export const SKILL_TREES: Readonly<Record<SkillClass, readonly SkillNode[]>> = {
  // Five kit keys, not three: he has four drawn techniques plus the cloud, so
  // his tree carries two actives the other three do not.
  //
  // Cửu U Nộ Diễm leads deliberately. `seedStarterRanksInline` hands every new
  // hero the *first* active with no prerequisites, and for the other three that
  // skill is the one on K — so his has to be on K too, or he starts with every
  // kit key locked while they start with one. Cửu Chuyển Côn Pháp follows it
  // rather than leading: that node is his J staff chain, which is his basic
  // attack and works whatever the tree says, so it must not take the free rank.
  wukong: [
    node('wukong', 'cuu-u-no-diem', 'Cửu U Nộ Diễm', 'active', 1, {}, { damageMultiplier: 1.8, spiritualCost: 9, description: 'Lửa chạy dưới đất rồi nổ ở xa.' }),
    node('wukong', 'cuu-chuyen-con-phap', 'Cửu Chuyển Côn Pháp', 'active', 1, {}, { damageMultiplier: 1.25, spiritualCost: 4, description: 'Côn khí chém thẳng.' }),
    node('wukong', 'con-tam', 'Côn Tâm', 'passive', 2, { 'cuu-u-no-diem': 1 }, { stat: 'attack', value: 2, description: 'Tăng công kích.' }),
    node('wukong', 'can-dau-van', 'Cân Đẩu Vân', 'active', 3, { 'cuu-u-no-diem': 1 }, { cooldownSeconds: 6, spiritualCost: 5, description: 'Lên mây, bay theo hướng ngắm.' }),
    node('wukong', 'hang-ma-chan-loi', 'Hàng Ma Chân Lôi', 'active', 5, { 'con-tam': 2 }, { damageMultiplier: 2.4, cooldownSeconds: 3.8, spiritualCost: 9, description: 'Thương lôi đóng xuống mục tiêu.' }),
    node('wukong', 'con-cot', 'Côn Cốt', 'passive', 6, { 'can-dau-van': 1 }, { stat: 'defense', value: 2, description: 'Tăng phòng ngự.' }),
    node('wukong', 'phan-thien-ma-diem', 'Phần Thiên Ma Diễm', 'active', 7, { 'hang-ma-chan-loi': 1 }, { damageMultiplier: 2.6, cooldownSeconds: 6.8, spiritualCost: 14, description: 'Lửa dựng quanh mình thành mặt ma.' }),
    node('wukong', 'ma-nguyet-tram', 'Ma Nguyệt Trảm', 'active', 9, { 'hang-ma-chan-loi': 2, 'con-cot': 2 }, { damageMultiplier: 3, cooldownSeconds: 16, spiritualCost: 18, description: 'Tuyệt kỹ rồng khí.' }, 1, 2),
  ],
  nhuyen: [
    node('nhuyen', 'han-bang-chuong', 'Hàn Băng Chưởng', 'active', 1, {}, { damageMultiplier: 1.15, spiritualCost: 4, description: 'Chưởng lực mang hàn khí.' }),
    node('nhuyen', 'bang-tam', 'Băng Tâm', 'passive', 2, { 'han-bang-chuong': 1 }, { stat: 'maxSpiritualPower', value: 3, description: 'Tăng linh lực tối đa.' }),
    node('nhuyen', 'suong-anh-bo', 'Sương Ảnh Bộ', 'active', 3, { 'han-bang-chuong': 1 }, { cooldownSeconds: 5, spiritualCost: 5, description: 'Lướt để lại sương ảnh.' }),
    node('nhuyen', 'bang-lien', 'Băng Liên', 'active', 5, { 'bang-tam': 2 }, { damageMultiplier: 1.65, spiritualCost: 9, description: 'Băng nở quanh mục tiêu.' }),
    node('nhuyen', 'han-ngoc-the', 'Hàn Ngọc Thể', 'passive', 6, { 'suong-anh-bo': 1 }, { stat: 'defense', value: 2, description: 'Hàn khí hộ thể.' }),
    node('nhuyen', 'thien-ly-bang-phong', 'Thiên Lý Băng Phong', 'active', 9, { 'bang-lien': 2, 'han-ngoc-the': 2 }, { damageMultiplier: 2.8, cooldownSeconds: 18, spiritualCost: 20, description: 'Đóng băng một vùng lớn.' }, 1, 2),
  ],
  huyetlang: [
    node('huyetlang', 'huyet-tram', 'Huyết Trảm', 'active', 1, {}, { damageMultiplier: 1.35, spiritualCost: 3, description: 'Trọng kiếm huyết sát.' }),
    node('huyetlang', 'cuong-cot', 'Cường Cốt', 'passive', 2, { 'huyet-tram': 1 }, { stat: 'maxHp', value: 10, description: 'Tăng sinh lực.' }),
    node('huyetlang', 'ma-anh-xung', 'Ma Ảnh Xung', 'active', 3, { 'huyet-tram': 1 }, { cooldownSeconds: 7, spiritualCost: 4, description: 'Xung phong phá thế.' }),
    node('huyetlang', 'sat-y', 'Sát Ý', 'passive', 5, { 'cuong-cot': 2 }, { stat: 'attack', value: 3, description: 'Tăng công kích.' }),
    node('huyetlang', 'huyet-bao', 'Huyết Bạo', 'active', 6, { 'ma-anh-xung': 1 }, { damageMultiplier: 2, spiritualCost: 10, description: 'Bùng nổ huyết khí.' }),
    node('huyetlang', 'ma-than-giang-the', 'Ma Thần Giáng Thế', 'active', 9, { 'sat-y': 2, 'huyet-bao': 2 }, { damageMultiplier: 3.2, cooldownSeconds: 20, spiritualCost: 16, description: 'Trọng kiếm ma thần.' }, 1, 2),
  ],
  miku: [
    node('miku', 'am-nhan', 'Âm Nhận', 'active', 1, {}, { damageMultiplier: 1.2, spiritualCost: 4, description: 'Âm ba hóa lưỡi đao.' }),
    node('miku', 'linh-am', 'Linh Âm', 'passive', 2, { 'am-nhan': 1 }, { stat: 'maxSpiritualPower', value: 3, description: 'Tăng linh lực tối đa.' }),
    node('miku', 'ao-vu-bo', 'Ảo Vũ Bộ', 'active', 3, { 'am-nhan': 1 }, { cooldownSeconds: 5, spiritualCost: 5, description: 'Vũ bộ né tránh.' }),
    node('miku', 'cong-minh', 'Cộng Minh', 'passive', 5, { 'linh-am': 2 }, { stat: 'attack', value: 2, description: 'Khuếch đại âm lực.' }),
    node('miku', 'that-huyen-khuc', 'Thất Huyền Khúc', 'active', 6, { 'ao-vu-bo': 1 }, { damageMultiplier: 1.9, spiritualCost: 10, description: 'Liên hoàn âm nhận.' }),
    node('miku', 'van-am-trieu-tong', 'Vạn Âm Triều Tông', 'active', 9, { 'cong-minh': 2, 'that-huyen-khuc': 2 }, { damageMultiplier: 2.9, cooldownSeconds: 17, spiritualCost: 19, description: 'Âm triều quét chiến trường.' }, 1, 2),
  ],
};

const ALL_NODES = Object.values(SKILL_TREES).flat();
export const SKILL_CATALOG: Readonly<Record<string, SkillNode>> = Object.freeze(
  Object.fromEntries(ALL_NODES.map((skill) => [skill.id, skill])),
);

const whole = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export function createSkillState(classId: SkillClass, availablePoints = 0): SkillTreeState {
  return {
    classId,
    availablePoints: whole(availablePoints),
    ranks: seedStarterRanksInline(classId),
  };
}

function seedStarterRanksInline(classId: SkillClass): Record<string, number> {
  const found = SKILL_TREES[classId].find(
    (skill) => skill.kind === 'active' && Object.keys(skill.prerequisites).length === 0,
  );
  return found ? { [found.id]: 1 } : {};
}

export function snapshotSkills(state: Readonly<SkillTreeState>): SkillTreeState {
  const allowed = new Set(SKILL_TREES[state.classId].map(({ id }) => id));
  const ranks: Record<string, number> = {};
  for (const [id, rank] of Object.entries(state.ranks)) {
    if (allowed.has(id) && whole(rank) > 0) ranks[id] = whole(rank);
  }
  // The starter is free by design rather than bought, so guarantee it instead
  // of only filling it in when the map came back empty. That second form also
  // doubles as the migration for a hero saved under an older tree, whose free
  // skill may since have moved: Tôn Ngộ Không's heroes hold their seeded rank
  // in the staff chain, and without this they keep every kit key locked.
  for (const [id, rank] of Object.entries(seedStarterRanksInline(state.classId))) {
    if ((ranks[id] ?? 0) < rank) ranks[id] = rank;
  }
  return { classId: state.classId, availablePoints: whole(state.availablePoints), ranks };
}

export function canLearnSkill(
  state: Readonly<SkillTreeState>,
  skillId: string,
  playerLevel: number,
): SkillError | null {
  const skill = SKILL_CATALOG[skillId];
  if (!skill) return 'unknown-skill';
  if (skill.classId !== state.classId) return 'wrong-class';
  if (playerLevel < skill.requiredLevel) return 'level-required';
  if ((state.ranks[skillId] ?? 0) >= skill.maxRank) return 'max-rank';
  if (state.availablePoints < skill.costPerRank) return 'insufficient-points';
  for (const [requiredId, rank] of Object.entries(skill.prerequisites)) {
    if ((state.ranks[requiredId] ?? 0) < rank) return 'prerequisite-required';
  }
  return null;
}

export function spendSkillPoint(
  state: Readonly<SkillTreeState>,
  skillId: string,
  playerLevel: number,
  amount = 1,
): SkillResult {
  let next = snapshotSkills(state);
  const skill = SKILL_CATALOG[skillId];
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, state: next, error: 'invalid-amount', node: skill };
  }
  for (let index = 0; index < amount; index += 1) {
    const error = canLearnSkill(next, skillId, playerLevel);
    if (error) return { ok: false, state: snapshotSkills(state), error, node: skill };
    next.ranks[skillId] = (next.ranks[skillId] ?? 0) + 1;
    next.availablePoints -= skill.costPerRank;
  }
  return { ok: true, state: next, node: skill, pointsChanged: -skill.costPerRank * amount };
}

export function refundSkillPoint(
  state: Readonly<SkillTreeState>,
  skillId: string,
  amount = 1,
): SkillResult {
  const next = snapshotSkills(state);
  const skill = SKILL_CATALOG[skillId];
  if (!skill) return { ok: false, state: next, error: 'unknown-skill' };
  if (skill.classId !== state.classId) return { ok: false, state: next, error: 'wrong-class', node: skill };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, state: next, error: 'invalid-amount', node: skill };
  }
  const targetRank = (next.ranks[skillId] ?? 0) - amount;
  if (targetRank < 0) return { ok: false, state: next, error: 'invalid-amount', node: skill };
  for (const candidate of SKILL_TREES[state.classId]) {
    if ((next.ranks[candidate.id] ?? 0) > 0 && (candidate.prerequisites[skillId] ?? 0) > targetRank) {
      return { ok: false, state: next, error: 'dependent-skill', node: skill };
    }
  }
  if (targetRank === 0) delete next.ranks[skillId];
  else next.ranks[skillId] = targetRank;
  const refund = skill.costPerRank * amount;
  next.availablePoints += refund;
  return { ok: true, state: next, node: skill, pointsChanged: refund };
}

export class SkillSystem {
  private state: SkillTreeState;

  constructor(classId: SkillClass, availablePoints = 0, restored?: SkillTreeState) {
    this.state = restored?.classId === classId
      ? snapshotSkills(restored)
      : createSkillState(classId, availablePoints);
  }

  spend(skillId: string, playerLevel: number, amount = 1): SkillResult {
    const result = spendSkillPoint(this.state, skillId, playerLevel, amount);
    if (result.ok) this.state = result.state;
    return result;
  }

  refund(skillId: string, amount = 1): SkillResult {
    const result = refundSkillPoint(this.state, skillId, amount);
    if (result.ok) this.state = result.state;
    return result;
  }

  grantPoints(amount: number): void {
    this.state.availablePoints += whole(amount);
  }

  snapshot(): SkillTreeState {
    return snapshotSkills(this.state);
  }
}

import { describe, expect, it } from 'vitest';
import {
  allocateAttribute,
  createAttributeState,
  deriveAttributeBonuses,
} from './Attributes';
import { breakThrough, canBreakThrough } from './BreakthroughSystem';
import { craftAlchemy } from './AlchemySystem';
import { planTribulation } from './TribulationSystem';
import { buildCombatKit, kitBindHint } from './SkillKit';
import { createFarmState, harvestPlot, plantSeed, waterPlot } from './Farming';
import { createSocketState, gemBonuses, socketGem } from './GemSystem';
import { Inventory, itemOf } from './Inventory';
import {
  QuestSystem,
  createQuestState,
  refreshQuestAvailability,
} from './QuestSystem';
import { Progression, REALM_SIZE, titleForLevel } from './Progression';
import {
  createShopState,
  buyOffer,
  sellItem,
} from './ShopSystem';
import {
  createSkillState,
  spendSkillPoint,
} from './SkillSystem';
import { resolveDamage } from './CombatResolver';
import { canEnterZone } from './ZoneLoader';

describe('character progression systems', () => {
  it('allocates attributes without mutating the source', () => {
    const source = createAttributeState(2);
    const result = allocateAttribute(source, 'thePhach');
    expect(result.ok).toBe(true);
    expect(source.availablePoints).toBe(2);
    if (!result.ok) return;
    expect(result.state.availablePoints).toBe(1);
    expect(deriveAttributeBonuses(result.state.values).maxHp).toBe(10);
  });

  it('enforces skill level and prerequisites', () => {
    let state = createSkillState('nhuyen', 3);
    expect(state.ranks['han-bang-chuong']).toBe(1);
    expect(spendSkillPoint(state, 'bang-lien', 9).ok).toBe(false);
    const learned = spendSkillPoint(state, 'han-bang-chuong', 1);
    expect(learned.ok).toBe(true);
    if (!learned.ok) return;
    state = learned.state;
    expect(state.ranks['han-bang-chuong']).toBe(2);
  });

  it('uses the shared mitigation and critical formula deterministically', () => {
    const normal = resolveDamage({ attack: 100, defense: 100, criticalChance: 0 }, () => 1);
    expect(normal).toEqual({ damage: 50, critical: false });
    const critical = resolveDamage(
      { attack: 100, defense: 100, criticalChance: 1, criticalMultiplier: 2 },
      () => 0,
    );
    expect(critical).toEqual({ damage: 100, critical: true });
  });

  it('stops XP at Luyện Khí peak until đột phá', () => {
    const progress = new Progression();
    progress.restore({ level: REALM_SIZE, xp: 0 });
    expect(progress.atRealmCap).toBe(true);
    expect(progress.grant(999)).toBe(0);
    expect(progress.level).toBe(REALM_SIZE);
    expect(titleForLevel(REALM_SIZE)).toContain('Luyện Khí');
  });

  it('breaks through to Trúc Cơ when materials are present', () => {
    const progress = new Progression();
    progress.restore({ level: REALM_SIZE, xp: 0 });
    const bag = new Inventory();
    expect(canBreakThrough(progress, bag).ok).toBe(false);
    expect(bag.add('linh-cot-ha', 3)).toBe(true);
    expect(bag.add('yeu-huyet', 2)).toBe(true);
    expect(bag.add('truc-co-dan', 1)).toBe(true);
    const result = breakThrough(progress, bag);
    expect(result.ok).toBe(true);
    expect(progress.level).toBe(REALM_SIZE + 1);
    expect(progress.title).toContain('Trúc Cơ');
    expect(bag.count('truc-co-dan')).toBe(0);
  });
});

describe('inventory and gems', () => {

  it('stacks HP potions to 20 and picks strongest quick-use', () => {
    const inventory = new Inventory();
    expect(inventory.add('blood-berry', 20)).toBe(true);
    expect(inventory.add('blood-berry', 1)).toBe(true);
    expect(inventory.count('blood-berry')).toBe(21);
    expect(inventory.add('essence-root', 1)).toBe(true);
    expect(inventory.findQuickUseIndex('hp')).toBeGreaterThanOrEqual(0);
    const idx = inventory.findQuickUseIndex('hp');
    expect(itemOf(inventory.bag[idx])?.id).toBe('essence-root');
  });
  it('stacks consumables and consumes one unit', () => {
    const inventory = new Inventory();
    expect(inventory.add('blood-berry', 3)).toBe(true);
    expect(inventory.count('blood-berry')).toBe(3);
    inventory.use(0);
    expect(inventory.count('blood-berry')).toBe(2);
  });

  it('applies socket bonuses', () => {
    const result = socketGem(createSocketState(1), 0, 'hong-ngoc-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(gemBonuses(result.state).attack).toBe(2);
  });
});

describe('quest, economy and farming invariants', () => {
  it('ignores duplicate quest events', () => {
    const quests = new QuestSystem(createQuestState());
    quests.start('q01-nhap-mon', 1);
    quests.apply({ id: 'talk-1', type: 'talk', target: 'truong-lao' }, 1);
    const duplicate = quests.apply({ id: 'talk-1', type: 'talk', target: 'truong-lao' }, 1);
    expect(duplicate.ok && duplicate.changedQuestIds).toEqual([]);
  });

  it('keeps shop balance non-negative', () => {
    const poor = buyOffer(createShopState(1), 'spirit-herb');
    expect(poor.ok).toBe(false);
    const bought = buyOffer(createShopState(100), 'spirit-herb');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const sold = sellItem(bought.state, 'spirit-herb');
    expect(sold.ok).toBe(true);
    if (sold.ok) expect(sold.state.coins).toBeGreaterThanOrEqual(0);
  });

  it('does not harvest a crop twice', () => {
    const planted = plantSeed(createFarmState(1), 'plot-1', 'spirit-herb-seed', 0);
    expect(planted.ok).toBe(true);
    if (!planted.ok) return;
    expect(harvestPlot(planted.state, 'plot-1', 60_000).ok).toBe(false);
    const watered = waterPlot(planted.state, 'plot-1', 1_000);
    expect(watered.ok).toBe(true);
    if (!watered.ok) return;
    expect(harvestPlot(watered.state, 'plot-1', 30_000).ok).toBe(false);
    const harvested = harvestPlot(watered.state, 'plot-1', 61_000);
    expect(harvested.ok).toBe(true);
    if (!harvested.ok) return;
    expect(harvestPlot(harvested.state, 'plot-1', 120_000).ok).toBe(false);
  });

  it('gates Huyết Ma Cốc behind Luyện Khí 5 only', () => {
    expect(canEnterZone('huyet-ma-coc', { level: 4, finishedQuests: new Set() }).allowed).toBe(false);
    expect(
      canEnterZone('huyet-ma-coc', {
        level: 5,
        finishedQuests: new Set(),
      }).allowed,
    ).toBe(true);
  });

  it('breaks through to Kết Đan when materials are present', () => {
    const progress = new Progression();
    progress.restore({ level: REALM_SIZE * 2, xp: 0 });
    const bag = new Inventory();
    expect(canBreakThrough(progress, bag).ok).toBe(false);
    expect(bag.add('linh-cot-trung', 3)).toBe(true);
    expect(bag.add('yeu-dan', 2)).toBe(true);
    expect(bag.add('ket-dan-dan', 1)).toBe(true);
    const result = breakThrough(progress, bag);
    expect(result.ok).toBe(true);
    expect(progress.level).toBe(REALM_SIZE * 2 + 1);
    expect(progress.title).toContain('Kết Đan');
    expect(bag.count('ket-dan-dan')).toBe(0);
  });

  it('gates Thanh Phong Cốc at Trúc Cơ 1', () => {
    expect(canEnterZone('thanh-phong-coc', { level: 9, finishedQuests: new Set() }).allowed).toBe(
      false,
    );
    expect(canEnterZone('thanh-phong-coc', { level: 10, finishedQuests: new Set() }).allowed).toBe(
      true,
    );
  });

  it('crafts alchemy recipes from bag materials', () => {
    const bag = new Inventory();
    expect(bag.add('spirit-herb', 2)).toBe(true);
    expect(bag.add('spirit-stone', 1)).toBe(true);
    const result = craftAlchemy(bag, 'hoi-huyen-dan', 1);
    expect(result.ok).toBe(true);
    expect(bag.count('blood-berry')).toBe(2);
    expect(bag.count('spirit-herb')).toBe(0);
  });

  it('plans stronger tribulation waves at higher peaks', () => {
    expect(planTribulation(8).count).toBe(2);
    expect(planTribulation(9).count).toBe(3);
    expect(planTribulation(18).count).toBe(3);
    expect(planTribulation(18).label).toContain('Kết Đan');
  });

  it('maps Nhu Yên kit slots and locks ultimate at rank 0', () => {
    const kit = buildCombatKit('nhuyen', { 'han-bang-chuong': 1 });
    expect(kit).toHaveLength(4);
    expect(kit[0]?.locked).toBe(false);
    expect(kit[1]?.locked).toBe(true);
    expect(kit[3]?.locked).toBe(true);
    expect(kitBindHint('thien-ly-bang-phong', 'nhuyen')).toBe('U');
  });

  it('lists side quests and Phong Ma quest without main-chain prereqs', () => {
    const state = new QuestSystem();
    const refreshed = refreshQuestAvailability(state.snapshot(), 10);
    expect(refreshed.quests['qs01-duoc-lieu']?.status).toBe('available');
    expect(refreshed.quests['q11-thanh-phong']?.status).toBe('available');
  });
});

export type QuestObjectiveType = 'talk' | 'kill' | 'collect' | 'reach' | 'boss';
export type QuestStatus = 'locked' | 'available' | 'active' | 'completed' | 'claimed';

export interface QuestObjective {
  id: string;
  type: QuestObjectiveType;
  target: string;
  required: number;
  description: string;
}

export interface QuestReward {
  xp: number;
  coins: number;
  items?: Readonly<Record<string, number>>;
}

export interface QuestDefinition {
  id: string;
  name: string;
  level: number;
  prerequisiteQuestIds: readonly string[];
  objectives: readonly QuestObjective[];
  rewards: QuestReward;
}

export interface QuestProgress {
  status: QuestStatus;
  objectives: Record<string, number>;
}

export interface QuestState {
  quests: Record<string, QuestProgress>;
  processedEventIds: string[];
}

export interface QuestEvent {
  /** Stable ID supplied by the caller; replaying it has no effect. */
  id: string;
  type: QuestObjectiveType;
  target: string;
  amount?: number;
}

export type QuestError =
  | 'unknown-quest'
  | 'level-required'
  | 'prerequisite-required'
  | 'not-available'
  | 'not-completed';

export type QuestTransition =
  | { ok: true; state: QuestState; changedQuestIds: string[]; reward?: QuestReward }
  | { ok: false; state: QuestState; error: QuestError };

const objective = (
  id: string,
  type: QuestObjectiveType,
  target: string,
  required: number,
  description: string,
): QuestObjective => ({ id, type, target, required, description });

export const QUESTS: readonly QuestDefinition[] = [
  {
    id: 'q01-nhap-mon',
    name: 'Bước Vào Ngoại Môn',
    level: 1,
    prerequisiteQuestIds: [],
    objectives: [objective('talk-truong-lao', 'talk', 'truong-lao', 1, 'Bái kiến trưởng lão.')],
    rewards: { xp: 30, coins: 20 },
  },
  {
    id: 'q02-thu-luyen',
    name: 'Lần Đầu Thử Luyện',
    level: 1,
    prerequisiteQuestIds: ['q01-nhap-mon'],
    objectives: [objective('kill-toad', 'kill', 'toad', 3, 'Đánh bại 3 Linh Cóc.')],
    rewards: { xp: 45, coins: 30 },
  },
  {
    id: 'q03-linh-thao',
    name: 'Hương Linh Thảo',
    level: 2,
    prerequisiteQuestIds: ['q02-thu-luyen'],
    objectives: [
      objective('collect-spirit-herb', 'collect', 'spirit-herb', 4, 'Thu thập 4 Thanh Linh Thảo.'),
      objective('talk-duoc-su', 'talk', 'duoc-su', 1, 'Giao thảo dược cho Dược Sư.'),
    ],
    rewards: { xp: 65, coins: 45, items: { 'spirit-stone': 2 } },
  },
  {
    id: 'q04-rung-ngoai-mon',
    name: 'Đường Vào Rừng',
    level: 3,
    prerequisiteQuestIds: ['q03-linh-thao'],
    objectives: [objective('reach-forest', 'reach', 'rung-ngoai-mon', 1, 'Tìm tới Rừng Ngoại Môn.')],
    rewards: { xp: 75, coins: 50 },
  },
  {
    id: 'q05-lang-quan',
    name: 'Lang Quần Rình Rập',
    level: 3,
    prerequisiteQuestIds: ['q04-rung-ngoai-mon'],
    objectives: [objective('kill-serpent', 'kill', 'serpent', 5, 'Tiêu diệt 5 Thanh Xà.')],
    rewards: { xp: 100, coins: 70 },
  },
  {
    id: 'q06-linh-thach',
    name: 'Linh Thạch Ngũ Hành',
    level: 4,
    prerequisiteQuestIds: ['q05-lang-quan'],
    objectives: [objective('collect-stones', 'collect', 'wood-stone', 3, 'Thu thập 3 Mộc Linh Thạch.')],
    rewards: { xp: 125, coins: 90 },
  },
  {
    id: 'q07-huyet-ma-coc',
    name: 'Dấu Vết Huyết Ma',
    level: 5,
    prerequisiteQuestIds: ['q06-linh-thach'],
    objectives: [
      objective('reach-valley', 'reach', 'huyet-ma-coc', 1, 'Tiến vào Huyết Ma Cốc.'),
      objective('kill-blood-serpent', 'kill', 'blood-serpent', 4, 'Đánh bại 4 Huyết Xà.'),
    ],
    rewards: { xp: 170, coins: 120 },
  },
  {
    id: 'q08-cuu-de-tu',
    name: 'Cứu Đồng Môn',
    level: 6,
    prerequisiteQuestIds: ['q07-huyet-ma-coc'],
    objectives: [objective('talk-disciple', 'talk', 'de-tu-bi-thuong', 1, 'Tìm đệ tử bị thương.')],
    rewards: { xp: 190, coins: 140, items: { 'blood-berry': 2 } },
  },
  {
    id: 'q09-pha-tran',
    name: 'Phá Huyết Trận',
    level: 7,
    prerequisiteQuestIds: ['q08-cuu-de-tu'],
    objectives: [
      objective('kill-ember-golem', 'kill', 'ember-golem', 3, 'Phá hủy 3 Viêm Thạch Khôi.'),
      objective('reach-altar', 'reach', 'huyet-ma-coc', 1, 'Tiến tới Huyết Tế Đàn.'),
    ],
    rewards: { xp: 240, coins: 180 },
  },
  {
    id: 'q10-coc-chu',
    name: 'Huyết Ma Cốc Chủ',
    level: 9,
    prerequisiteQuestIds: ['q09-pha-tran'],
    objectives: [objective('boss-valley-lord', 'boss', 'huyet-ma-coc-chu', 1, 'Đánh bại Huyết Ma Cốc Chủ.')],
    rewards: { xp: 400, coins: 350, items: { 'demon-sword': 1 } },
  },
  {
    id: 'q11-thanh-phong',
    name: 'Gió Trong Thanh Phong',
    level: 10,
    prerequisiteQuestIds: [],
    objectives: [
      objective('reach-wind', 'reach', 'thanh-phong-coc', 1, 'Tiến vào Thanh Phong Cốc.'),
      objective('boss-wind-lord', 'boss', 'phong-ma-chu', 1, 'Đánh bại Phong Ma.'),
    ],
    rewards: { xp: 320, coins: 260, items: { 'ket-dan-dan': 1 } },
  },
  {
    id: 'qs01-duoc-lieu',
    name: 'Thu Thập Dược Liệu',
    level: 2,
    prerequisiteQuestIds: [],
    objectives: [
      objective('gather-herbs', 'collect', 'spirit-herb', 5, 'Hái 5 Thanh Linh Thảo.'),
      objective('talk-trader', 'talk', 'du-phuong-thuong', 1, 'Giao cho Du Phương Thương.'),
    ],
    rewards: { xp: 80, coins: 60, items: { 'spirit-stone': 3 } },
  },
  {
    id: 'qs02-phong-sat',
    name: 'Sát Khí Trong Gió',
    level: 10,
    prerequisiteQuestIds: [],
    objectives: [objective('kill-drakes', 'kill', 'drake', 4, 'Tiêu diệt 4 Long Yêu trong cốc.')],
    rewards: { xp: 200, coins: 150, items: { 'yeu-dan': 1 } },
  },
  {
    id: 'qs03-luyen-dan',
    name: 'Thử Lò Đan',
    level: 3,
    prerequisiteQuestIds: [],
    objectives: [
      objective('talk-alchemist', 'talk', 'luyen-dan-su', 1, 'Gặp Luyện Đan Sư.'),
      objective('craft-stones', 'collect', 'spirit-stone', 3, 'Có 3 Linh thạch (luyện hoặc nhặt).'),
    ],
    rewards: { xp: 90, coins: 70, items: { 'yeu-huyet': 2 } },
  },
];

export const QUEST_CATALOG: Readonly<Record<string, QuestDefinition>> = Object.freeze(
  Object.fromEntries(QUESTS.map((quest) => [quest.id, quest])),
);

const whole = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

function blankProgress(quest: QuestDefinition): QuestProgress {
  return {
    status: quest.prerequisiteQuestIds.length === 0 ? 'available' : 'locked',
    objectives: Object.fromEntries(quest.objectives.map(({ id }) => [id, 0])),
  };
}

export function createQuestState(): QuestState {
  return {
    quests: Object.fromEntries(QUESTS.map((quest) => [quest.id, blankProgress(quest)])),
    processedEventIds: [],
  };
}

export function snapshotQuests(state: Readonly<QuestState>): QuestState {
  const quests: Record<string, QuestProgress> = {};
  for (const quest of QUESTS) {
    const source = state.quests[quest.id] ?? blankProgress(quest);
    quests[quest.id] = {
      status: source.status,
      objectives: Object.fromEntries(
        quest.objectives.map(({ id, required }) => [
          id,
          Math.min(required, whole(source.objectives[id] ?? 0)),
        ]),
      ),
    };
  }
  return { quests, processedEventIds: [...new Set(state.processedEventIds)] };
}

function prerequisitesMet(state: QuestState, quest: QuestDefinition): boolean {
  return quest.prerequisiteQuestIds.every((id) => {
    const status = state.quests[id]?.status;
    return status === 'completed' || status === 'claimed';
  });
}

/** Recomputes locked/available quests without changing active or finished work. */
export function refreshQuestAvailability(
  state: Readonly<QuestState>,
  playerLevel: number,
): QuestState {
  const next = snapshotQuests(state);
  for (const quest of QUESTS) {
    const progress = next.quests[quest.id];
    if (progress.status !== 'locked' && progress.status !== 'available') continue;
    progress.status =
      playerLevel >= quest.level && prerequisitesMet(next, quest) ? 'available' : 'locked';
  }
  return next;
}

export function startQuest(
  state: Readonly<QuestState>,
  questId: string,
  playerLevel: number,
): QuestTransition {
  const next = refreshQuestAvailability(state, playerLevel);
  const quest = QUEST_CATALOG[questId];
  if (!quest) return { ok: false, state: next, error: 'unknown-quest' };
  const progress = next.quests[questId];
  if (progress.status === 'active' || progress.status === 'completed' || progress.status === 'claimed') {
    return { ok: true, state: next, changedQuestIds: [] };
  }
  if (playerLevel < quest.level) return { ok: false, state: next, error: 'level-required' };
  if (!prerequisitesMet(next, quest)) {
    return { ok: false, state: next, error: 'prerequisite-required' };
  }
  if (progress.status !== 'available') return { ok: false, state: next, error: 'not-available' };
  progress.status = 'active';
  return { ok: true, state: next, changedQuestIds: [questId] };
}

export function applyQuestEvent(
  state: Readonly<QuestState>,
  event: Readonly<QuestEvent>,
  playerLevel: number,
): QuestTransition {
  let next = refreshQuestAvailability(state, playerLevel);
  if (!event.id || next.processedEventIds.includes(event.id)) {
    return { ok: true, state: next, changedQuestIds: [] };
  }
  next.processedEventIds.push(event.id);
  const changed = new Set<string>();
  const amount = event.type === 'talk' || event.type === 'reach' || event.type === 'boss'
    ? 1
    : whole(event.amount ?? 1);
  if (amount === 0) return { ok: true, state: next, changedQuestIds: [] };

  for (const quest of QUESTS) {
    const progress = next.quests[quest.id];
    if (progress.status !== 'active') continue;
    for (const target of quest.objectives) {
      if (target.type !== event.type || target.target !== event.target) continue;
      const before = progress.objectives[target.id] ?? 0;
      progress.objectives[target.id] = Math.min(target.required, before + amount);
      if (progress.objectives[target.id] !== before) changed.add(quest.id);
    }
    if (
      quest.objectives.every(
        ({ id, required }) => (progress.objectives[id] ?? 0) >= required,
      )
    ) {
      progress.status = 'completed';
      changed.add(quest.id);
    }
  }
  next = refreshQuestAvailability(next, playerLevel);
  return { ok: true, state: next, changedQuestIds: [...changed] };
}

export function claimQuestReward(
  state: Readonly<QuestState>,
  questId: string,
  playerLevel: number,
): QuestTransition {
  let next = snapshotQuests(state);
  const quest = QUEST_CATALOG[questId];
  if (!quest) return { ok: false, state: next, error: 'unknown-quest' };
  const progress = next.quests[questId];
  if (progress.status === 'claimed') {
    return { ok: true, state: next, changedQuestIds: [] };
  }
  if (progress.status !== 'completed') {
    return { ok: false, state: next, error: 'not-completed' };
  }
  progress.status = 'claimed';
  next = refreshQuestAvailability(next, playerLevel);
  return { ok: true, state: next, changedQuestIds: [questId], reward: quest.rewards };
}

/** Credits `reach` objectives when the hero is already standing in that zone. */
export function creditZoneReach(
  state: Readonly<QuestState>,
  zoneId: string,
  playerLevel: number,
): QuestTransition {
  let next = refreshQuestAvailability(state, playerLevel);
  const changed = new Set<string>();
  for (const quest of QUESTS) {
    const progress = next.quests[quest.id];
    if (progress.status !== 'active') continue;
    for (const target of quest.objectives) {
      if (target.type !== 'reach' || target.target !== zoneId) continue;
      const before = progress.objectives[target.id] ?? 0;
      progress.objectives[target.id] = Math.min(target.required, Math.max(before, target.required));
      if (progress.objectives[target.id] !== before) changed.add(quest.id);
    }
    if (
      quest.objectives.every(
        ({ id, required }) => (progress.objectives[id] ?? 0) >= required,
      )
    ) {
      if (progress.status === 'active') {
        progress.status = 'completed';
        changed.add(quest.id);
      }
    }
  }
  next = refreshQuestAvailability(next, playerLevel);
  return { ok: true, state: next, changedQuestIds: [...changed] };
}

export class QuestSystem {
  private state: QuestState;

  constructor(restored: QuestState = createQuestState()) {
    this.state = snapshotQuests(restored);
  }

  start(questId: string, playerLevel: number): QuestTransition {
    const result = startQuest(this.state, questId, playerLevel);
    if (result.ok) this.state = result.state;
    return result;
  }

  apply(event: QuestEvent, playerLevel: number): QuestTransition {
    const result = applyQuestEvent(this.state, event, playerLevel);
    if (result.ok) this.state = result.state;
    return result;
  }

  creditReach(zoneId: string, playerLevel: number): QuestTransition {
    const result = creditZoneReach(this.state, zoneId, playerLevel);
    if (result.ok) this.state = result.state;
    return result;
  }

  claim(questId: string, playerLevel: number): QuestTransition {
    const result = claimQuestReward(this.state, questId, playerLevel);
    if (result.ok) this.state = result.state;
    return result;
  }

  snapshot(): QuestState {
    return snapshotQuests(this.state);
  }
}

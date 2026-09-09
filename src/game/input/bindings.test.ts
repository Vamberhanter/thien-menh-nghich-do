import { describe, expect, it } from 'vitest';
import { KIT_INPUT, MOVE_BINDINGS, WORLD_BINDINGS, kitKeyLabels } from './bindings';
import { buildCombatKit } from '../systems/SkillKit';
import type { SkillClass } from '../systems/SkillSystem';

/**
 * The whole reason this table exists.
 *
 * A kit's controls used to be described in **four** places that had to agree
 * and nothing checked did:
 *
 *   - `buildCombatKit`   the slot index the entity actually casts by
 *   - `PROFILE.skills`   how many buttons the touch pad draws
 *   - `SKILL_KEYS` (HUD) what letter each button is labelled with
 *   - `consumePad(...)`  what a button fires, written inline per controller
 *   - `KIT_BINDINGS.keys` a fifth, for the skill panel's hint
 *
 * They did not agree. Measured on the shipped build: Tôn Ngộ Không's pad drew
 * five buttons but his controller consumed three, and it hung the flight off
 * `skill2` — the button the HUD labels "Phần Thiên Ma Diễm". So one button
 * fired the wrong technique and two did nothing, and two of his techniques
 * could not be cast on a phone at all.
 *
 * The combat kit is the authority here, not the profile: it is the list the
 * entity indexes into, and the three "three-skill" kits are really four —
 * three bases plus an ultimate on `U`.
 */

const KITS: readonly SkillClass[] = ['wukong', 'nhuyen', 'huyetlang', 'miku', 'kiemtien'];

/** The kit as the entity sees it: base slots, then ultimate, then tail. */
const combatKit = (id: SkillClass) => buildCombatKit(id, {});

describe('KIT_INPUT', () => {
  it('covers every kit in the roster and nothing else', () => {
    expect(Object.keys(KIT_INPUT).sort()).toEqual([...KITS].sort());
  });

  it('has exactly one slot per castable combat slot', () => {
    for (const id of KITS) {
      const kit = combatKit(id);
      expect(
        KIT_INPUT[id].slots.length,
        `${id}: ${KIT_INPUT[id].slots.length} slot cho ${kit.length} chieu ` +
          `(${kit.map((s) => s.name).join(', ')})`,
      ).toBe(kit.length);
    }
  });

  it('gives each slot its own touch button, at its own index', () => {
    for (const id of KITS) {
      const pads = KIT_INPUT[id].slots.map((slot) => slot.pad);
      // Positional: the pad renders button *i* and emits `skill${i}`, so slot
      // i must claim exactly that or the button fires somebody else's skill.
      expect(pads, id).toEqual(combatKit(id).map((_, i) => `skill${i}`));
    }
  });

  it('gives each slot its own key, and none of them the attack key', () => {
    for (const id of KITS) {
      const keys = KIT_INPUT[id].slots.flatMap((slot) => slot.keys);
      expect(new Set(keys).size, `${id}: phim trung nhau`).toBe(keys.length);
      expect(keys, `${id}: attack dung chung phim voi mot slot`).not.toContain(
        KIT_INPUT[id].attack.keys[0],
      );
    }
  });

  it('never binds a movement key to an action', () => {
    const moving = new Set<string>(Object.values(MOVE_BINDINGS).flatMap((b) => b.keys));
    for (const id of KITS) {
      const input = KIT_INPUT[id];
      for (const key of [...input.attack.keys, ...input.slots.flatMap((s) => s.keys)]) {
        expect(moving.has(key), `${id}: "${key}" vua di chuyen vua ra chieu`).toBe(false);
      }
    }
  });

  it('labels the keys in combat-slot order, mobility where the kit puts it', () => {
    // The flight is last for the five-slot kits and third for the others, which
    // is why a pad button cannot be pinned to a role.
    expect(kitKeyLabels('wukong')).toEqual(['K', 'L', 'U', 'O', 'Space']);
    expect(kitKeyLabels('kiemtien')).toEqual(['K', 'L', 'U', 'O', 'Space']);
    expect(kitKeyLabels('huyetlang')).toEqual(['K', 'L', 'Space', 'U']);
    expect(kitKeyLabels('khong-co-kit-nay')).toEqual([]);
  });
});

describe('WORLD_BINDINGS', () => {
  it('shares no key with movement or with any kit action', () => {
    const taken = new Set<string>([
      ...Object.values(MOVE_BINDINGS).flatMap((b) => b.keys),
      ...Object.values(KIT_INPUT).flatMap((k) => [
        ...k.attack.keys,
        ...k.slots.flatMap((s) => s.keys),
      ]),
    ]);
    for (const [name, binding] of Object.entries(WORLD_BINDINGS)) {
      for (const key of binding.keys) {
        expect(taken.has(key), `world "${name}": "${key}" da duoc dung cho gameplay`).toBe(false);
      }
    }
  });

  it('keeps the interact key the one the HUD prompts print', () => {
    // Every prompt in the game reads "F · …". If this changes, those strings
    // go with it, so the test is here to make it a decision and not a typo.
    expect(WORLD_BINDINGS.interact.keys[0]).toBe('F');
  });
});

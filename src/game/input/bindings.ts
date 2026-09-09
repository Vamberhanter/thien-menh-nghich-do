import type Phaser from 'phaser';
import type { PadAction } from '../touchPad';

/**
 * Every key and touch button the game reads, in one table.
 *
 * It was five copies. Each of the five character controllers declared the same
 * movement block verbatim, its own `addKeys` helper, its own `readAxis`, its
 * own `anyDown`/`anyJustDown`, and its own teardown loop — then spelled the
 * touch mapping out inline as `consumePad('skill2')` beside each skill.
 *
 * The copies were not the problem. The problem is that a kit's controls were
 * described in *five* places that had to agree, and nothing checked they did:
 *
 *   - `buildCombatKit`    the slot index the entity actually casts by
 *   - `PROFILE.skills`    how many buttons the touch pad draws
 *   - `SKILL_KEYS` (HUD)  what letter each button is labelled with
 *   - `consumePad(...)`   what a button fires, written inline per controller
 *   - `KIT_BINDINGS.keys` a fifth, for the skill panel's key hint
 *
 * They did not agree. Measured on the shipped build: Tôn Ngộ Không has five
 * skills, so the pad drew five buttons emitting `skill0`..`skill4`, but his
 * controller consumed only `skill0`, `skill1` and `skill2` — and it hung the
 * *flight* off `skill2`, which the HUD labels "Phần Thiên Ma Diễm". Button
 * three fired the wrong technique, buttons four and five did nothing, and two
 * of his four techniques could not be cast on a phone at all. Kiếm Tiên, the
 * other five-slot kit, had it identically.
 *
 * A slot is now declared once, in the order the kit lists its skills, and the
 * HUD, the touch pad and the controller all read this. `bindings.test.ts`
 * asserts the count against the skill lists, which is what stops the drift
 * coming back.
 *
 * No value import of Phaser: the key *codes* are looked up in `InputMap`, and
 * keeping this file a leaf is what lets the test above run without a browser.
 */

export type KeyName = keyof typeof Phaser.Input.Keyboard.KeyCodes;

/** One action, and every way to ask for it. */
export interface Binding {
  /** Keyboard keys, any of which fires it. The first is what the HUD shows. */
  keys: readonly KeyName[];
  /** Touch button, when it has one. */
  pad?: PadAction;
}

/** Shared by every kit: nobody rebinds walking per character. */
export const MOVE_BINDINGS = {
  up: { keys: ['W', 'UP'] },
  down: { keys: ['S', 'DOWN'] },
  left: { keys: ['A', 'LEFT'] },
  right: { keys: ['D', 'RIGHT'] },
  /**
   * Only two kits can run: `Wukong.move` and `NhuYen.move` take a sprint flag,
   * the other three take a direction only. Bound for everyone anyway — a kit
   * that cannot run just never reads it, and leaving the key out per kit made
   * the omission look deliberate when nothing records that it is.
   */
  sprint: { keys: ['SHIFT'] },
} as const satisfies Record<string, Binding>;

/** World actions, none of which belong to a character. */
export const WORLD_BINDINGS = {
  /**
   * The interact key. Section XIII of the brief asks for `E`; this game has
   * always used **F**, it is printed into every prompt the HUD draws ("F · đặt
   * điểm hồi sinh"), and changing it is now one line here plus those strings.
   */
  interact: { keys: ['F'], pad: 'pick' },
  bag: { keys: ['I'], pad: 'bag' },
  warp: { keys: ['T'], pad: 'warp' },
  swapCharacter: { keys: ['Q'], pad: 'swap' },
  frameStats: { keys: ['F3'] },
  mapEditor: { keys: ['F2'] },
  cycleEnvArt: { keys: ['G'], pad: 'envArt' },
} as const satisfies Record<string, Binding>;

/**
 * A kit's action row.
 *
 * `slots` is positional and the position *is* the contract: slot *n* is the
 * *n*-th entry `buildCombatKit` returns for that kit, which is the index the
 * entity casts by. A kit with a combat slot it does not list here has a skill
 * no button can reach.
 *
 * The touch pad draws one button per `PROFILE.skills`, which for three of the
 * five kits is one short of their combat kit — so their ultimate is reachable
 * on the keyboard and not on a phone. That is a roster decision rather than a
 * binding one, so it is recorded here and left alone.
 */
export interface KitInput {
  attack: Binding;
  slots: readonly Binding[];
}

const SLOT_PADS = ['skill0', 'skill1', 'skill2', 'skill3', 'skill4'] as const;

/** The pad button is the slot's index, always — never the skill's identity. */
const kit = (attack: KeyName, ...keys: readonly KeyName[]): KitInput => ({
  attack: { keys: [attack], pad: 'attack' },
  slots: keys.map((key, i) => ({ keys: [key], pad: SLOT_PADS[i] })),
});

/**
 * Slot order is the order `buildCombatKit` returns — base slots, then the
 * ultimate, then the tail — because that is the index the entity casts by.
 *
 * Which is why the three "three-skill" kits have **four** slots. Their combat
 * kit is three bases plus an ultimate, key `U`, and the mobility skill sits at
 * index 2 rather than last: K, L, Space, U. Writing them as three, on the
 * strength of `PROFILE.skills` listing three, is what made a controller ask
 * for `slots[3]` and get `undefined`.
 *
 * The five-slot kits put their ultimate in the middle instead — Tôn Ngộ Không's
 * is Ma Nguyệt Trảm at index 3, Kiếm Tiên's is Vạn Kiếm Quy Tông at index 2 —
 * with the flight last. So a pad button can never be pinned to a skill or even
 * to a role: it follows the slot, and the slot follows the kit.
 */
export const KIT_INPUT: Record<string, KitInput> = {
  nhuyen: kit('J', 'K', 'L', 'SPACE', 'U'),
  huyetlang: kit('J', 'K', 'L', 'SPACE', 'U'),
  miku: kit('J', 'K', 'L', 'SPACE', 'U'),
  wukong: kit('J', 'K', 'L', 'U', 'O', 'SPACE'),
  kiemtien: kit('J', 'K', 'L', 'U', 'O', 'SPACE'),
};

/** What the HUD prints under a slot. */
export function slotLabel(binding: Binding): string {
  return binding.keys[0] === 'SPACE' ? 'Space' : binding.keys[0];
}

/** Every key label a kit shows, in slot order — for the HUD's key row. */
export function kitKeyLabels(kitId: string): readonly string[] {
  return (KIT_INPUT[kitId]?.slots ?? []).map(slotLabel);
}

/** Every binding a character controller has to listen for. */
export function kitBindings(kitId: string): Binding[] {
  const input = KIT_INPUT[kitId];
  if (!input) throw new Error(`bindings: khong co binding cho kit "${kitId}"`);
  return [...Object.values(MOVE_BINDINGS), input.attack, ...input.slots];
}

import Phaser from 'phaser';
import { FEET_OFFSET_Y, LinYuan } from './LinYuan';
import { HUYET_LANG_PROFILE, HuyetLang } from './HuyetLang';
import { NHU_YEN_PROFILE, NhuYen } from './NhuYen';
import { CharacterController } from '../systems/CharacterController';
import { HuyetLangController } from '../systems/HuyetLangController';
import { NhuYenController } from '../systems/NhuYenController';
import { HU_VO_KIEM_KHI } from '../systems/CombatSystem';
import type { CharacterChangedPayload } from '../events';
import { DIRECTION_VECTORS } from '../types';
import type { CharacterStats } from '../types';
import type { PlayerNetState } from '../../net/types';
import { currentZone } from '../worldState';
import type { Damageable, HitInfo } from '../systems/Damageable';
import type { CombatSystem } from '../systems/CombatSystem';

/**
 * Uniform grip on whichever character the scene is driving.
 *
 * The two entities are deliberately not made to share a base class: Lâm Uyên's
 * sprite is centred on its frame and has one skill, Như Yên's is pivoted on her
 * feet and has a combo plus three. This wrapper is the small amount of glue the
 * scene actually needs — the rest of the differences stay inside each entity.
 */
export interface PlayerHandle {
  /** Identity + skill names, for the HUD. */
  readonly profile: CharacterChangedPayload;
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  /**
   * World Y of the point the character stands on — the depth-sort key. Như Yên
   * is already pivoted there; Lâm Uyên needs her half-frame offset added.
   */
  footY(): number;
  /** Where the character stands, for enemy ranges and AI targeting. */
  hitPoint(): { x: number; y: number };
  /** False once dead — an enemy stops chasing a corpse. */
  readonly alive: boolean;
  /** True while a dash phases through damage (Như Yên's Sương Ảnh Bộ). */
  readonly invulnerable: boolean;
  update(time: number, delta: number): void;
  hurt(amount: number): void;
  respawn(x: number, y: number): void;
  destroy(): void;
  /** Foot-plane pose the net layer publishes. */
  snapshot(): PlayerNetState;
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;
  /** Same hit path the boss and mobs use. */
  applyHit(hit: HitInfo): void;
  hitRadius(): number;
}

export const LAM_UYEN_PROFILE: CharacterChangedPayload = {
  id: 'lamuyen',
  name: 'Lâm Uyên',
  sect: 'Hư Vô Kiếm',
  skills: [HU_VO_KIEM_KHI.name],
  comboSteps: 0,
};

export function createLamUyen(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stats?: Partial<CharacterStats>,
): PlayerHandle {
  const sprite = new LinYuan(scene, x, y, stats);
  const controller = new CharacterController(scene, sprite);
  return wrapPlayer(LAM_UYEN_PROFILE, sprite, controller, {
    footY: () => sprite.y + FEET_OFFSET_Y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y + FEET_OFFSET_Y }),
    invulnerable: () => false,
    snapshot: () => ({
      character: 'lamuyen',
      x: sprite.x,
      y: sprite.y + FEET_OFFSET_Y,
      facing: sprite.facingDirection,
      aim: DIRECTION_VECTORS[sprite.facingDirection],
      state: sprite.characterState,
      hp: sprite.stats.hp,
      zone: currentZone(),
    }),
  });
}

export function createNhuYen(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stats?: Partial<CharacterStats>,
): PlayerHandle {
  const sprite = new NhuYen(scene, x, y, stats);
  const controller = new NhuYenController(scene, sprite);
  return wrapPlayer({ ...NHU_YEN_PROFILE }, sprite, controller, {
    footY: () => sprite.y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y }),
    invulnerable: () => sprite.isInvulnerable,
    snapshot: () => {
      const pending = sprite.combo.pending;
      const atk = pending === 0 ? sprite.combo.length - 1 : pending - 1;
      return {
        character: 'nhuyen',
        x: sprite.x,
        y: sprite.y,
        facing: sprite.facingDirection,
        aim: sprite.aimVector,
        state: sprite.characterState,
        hp: sprite.stats.hp,
        atk,
        zone: currentZone(),
      };
    },
  });
}

export function createHuyetLang(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stats?: Partial<CharacterStats>,
): PlayerHandle {
  const sprite = new HuyetLang(scene, x, y, stats);
  const controller = new HuyetLangController(scene, sprite);
  return wrapPlayer({ ...HUYET_LANG_PROFILE }, sprite, controller, {
    footY: () => sprite.y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y }),
    invulnerable: () => sprite.isInvulnerable,
    snapshot: () => {
      const pending = sprite.combo.pending;
      const atk = pending === 0 ? sprite.combo.length - 1 : pending - 1;
      return {
        character: 'huyetlang',
        x: sprite.x,
        y: sprite.y,
        facing: sprite.facingDirection,
        aim: sprite.aimVector,
        state: sprite.characterState,
        hp: sprite.stats.hp,
        atk,
        zone: currentZone(),
      };
    },
  });
}

interface LivingSprite extends Phaser.Physics.Arcade.Sprite {
  readonly stats: CharacterStats;
  readonly combat: CombatSystem;
  readonly isDead: boolean;
  takeDamage(amount: number): void;
  revive(x: number, y: number): void;
}

function wrapPlayer(
  profile: CharacterChangedPayload,
  sprite: LivingSprite,
  controller: { update(time: number, delta: number): void; destroy(): void },
  bits: {
    footY(): number;
    hitPoint(): { x: number; y: number };
    invulnerable(): boolean;
    snapshot(): PlayerNetState;
  },
): PlayerHandle {
  return {
    profile,
    sprite,
    footY: bits.footY,
    hitPoint: bits.hitPoint,
    get alive() {
      return !sprite.isDead;
    },
    get invulnerable() {
      return bits.invulnerable();
    },
    get stats() {
      return sprite.stats;
    },
    get combat() {
      return sprite.combat;
    },
    update: (time, delta) => controller.update(time, delta),
    hurt: (amount) => sprite.takeDamage(amount),
    respawn: (rx, ry) => sprite.revive(rx, ry),
    destroy: () => {
      controller.destroy();
      sprite.destroy();
    },
    snapshot: bits.snapshot,
    hitRadius: () => 16,
    applyHit: (hit: HitInfo) => {
      if (hit.side === 'player' || sprite.isDead) return;
      if (bits.invulnerable()) return;
      sprite.takeDamage(hit.damage);
    },
  };
}

export function asDamageable(player: PlayerHandle): Damageable {
  return {
    get alive() {
      return player.alive;
    },
    hitPoint: () => player.hitPoint(),
    hitRadius: () => player.hitRadius(),
    applyHit: (hit) => player.applyHit(hit),
  };
}

export const PLAYER_FACTORIES = {
  lamuyen: createLamUyen,
  nhuyen: createNhuYen,
  huyetlang: createHuyetLang,
} as const;

export type PlayerId = keyof typeof PLAYER_FACTORIES;

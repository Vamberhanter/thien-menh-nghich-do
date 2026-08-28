import Phaser from 'phaser';
import { FEET_OFFSET_Y, LinYuan } from './LinYuan';
import { NHU_YEN_PROFILE, NhuYen } from './NhuYen';
import { CharacterController } from '../systems/CharacterController';
import { NhuYenController } from '../systems/NhuYenController';
import { HU_VO_KIEM_KHI } from '../systems/CombatSystem';
import type { CharacterChangedPayload } from '../events';

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
}

export const LAM_UYEN_PROFILE: CharacterChangedPayload = {
  id: 'lamuyen',
  name: 'Lâm Uyên',
  sect: 'Hư Vô Kiếm',
  skills: [HU_VO_KIEM_KHI.name],
  comboSteps: 0,
};

export function createLamUyen(scene: Phaser.Scene, x: number, y: number): PlayerHandle {
  const sprite = new LinYuan(scene, x, y);
  const controller = new CharacterController(scene, sprite);
  return {
    profile: LAM_UYEN_PROFILE,
    sprite,
    footY: () => sprite.y + FEET_OFFSET_Y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y + FEET_OFFSET_Y }),
    get alive() {
      return !sprite.isDead;
    },
    // Lâm Uyên has no dash, so nothing of hers phases through damage
    invulnerable: false,
    update: (time, delta) => controller.update(time, delta),
    hurt: (amount) => sprite.takeDamage(amount),
    respawn: (rx, ry) => sprite.revive(rx, ry),
    destroy: () => {
      controller.destroy();
      sprite.destroy();
    },
  };
}

export function createNhuYen(scene: Phaser.Scene, x: number, y: number): PlayerHandle {
  const sprite = new NhuYen(scene, x, y);
  const controller = new NhuYenController(scene, sprite);
  return {
    profile: { ...NHU_YEN_PROFILE },
    sprite,
    footY: () => sprite.y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y }),
    get alive() {
      return !sprite.isDead;
    },
    get invulnerable() {
      return sprite.isInvulnerable;
    },
    update: (time, delta) => controller.update(time, delta),
    hurt: (amount) => sprite.takeDamage(amount),
    respawn: (rx, ry) => sprite.revive(rx, ry),
    destroy: () => {
      controller.destroy();
      sprite.destroy();
    },
  };
}

export const PLAYER_FACTORIES = {
  lamuyen: createLamUyen,
  nhuyen: createNhuYen,
} as const;

export type PlayerId = keyof typeof PLAYER_FACTORIES;

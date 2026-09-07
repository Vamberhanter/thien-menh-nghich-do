import Phaser from 'phaser';
import { HUYET_LANG_TEXTURE } from '../animations/huyetLangAnimations';
import { MIKU_TEXTURE } from '../animations/mikuAnimations';
import { NHU_YEN_TEXTURE } from '../animations/nhuYenAnimations';
import { WUKONG_TEXTURE } from '../animations/wukongAnimations';
import { KIEMTIEN_TEXTURE } from '../animations/kiemtienAnimations';
import { HUYET_LANG_PROFILE, HuyetLang } from './HuyetLang';
import { MIKU_PROFILE, Miku } from './Miku';
import { NHU_YEN_PROFILE, NhuYen } from './NhuYen';
import { WUKONG_PROFILE, Wukong } from './Wukong';
import { KIEM_TIEN_PROFILE, KiemTien } from './KiemTien';
import { HuyetLangController } from '../systems/HuyetLangController';
import { MikuController } from '../systems/MikuController';
import { NhuYenController } from '../systems/NhuYenController';
import { WukongController } from '../systems/WukongController';
import { KiemTienController } from '../systems/KiemTienController';
import type { CharacterChangedPayload } from '../events';
import type { CharacterStats } from '../types';
import type { PlayerNetState } from '../../net/types';
import { currentZone } from '../worldState';
import type { Damageable, HitInfo } from '../systems/Damageable';
import type { CombatSystem } from '../systems/CombatSystem';

/**
 * Uniform grip on whichever character the scene is driving.
 *
 * The three characters are deliberately not made to share a base class: each
 * has its own combo length and skill set, and Tôn Ngộ Không has four skill
 * slots where the others have three. This wrapper is the small amount of glue
 * the scene actually needs — the rest of the differences stay inside each
 * entity.
 */
export interface PlayerHandle {
  /** Identity + skill names, for the HUD. */
  readonly profile: CharacterChangedPayload;
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  /** World Y of the point the character stands on — the depth-sort key. Both
   *  entities are already pivoted on their feet, so this is just `sprite.y`. */
  footY(): number;
  /** Where the character stands, for enemy ranges and AI targeting. */
  hitPoint(): { x: number; y: number };
  /** False once dead — an enemy stops chasing a corpse. */
  readonly alive: boolean;
  /** True while a dash phases through damage (Như Yên's Sương Ảnh Bộ). */
  readonly invulnerable: boolean;
  /**
   * True while the character is drawn off the ground — Cân Đẩu Vân, and only
   * Wukong. The scene reads it to sort him above the scenery and to let him
   * over it; everyone else is always false.
   */
  readonly airborne: boolean;
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

export function createMiku(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stats?: Partial<CharacterStats>,
): PlayerHandle {
  const sprite = new Miku(scene, x, y, stats);
  const controller = new MikuController(scene, sprite);
  return wrapPlayer({ ...MIKU_PROFILE }, sprite, controller, {
    footY: () => sprite.y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y }),
    invulnerable: () => sprite.isInvulnerable,
    snapshot: () => {
      const pending = sprite.combo.pending;
      const atk = pending === 0 ? sprite.combo.length - 1 : pending - 1;
      return {
        character: 'miku',
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

export function createWukong(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stats?: Partial<CharacterStats>,
): PlayerHandle {
  const sprite = new Wukong(scene, x, y, stats);
  const controller = new WukongController(scene, sprite);
  return wrapPlayer({ ...WUKONG_PROFILE }, sprite, controller, {
    footY: () => sprite.y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y }),
    invulnerable: () => sprite.isInvulnerable,
    airborne: () => sprite.airHeight > 0,
    snapshot: () => {
      const pending = sprite.combo.pending;
      const atk = pending === 0 ? sprite.combo.length - 1 : pending - 1;
      return {
        character: 'wukong',
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

export function createKiemTien(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stats?: Partial<CharacterStats>,
): PlayerHandle {
  const sprite = new KiemTien(scene, x, y, stats);
  const controller = new KiemTienController(scene, sprite);
  return wrapPlayer({ ...KIEM_TIEN_PROFILE }, sprite, controller, {
    footY: () => sprite.y,
    hitPoint: () => ({ x: sprite.x, y: sprite.y }),
    invulnerable: () => sprite.isInvulnerable,
    // Ngự Kiếm Hành, the only other kit that leaves the ground.
    airborne: () => sprite.airHeight > 0,
    snapshot: () => {
      const pending = sprite.combo.pending;
      const atk = pending === 0 ? sprite.combo.length - 1 : pending - 1;
      return {
        character: 'kiemtien',
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
    airborne?(): boolean;
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
    get airborne() {
      return bits.airborne?.() ?? false;
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
  nhuyen: createNhuYen,
  huyetlang: createHuyetLang,
  miku: createMiku,
  wukong: createWukong,
  kiemtien: createKiemTien,
} as const;

export type PlayerId = keyof typeof PLAYER_FACTORIES;

/**
 * The atlas each kit draws from.
 *
 * Exists so a caller can ask whether a character is *loadable* before trying
 * to build one. Every kit's art is fetched at boot, and a fetch can come back
 * empty — the atlas may not have been uploaded yet, or, in dev, the images may
 * simply not be on this machine. Constructing an entity whose texture is
 * missing throws from inside Phaser's animation code, which took the whole
 * scene down with it; `WorldScene.playable` uses this to step around that.
 */
export const PLAYER_TEXTURES: Record<PlayerId, string> = {
  nhuyen: NHU_YEN_TEXTURE,
  huyetlang: HUYET_LANG_TEXTURE,
  miku: MIKU_TEXTURE,
  wukong: WUKONG_TEXTURE,
  kiemtien: KIEMTIEN_TEXTURE,
};

import type Phaser from 'phaser';
import {
  PLACEHOLDER_GROUND,
  PLACEHOLDER_KIT,
  paintPlaceholderEnv,
  paintPlaceholderLoot,
  paintSharedProps,
} from './placeholderArt';
import { MANA_SEED_TEXTURES, manaSeedKit, manaSeedLoaded, paintManaSeedEnv } from './manaSeedArt';
import { paintMonsterFallbacks } from './monsterArt';
import { paintItemDrops, paintLootChest } from './itemArt';
import type { EnvKit } from './kit';
import type { GroundKind } from '../zones/types';

export { WorldTexture, MobTexture } from './textures';
export { MANA_SEED_SOURCE, MANA_SEED_SOURCE_URL } from './manaSeedArt';
export { MONSTER_TEXTURES, monsterArt } from './monsterArt';
export { CHEST_SOURCE, CHEST_SOURCE_URL, ITEM_ICON_SOURCES, dropTexture } from './itemArt';
export { WORLD_RESOURCE_TEXTURES, WorldResourceTexture } from './worldResourceArt';
export type { DecalArt, EnvKit, PropArt, PropBox } from './kit';

/**
 * Which environment art the world paints with. Mana Seed's sample assumes a
 * ~32px tall character against the 110px one this game has, so it is offered at
 * two magnifications; 2x won the comparison and leads the cycle. The code-drawn
 * placeholder sits last, as the fallback for when the sheet is not staged.
 */
export type EnvArtId = 'placeholder' | 'manaseed-2x' | 'manaseed-3x';

export const ENV_ART_ORDER: readonly EnvArtId[] = ['manaseed-2x', 'manaseed-3x', 'placeholder'];

const DEFAULT_ART: EnvArtId = 'manaseed-2x';

// Suffixed because the default moved: without it, anyone who cycled to the
// placeholder while it was the default would be stuck on it forever.
const STORAGE_KEY = 'tmnd.envArt.v2';

let active: EnvArtId | null = null;

function isEnvArtId(value: string | null): value is EnvArtId {
  return !!value && (ENV_ART_ORDER as readonly string[]).includes(value);
}

export function envArt(): EnvArtId {
  if (active) return active;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // private mode / storage disabled — fall back to the default
  }
  active = isEnvArtId(stored) ? stored : DEFAULT_ART;
  return active;
}

export function setEnvArt(id: EnvArtId): void {
  active = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // nothing to do; the choice just will not survive a reload
  }
}

export function nextEnvArt(): EnvArtId {
  const order = ENV_ART_ORDER;
  return order[(order.indexOf(envArt()) + 1) % order.length];
}

function scaleOf(id: EnvArtId): number | null {
  return id === 'manaseed-2x' ? 2 : id === 'manaseed-3x' ? 3 : null;
}

let kit: EnvKit = PLACEHOLDER_KIT;

/** The art the chosen mode describes, whether or not a given zone can use it. */
export function envKit(): EnvKit {
  return kit;
}

/**
 * Kit a zone renders through. A tileset built around one biome will not cover
 * every ground this game has, and stretching it over the rest looks worse than
 * not using it — Mana Seed's clutter is drawn onto opaque grass tiles, which on
 * the ash valley's dark ground reads as a scatter of green squares. So a ground
 * the active kit omits falls back to the placeholder, which was drawn for all
 * three. Both kits are baked at boot, so this costs nothing at a zone change.
 */
export function envKitFor(ground: GroundKind): EnvKit {
  return kit.ground[ground] ? kit : PLACEHOLDER_KIT;
}

/** Ground texture for `ground`, total because the placeholder covers every one. */
export function groundTexture(from: EnvKit, ground: GroundKind): string {
  return from.ground[ground] ?? PLACEHOLDER_GROUND[ground];
}

/**
 * Bakes every kit, plus the art no kit owns: the shrine, the loot pile, the mob
 * roster and the item drops. The licensed packs behind those are each optional,
 * so they need a stand-in when their staging script has not been run.
 *
 * The placeholder is baked unconditionally rather than only as a fallback,
 * because `envKitFor` hands it whichever zones the chosen kit cannot dress.
 */
export function paintEnvironment(scene: Phaser.Scene): void {
  paintSharedProps(scene);
  paintMonsterFallbacks(scene);
  if (!paintLootChest(scene)) paintPlaceholderLoot(scene);
  paintItemDrops(scene);
  paintPlaceholderEnv(scene);

  const scale = scaleOf(envArt());
  if (scale !== null && manaSeedLoaded(scene)) {
    paintManaSeedEnv(scene, scale);
    kit = manaSeedKit(scale);
    return;
  }

  if (scale !== null) {
    // The sheet is missing (someone skipped `npm run env:manaseed`).
    setEnvArt('placeholder');
  }
  kit = PLACEHOLDER_KIT;
}

/**
 * Swaps kits while the world is running. Callers must rebuild the zone in the
 * same tick, because live sprites still hold frames from the dropped textures.
 *
 * Only the Mana Seed keys are dropped: they are the ones cut at a magnification,
 * so they change meaning between modes. The placeholder bakes the same pixels
 * every time and is shared by every mode, so re-cutting it would be waste.
 */
export function repaintEnvironment(scene: Phaser.Scene, id: EnvArtId): void {
  setEnvArt(id);
  for (const key of MANA_SEED_TEXTURES) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
  paintEnvironment(scene);
}

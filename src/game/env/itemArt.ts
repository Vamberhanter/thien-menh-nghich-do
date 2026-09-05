import Phaser from 'phaser';
import { gameAssetUrl } from '../../net/assets';
import { ITEM_CATALOG } from '../systems/Inventory';
import { magnify, WorldTexture } from './textures';

/**
 * Farm RPG FREE 16x16 by Kronovi. Run `npm run env:items` to stage it — licensed
 * art, so it stays out of git and is copied from the pack folder on demand.
 *
 * The pack is drawn for a 16px world, roughly a third of this game's scale, so
 * the chest is magnified to land near the size of the pile it replaces.
 */
export const CHEST_SOURCE = 'farm-chest';
export const CHEST_SOURCE_URL = gameAssetUrl('items/chest.png');

const CHEST_SCALE = 3;

/** True once `WorldTexture.Loot` holds the chest; false means the pack is missing. */
export function paintLootChest(scene: Phaser.Scene): boolean {
  magnify(scene, WorldTexture.Loot, CHEST_SOURCE, CHEST_SCALE);
  return scene.textures.exists(WorldTexture.Loot);
}

/**
 * The bag renders item icons through the DOM, but a pile on the ground is a
 * Phaser sprite, so every icon is loaded a second time as a texture and fitted
 * to world scale. Drawing the contents beats drawing a chest: the player can
 * tell a sword from a herb without walking over to read the prompt.
 */
const SMALL_ICON_SCALE = 2;
const MAX_DROP_SIZE = 64;

export interface ItemIconSource {
  key: string;
  url: string;
}

/** Source textures BootScene has to load, one per catalogued icon. */
export const ITEM_ICON_SOURCES: readonly ItemIconSource[] = Object.values(ITEM_CATALOG)
  .filter((item) => !!item.icon)
  .map((item) => ({ key: `item-${item.id}`, url: item.icon as string }));

function dropKey(itemId: string): string {
  return `drop-${itemId}`;
}

export function paintItemDrops(scene: Phaser.Scene): void {
  for (const item of Object.values(ITEM_CATALOG)) {
    if (!item.icon) continue;
    fitDrop(scene, dropKey(item.id), `item-${item.id}`);
  }
}

/**
 * Farm icons are 16–32px and need enlargement; the supplied painted crystals
 * are around 200px and need reduction. Both land inside the same 64px world
 * footprint while preserving their aspect ratio.
 */
function fitDrop(scene: Phaser.Scene, key: string, sourceKey: string): void {
  if (scene.textures.exists(key) || !scene.textures.exists(sourceKey)) return;
  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
  const largest = Math.max(source.width, source.height);
  const scale = largest <= 32 ? SMALL_ICON_SCALE : Math.min(1, MAX_DROP_SIZE / largest);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = largest > 32;
  ctx.drawImage(source, 0, 0, width, height);
  texture.refresh();
  texture.setFilter(
    largest > 32 ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST,
  );
}

/**
 * Texture for a pile holding `itemId`. Falls back to the chest for the pieces
 * with no icon of their own, and for a pack that was never staged.
 */
export function dropTexture(scene: Phaser.Scene, itemId: string | undefined): string {
  if (!itemId) return WorldTexture.Loot;
  const key = dropKey(itemId);
  return scene.textures.exists(key) ? key : WorldTexture.Loot;
}

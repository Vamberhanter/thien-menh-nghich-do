import type Phaser from 'phaser';
import { KitRole, kitKey, paint, WorldTexture } from './textures';
import type { EnvKit } from './kit';
import type { GroundKind } from '../zones/types';

/** This kit's own corner of the texture cache. */
const PH = (role: string) => kitKey('placeholder', role);

/**
 * Hand-coded stand-in scenery. It exists so the world is playable without any
 * licensed tileset, it stays the reference the real art gets judged against, and
 * the ash valley renders through it even when a tileset kit is active — see
 * `envKitFor`.
 */
export function paintPlaceholderEnv(scene: Phaser.Scene): void {
  bakeGrass(scene);
  bakeForest(scene);
  bakeAsh(scene);
  bakeTree(scene);
  bakeRock(scene);
  bakeTrainingStone(scene);
  bakePortal(scene);
}

/** The shrine has no tileset counterpart, so every kit shares it. */
export function paintSharedProps(scene: Phaser.Scene): void {
  bakeShrine(scene);
}

/** Stand-in loot pile, for when the Farm RPG chest has not been staged. */
export function paintPlaceholderLoot(scene: Phaser.Scene): void {
  bakeLoot(scene);
}

/**
 * Spelled out as a total map, unlike the kits built on a tileset: this is the
 * fallback every other kit's gaps resolve to, so it has to cover all three.
 */
export const PLACEHOLDER_GROUND: Record<GroundKind, string> = {
  grass: PH(KitRole.Grass),
  forest: PH(KitRole.Forest),
  ash: PH(KitRole.Ash),
};

/**
 * Props anchor at their centre here, which is why the collision boxes sit at a
 * positive offset: the box is pushed down from the middle of the sprite.
 */
export const PLACEHOLDER_KIT: EnvKit = {
  id: 'placeholder',
  label: 'Placeholder (vẽ bằng code)',
  ground: PLACEHOLDER_GROUND,
  tree: { texture: PH(KitRole.Tree), originY: 0.5, box: { width: 30, height: 20, offsetY: 38 } },
  rock: { texture: PH(KitRole.Rock), originY: 0.5, box: { width: 40, height: 20, offsetY: 0 } },
  stone: { texture: PH(KitRole.TrainingStone), originY: 0.5, box: { width: 40, height: 24, offsetY: 16 } },
  portal: { texture: PH(KitRole.Portal), originY: 0.5, labelLift: 36 },
  decals: [],
};

function bakeGrass(scene: Phaser.Scene): void {
  paint(scene, PH(KitRole.Grass), 32, 32, (px) => {
    px(0, 0, 32, 32, '#243c2c');
    // dithered clumps
    for (let y = 0; y < 32; y += 4) {
      for (let x = 0; x < 32; x += 4) {
        if ((x / 4 + y / 4) % 3 === 0) px(x, y, 2, 2, '#2c4834');
        if ((x / 4 + y / 4) % 5 === 0) px(x + 2, y + 2, 1, 1, '#375b41');
      }
    }
    px(6, 12, 1, 3, '#41684a');
    px(21, 5, 1, 3, '#41684a');
    px(26, 24, 1, 2, '#41684a');
  });
}

/** Broad canopy on a short trunk, so it still reads as a tree next to a
 *  110px tall character. */
function bakeTree(scene: Phaser.Scene): void {
  paint(scene, PH(KitRole.Tree), 48, 64, (px) => {
    // trunk
    px(21, 40, 7, 20, '#33241a');
    px(21, 40, 3, 20, '#4d3826');
    px(15, 56, 8, 4, '#33241a'); // roots
    px(26, 55, 9, 5, '#33241a');
    // canopy: dark base, mid body, lit top-left
    px(6, 12, 36, 24, '#162d20');
    px(10, 6, 28, 34, '#162d20');
    px(8, 14, 32, 20, '#1e3d2b');
    px(12, 8, 24, 28, '#1e3d2b');
    px(10, 16, 26, 14, '#265034');
    px(14, 10, 18, 20, '#265034');
    px(14, 12, 14, 12, '#2f6440');
    px(16, 12, 8, 6, '#3d7a4e');
    // leaf clumps breaking the silhouette
    px(4, 20, 4, 8, '#162d20');
    px(40, 20, 4, 8, '#162d20');
    px(18, 4, 12, 4, '#1e3d2b');
    px(20, 34, 8, 6, '#162d20');
  });
}

function bakeRock(scene: Phaser.Scene): void {
  paint(scene, PH(KitRole.Rock), 28, 22, (px) => {
    px(4, 8, 20, 12, '#43485c');
    px(6, 4, 14, 6, '#4e5468');
    px(8, 2, 8, 4, '#5a6077');
    px(6, 16, 18, 4, '#33374a');
    px(9, 5, 4, 2, '#6b7189');
    px(18, 10, 3, 3, '#33374a');
  });
}

function bakeTrainingStone(scene: Phaser.Scene): void {
  paint(scene, PH(KitRole.TrainingStone), 32, 40, (px) => {
    px(6, 6, 20, 32, '#3a3550');
    px(8, 4, 16, 4, '#474163');
    px(8, 8, 16, 26, '#4a4468');
    px(10, 10, 12, 22, '#544d76');
    px(14, 14, 4, 4, '#6fd8ff');
    px(13, 20, 6, 2, '#6fd8ff');
    px(14, 24, 4, 2, '#2f9fd8');
    px(6, 34, 20, 4, '#2a2640');
  });
}

function bakeForest(scene: Phaser.Scene): void {
  paint(scene, PH(KitRole.Forest), 32, 32, (px) => {
    px(0, 0, 32, 32, '#1a2e22');
    for (let y = 0; y < 32; y += 4) {
      for (let x = 0; x < 32; x += 4) {
        if ((x / 4 + y / 4) % 3 === 0) px(x, y, 2, 2, '#243c2c');
        if ((x / 4 + y / 4) % 5 === 0) px(x + 2, y + 1, 1, 2, '#162418');
      }
    }
  });
}

function bakeAsh(scene: Phaser.Scene): void {
  paint(scene, PH(KitRole.Ash), 32, 32, (px) => {
    px(0, 0, 32, 32, '#2a2228');
    for (let y = 0; y < 32; y += 4) {
      for (let x = 0; x < 32; x += 4) {
        if ((x / 4 + y / 4) % 3 === 0) px(x, y, 2, 2, '#3a2a30');
        if ((x / 4 + y / 4) % 4 === 0) px(x + 1, y + 2, 1, 1, '#5a3038');
      }
    }
  });
}

function bakePortal(scene: Phaser.Scene): void {
  paint(scene, PH(KitRole.Portal), 36, 40, (px) => {
    px(10, 28, 16, 6, '#1a2030');
    px(8, 8, 20, 22, '#1c3a4a');
    px(12, 12, 12, 14, '#2f9fd8');
    px(14, 14, 8, 10, '#9fe8ff');
    px(16, 16, 4, 6, '#e9f3ff');
  });
}

function bakeShrine(scene: Phaser.Scene): void {
  paint(scene, WorldTexture.Shrine, 40, 52, (px) => {
    px(4, 40, 32, 8, '#3a3554');
    px(8, 38, 24, 6, '#4a4468');
    px(14, 16, 12, 24, '#544d76');
    px(12, 12, 16, 8, '#6b64a0');
    px(16, 4, 8, 12, '#6fd8ff');
    px(18, 2, 4, 6, '#e9f3ff');
    px(17, 14, 6, 4, '#9fe8ff');
  });
}

function bakeLoot(scene: Phaser.Scene): void {
  paint(scene, WorldTexture.Loot, 16, 14, (px) => {
    px(2, 4, 12, 8, '#6b4a1e');
    px(3, 3, 10, 3, '#8a6428');
    px(6, 6, 4, 3, '#d4a84a');
  });
}

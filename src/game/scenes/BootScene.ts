import Phaser from 'phaser';
import {
  LIN_YUAN_ATLAS_PATH,
  LIN_YUAN_ATLAS_URL,
  LIN_YUAN_TEXTURE,
} from '../animations/linYuanAnimations';
import {
  NHU_YEN_ATLAS_PATH,
  NHU_YEN_ATLAS_URL,
  NHU_YEN_TEXTURE,
} from '../animations/nhuYenAnimations';
import {
  BOSS1_ATLAS_PATH,
  BOSS1_ATLAS_URL,
  BOSS1_TEXTURE,
} from '../animations/bossAnimations';

/** Placeholder scenery is drawn at this pixel size to match the character. */
const PIXEL = 2;

export const WorldTexture = {
  Grass: 'tile-grass',
  Tree: 'prop-tree',
  Rock: 'prop-rock',
  TrainingStone: 'prop-training-stone',
} as const;

/** Loads assets and bakes the placeholder environment tiles. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.multiatlas(LIN_YUAN_TEXTURE, LIN_YUAN_ATLAS_URL, LIN_YUAN_ATLAS_PATH);
    this.load.multiatlas(NHU_YEN_TEXTURE, NHU_YEN_ATLAS_URL, NHU_YEN_ATLAS_PATH);
    this.load.multiatlas(BOSS1_TEXTURE, BOSS1_ATLAS_URL, BOSS1_ATLAS_PATH);

    const width = this.scale.width;
    const height = this.scale.height;
    const bar = this.add.rectangle(width / 2, height / 2, 320, 6, 0x2f9fd8).setOrigin(0.5);
    bar.setScale(0, 1);
    this.add
      .text(width / 2, height / 2 - 28, 'THIÊN MỆNH NGHỊCH ĐỒ', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#dff4ff',
      })
      .setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      bar.setScale(value, 1);
    });
  }

  create(): void {
    // Nearest-neighbour keeps every sprite pixel-sharp when the canvas scales.
    this.textures.get(LIN_YUAN_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get(NHU_YEN_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get(BOSS1_TEXTURE).setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.bakeGrass();
    this.bakeTree();
    this.bakeRock();
    this.bakeTrainingStone();

    this.scene.start('TestScene');
  }

  /* --------------------------------------------------- placeholder textures */

  /**
   * Draws into a canvas texture with hard pixels only. Every coordinate is
   * multiplied by PIXEL, so the placeholder scenery shares the character
   * sheet's chunky pixel grid instead of looking twice as fine.
   */
  private paint(
    key: string,
    width: number,
    height: number,
    draw: (px: (x: number, y: number, w: number, h: number, color: string) => void) => void,
  ): void {
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, width * PIXEL, height * PIXEL);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    draw((x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * PIXEL, y * PIXEL, w * PIXEL, h * PIXEL);
    });
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private bakeGrass(): void {
    this.paint(WorldTexture.Grass, 32, 32, (px) => {
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
  private bakeTree(): void {
    this.paint(WorldTexture.Tree, 48, 64, (px) => {
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

  private bakeRock(): void {
    this.paint(WorldTexture.Rock, 28, 22, (px) => {
      px(4, 8, 20, 12, '#43485c');
      px(6, 4, 14, 6, '#4e5468');
      px(8, 2, 8, 4, '#5a6077');
      px(6, 16, 18, 4, '#33374a');
      px(9, 5, 4, 2, '#6b7189');
      px(18, 10, 3, 3, '#33374a');
    });
  }

  private bakeTrainingStone(): void {
    this.paint(WorldTexture.TrainingStone, 32, 40, (px) => {
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
}

import Phaser from 'phaser';
import {
  LIN_YUAN_ATLAS_LOCAL_PATH,
  LIN_YUAN_ATLAS_LOCAL_URL,
  LIN_YUAN_ATLAS_PATH,
  LIN_YUAN_ATLAS_URL,
  LIN_YUAN_TEXTURE,
} from '../animations/linYuanAnimations';
import {
  NHU_YEN_ATLAS_LOCAL_PATH,
  NHU_YEN_ATLAS_LOCAL_URL,
  NHU_YEN_ATLAS_PATH,
  NHU_YEN_ATLAS_URL,
  NHU_YEN_TEXTURE,
} from '../animations/nhuYenAnimations';
import {
  HUYET_LANG_ATLAS_LOCAL_PATH,
  HUYET_LANG_ATLAS_LOCAL_URL,
  HUYET_LANG_ATLAS_PATH,
  HUYET_LANG_ATLAS_URL,
  HUYET_LANG_TEXTURE,
} from '../animations/huyetLangAnimations';
import {
  MIKU_ATLAS_LOCAL_PATH,
  MIKU_ATLAS_LOCAL_URL,
  MIKU_ATLAS_PATH,
  MIKU_ATLAS_URL,
  MIKU_TEXTURE,
} from '../animations/mikuAnimations';
import {
  BOSS1_ATLAS_LOCAL_PATH,
  BOSS1_ATLAS_LOCAL_URL,
  BOSS1_ATLAS_PATH,
  BOSS1_ATLAS_URL,
  BOSS1_TEXTURE,
} from '../animations/bossAnimations';
import {
  CHEST_SOURCE,
  CHEST_SOURCE_URL,
  ITEM_ICON_SOURCES,
  MANA_SEED_SOURCE,
  MANA_SEED_SOURCE_URL,
  MONSTER_TEXTURES,
  WORLD_RESOURCE_TEXTURES,
  paintEnvironment,
} from '../env';

const ATLASES = [
  {
    key: LIN_YUAN_TEXTURE,
    url: LIN_YUAN_ATLAS_URL,
    path: LIN_YUAN_ATLAS_PATH,
    localUrl: LIN_YUAN_ATLAS_LOCAL_URL,
    localPath: LIN_YUAN_ATLAS_LOCAL_PATH,
  },
  {
    key: NHU_YEN_TEXTURE,
    url: NHU_YEN_ATLAS_URL,
    path: NHU_YEN_ATLAS_PATH,
    localUrl: NHU_YEN_ATLAS_LOCAL_URL,
    localPath: NHU_YEN_ATLAS_LOCAL_PATH,
  },
  {
    key: HUYET_LANG_TEXTURE,
    url: HUYET_LANG_ATLAS_URL,
    path: HUYET_LANG_ATLAS_PATH,
    localUrl: HUYET_LANG_ATLAS_LOCAL_URL,
    localPath: HUYET_LANG_ATLAS_LOCAL_PATH,
  },
  {
    key: MIKU_TEXTURE,
    url: MIKU_ATLAS_URL,
    path: MIKU_ATLAS_PATH,
    localUrl: MIKU_ATLAS_LOCAL_URL,
    localPath: MIKU_ATLAS_LOCAL_PATH,
  },
  {
    key: BOSS1_TEXTURE,
    url: BOSS1_ATLAS_URL,
    path: BOSS1_ATLAS_PATH,
    localUrl: BOSS1_ATLAS_LOCAL_URL,
    localPath: BOSS1_ATLAS_LOCAL_PATH,
  },
] as const;

/** Loads assets and bakes the environment art the world renders through. */
export class BootScene extends Phaser.Scene {
  private readonly localRetry = new Set<string>();

  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.setCORS('anonymous');
    for (const atlas of ATLASES) {
      this.load.multiatlas(atlas.key, atlas.url, atlas.path);
    }
    // All three licensed packs are optional — `paintEnvironment` substitutes
    // placeholder art for whichever ones have not been staged, so a miss here
    // costs a console 404 and nothing else.
    this.load.image(MANA_SEED_SOURCE, MANA_SEED_SOURCE_URL);
    this.load.image(CHEST_SOURCE, CHEST_SOURCE_URL);
    for (const monster of MONSTER_TEXTURES) {
      this.load.image(monster.key, monster.url);
    }
    // The bag reaches these through the DOM; the world needs them as textures so
    // a pile on the ground can show what is in it.
    for (const icon of ITEM_ICON_SOURCES) {
      this.load.image(icon.key, icon.url);
    }
    for (const resource of WORLD_RESOURCE_TEXTURES) {
      this.load.image(resource.key, resource.url);
    }

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onAtlasMiss, this);

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
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onAtlasMiss, this);

    // Nearest-neighbour keeps every sprite pixel-sharp when the canvas scales.
    for (const atlas of ATLASES) {
      if (!this.textures.exists(atlas.key)) continue;
      this.textures.get(atlas.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    paintEnvironment(this);

    this.scene.start('WorldScene');
  }

  /** CDN miss → retry the same key from Vite's public folder. */
  private onAtlasMiss(file: Phaser.Loader.File): void {
    const atlas = ATLASES.find((entry) => entry.key === file.key);
    if (!atlas || this.localRetry.has(atlas.key)) return;
    if (atlas.url === atlas.localUrl) return;
    this.localRetry.add(atlas.key);
    this.load.multiatlas(atlas.key, atlas.localUrl, atlas.localPath);
  }
}

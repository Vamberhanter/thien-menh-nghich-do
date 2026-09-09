import Phaser from 'phaser';
import { RENDER_SCALE, viewHeight, viewWidth } from '../config/renderScale';
import { loadNguHanhSonArt, registerNguHanhSonFrames } from '../env/nguHanhSonArt';
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
  WUKONG_ATLAS_LOCAL_PATH,
  WUKONG_ATLAS_LOCAL_URL,
  WUKONG_ATLAS_PATH,
  WUKONG_ATLAS_URL,
  WUKONG_TEXTURE,
} from '../animations/wukongAnimations';
import {
  KIEMTIEN_ATLAS_LOCAL_PATH,
  KIEMTIEN_ATLAS_LOCAL_URL,
  KIEMTIEN_ATLAS_PATH,
  KIEMTIEN_ATLAS_URL,
  KIEMTIEN_TEXTURE,
} from '../animations/kiemtienAnimations';
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
  FARM_TEXTURES,
} from '../env';
import { WAN_KIEM_TEXTURES } from '../systems/WanKiemQuyTongEffect';
import {
  FX_ATLAS_LOCAL_PATH,
  FX_ATLAS_LOCAL_URL,
  FX_ATLAS_PATH,
  FX_ATLAS_URL,
  FX_TEXTURE,
} from '../animations/fxAnimations';

const ATLASES = [
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
    key: WUKONG_TEXTURE,
    url: WUKONG_ATLAS_URL,
    path: WUKONG_ATLAS_PATH,
    localUrl: WUKONG_ATLAS_LOCAL_URL,
    localPath: WUKONG_ATLAS_LOCAL_PATH,
  },
  // Movement art only so far, and not yet a playable kit — it loads here so the
  // texture is there to build the class on.
  {
    key: KIEMTIEN_TEXTURE,
    url: KIEMTIEN_ATLAS_URL,
    path: KIEMTIEN_ATLAS_PATH,
    localUrl: KIEMTIEN_ATLAS_LOCAL_URL,
    localPath: KIEMTIEN_ATLAS_LOCAL_PATH,
  },
  {
    key: BOSS1_TEXTURE,
    url: BOSS1_ATLAS_URL,
    path: BOSS1_ATLAS_PATH,
    localUrl: BOSS1_ATLAS_LOCAL_URL,
    localPath: BOSS1_ATLAS_LOCAL_PATH,
  },
  // Shared world effects rather than a character: ground torn open, and
  // whatever else of that kind gets drawn later.
  {
    key: FX_TEXTURE,
    url: FX_ATLAS_URL,
    path: FX_ATLAS_PATH,
    localUrl: FX_ATLAS_LOCAL_URL,
    localPath: FX_ATLAS_LOCAL_PATH,
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
    loadNguHanhSonArt(this);
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
    for (const farm of FARM_TEXTURES) {
      this.load.image(farm.key, farm.url);
    }
    // Vạn Kiếm Quy Tông's eight effect frames. Loose images rather than part of
    // her atlas — see the note at the top of WanKiemQuyTongEffect.
    for (const vfx of WAN_KIEM_TEXTURES) {
      this.load.image(vfx.key, vfx.url);
    }

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.onAtlasMiss, this);

    // World units, not canvas pixels: the canvas is `RENDER_SCALE` times larger
    // than the world and the camera is zoomed to match, so a bar placed at
    // `scale.width / 2` would sit off the right of the screen.
    this.cameras.main.setZoom(RENDER_SCALE);
    const width = viewWidth(this);
    const height = viewHeight(this);
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

    // After the loader, before the world: the tilemap needs its tileset and
    // the props need their frame table, and both are read the moment the zone
    // builds.
    const frames = registerNguHanhSonFrames(this);
    if (import.meta.env.DEV && frames) console.info(`nguhanhson: ${frames} frame`);

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

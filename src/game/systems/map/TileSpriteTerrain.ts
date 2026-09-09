import Phaser from 'phaser';
import { envKitFor, groundTexture } from '../../env';
import type { EnvKit, PropArt } from '../../env/kit';
import type { ZoneDef } from '../../zones';
import type { TerrainContext, TerrainHandle, TerrainSource } from './TerrainSource';

/**
 * The terrain the five existing zones are built on: one repeating ground
 * sprite, scattered clutter, and props at free pixel positions.
 *
 * Lifted out of `WorldScene.loadZone` unchanged in behaviour — same order of
 * creation, same depths, same seeded scatter — so the zones look exactly as
 * they did. What it gains is a boundary: the scene no longer knows how ground
 * is drawn, which is what lets a Tiled source sit beside this one later.
 */

/** Ground sits below everything; -1000 leaves room for shadows and scars. */
const GROUND_DEPTH = -1000;

/** One decal per this many square pixels of zone. */
const DECAL_DENSITY = 26000;

/** Clutter is kept this far off fixtures that own their ground. */
const CLEAR_OF_SHRINE = 180;
const CLEAR_OF_ARENA = 40;
const CLEAR_OF_PORTAL = 140;
const CLEAR_OF_FARM = 40;
const CLEAR_OF_ROAD_X = 36;
const CLEAR_OF_ROAD_Y = 16;

export class TileSpriteTerrain implements TerrainSource {
  readonly id = 'tilesprite';

  build(scene: Phaser.Scene, map: ZoneDef, context: TerrainContext): TerrainHandle {
    const kit = envKitFor(map.ground);
    const made: Phaser.GameObjects.GameObject[] = [];

    const ground = scene.add
      .tileSprite(0, 0, map.width, map.height, groundTexture(kit, map.ground))
      .setOrigin(0, 0)
      .setDepth(GROUND_DEPTH);
    context.lighting.light(ground);
    made.push(ground);

    const decals = scatter(scene, map, kit);
    made.push(...decals);

    const addSolid = (art: PropArt, x: number, y: number): Phaser.Physics.Arcade.Sprite => {
      const sprite = context.solids.create(x, y, art.texture) as Phaser.Physics.Arcade.Sprite;
      context.lighting.light(sprite);
      // Depth is the anchor row, so the prop sorts against a character by which
      // of them is standing further down the screen.
      sprite.setOrigin(0.5, art.originY).setDepth(y);
      const box = art.box;
      if (box) {
        const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(box.width, box.height);
        body.position.set(x - box.width / 2, y + box.offsetY);
        body.updateCenter();
      }
      return sprite;
    };

    for (const [x, y] of map.trees) addSolid(kit.tree, x, y);
    for (const [x, y] of map.rocks) addSolid(kit.rock, x, y);

    return {
      width: map.width,
      height: map.height,
      decals,
      // Nothing is unconditionally overhead here: this source sorts per sprite
      // by foot Y, which is finer than a layer and is the point of the model.
      overhead: [],
      addSolid,
      destroy: () => {
        for (const object of made) object.destroy();
        made.length = 0;
        decals.length = 0;
      },
    };
  }
}

/**
 * Ground clutter, seeded off the map id so the layout is stable across
 * repaints — otherwise comparing two magnifications would also be comparing
 * two different forests.
 */
function scatter(
  scene: Phaser.Scene,
  map: ZoneDef,
  kit: EnvKit,
): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = [];
  if (kit.decals.length === 0) return out;

  const rng = new Phaser.Math.RandomDataGenerator([map.id]);
  const total = kit.decals.reduce((sum, decal) => sum + decal.weight, 0);
  const pick = () => {
    let roll = rng.frac() * total;
    for (const decal of kit.decals) {
      roll -= decal.weight;
      if (roll <= 0) return decal;
    }
    return kit.decals[kit.decals.length - 1];
  };

  const count = Math.round((map.width * map.height) / DECAL_DENSITY);
  for (let i = 0; i < count; i++) {
    const x = Math.round(rng.between(40, map.width - 40));
    const y = Math.round(rng.between(40, map.height - 40));
    if (!clearGround(map, x, y)) continue;
    out.push(scene.add.image(x, y, pick().texture).setOrigin(0.5, 1).setDepth(y - 1));
  }
  return out;
}

/** False where a fixture owns the ground and clutter would sit on top of it. */
function clearGround(map: ZoneDef, x: number, y: number): boolean {
  const { shrine, arena, portals, farmBed, farmPath } = map;
  if (Phaser.Math.Distance.Between(x, y, shrine.x, shrine.y) < CLEAR_OF_SHRINE) return false;
  if (arena && Phaser.Math.Distance.Between(x, y, arena.x, arena.y) < arena.radius + CLEAR_OF_ARENA) {
    return false;
  }
  if (!portals.every((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) > CLEAR_OF_PORTAL)) {
    return false;
  }
  if (farmBed && inside(x, y, farmBed, CLEAR_OF_FARM, CLEAR_OF_FARM)) return false;
  if (farmPath && inside(x, y, farmPath, CLEAR_OF_ROAD_X, CLEAR_OF_ROAD_Y)) return false;
  return true;
}

function inside(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number },
  padX: number,
  padY: number,
): boolean {
  return (
    x >= rect.x - padX &&
    x <= rect.x + rect.width + padX &&
    y >= rect.y - padY &&
    y <= rect.y + rect.height + padY
  );
}

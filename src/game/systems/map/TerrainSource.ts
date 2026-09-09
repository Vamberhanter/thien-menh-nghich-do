import type Phaser from 'phaser';
import type { WorldLights } from '../WorldLights';
import type { PropArt } from '../../env/kit';
import type { ZoneDef } from '../../zones';

/**
 * The seam between "what a map is" and "how its ground gets drawn".
 *
 * This game does not draw ground the way most Phaser RPGs do. There is no tile
 * grid: the floor is one repeating `TileSprite` the size of the zone, props sit
 * at free pixel positions, and depth is each sprite's own foot Y — which is why
 * a character can walk behind a tree while above it and in front of the same
 * tree while below it. A single "AbovePlayer" layer cannot do that.
 *
 * That model is worth keeping, and it is also not the only one worth having: a
 * hand-drawn village wants to be painted in Tiled. So terrain is a strategy
 * rather than a hardcoded step. `MapManager` picks the source a map asks for,
 * and everything downstream — collision, camera, spawns, transitions — only
 * ever sees the `TerrainHandle` below and does not care which built it.
 *
 * Adding a second source (Tiled) therefore changes nothing outside this folder.
 */
export interface TerrainContext {
  /** Ambient/point lighting for the zone; sources hand it what they create. */
  lighting: WorldLights;
  /**
   * Solid group every source fills. Owned by `MapManager` rather than by the
   * source, because the scene adds to it too — training stones are props that
   * also take damage, so they are created by the scene and made solid here.
   */
  solids: Phaser.Physics.Arcade.StaticGroup;
}

/** What a built map hands back. Nothing here is source-specific. */
export interface TerrainHandle {
  /** World size in pixels — camera bounds and physics bounds come from this. */
  readonly width: number;
  readonly height: number;
  /**
   * Ground clutter with no collision, in creation order.
   *
   * Exposed rather than hidden because a fixture may need to clear the ground
   * it is about to cover: the farm court removes the scatter that would
   * otherwise poke through its tilled bed.
   */
  readonly decals: Phaser.GameObjects.Image[];
  /**
   * Drawn over the player whatever their foot Y — a Tiled AbovePlayer layer,
   * or empty for a source that sorts per sprite instead. Kept so the depth
   * model is the source's business and not the scene's.
   */
  readonly overhead: readonly Phaser.GameObjects.GameObject[];
  /** Places one solid prop and returns it, for a scene that needs the sprite. */
  addSolid(art: PropArt, x: number, y: number): Phaser.Physics.Arcade.Sprite;
  /** Destroys everything this source made. Does not touch `solids`. */
  destroy(): void;
  /**
   * The live ground/overlay layers, for a source built on a real Phaser
   * tilemap. `undefined` for the sprite source, which has no per-tile grid to
   * hand back. Only `MapEditor` reads this — nothing about collision, the
   * camera or spawns needs to know a tile grid exists underneath them.
   */
  readonly tileLayers?: {
    readonly ground: Phaser.Tilemaps.TilemapLayer;
    readonly overlay: Phaser.Tilemaps.TilemapLayer;
    readonly cols: number;
    readonly rows: number;
    readonly tileSize: number;
  };
  /**
   * Every prop `layout.props` placed, live — for `MapEditor` to select, drag
   * and delete the map's own scenery rather than only what a session adds on
   * top of it. `undefined` for the sprite source, same reasoning as `tileLayers`.
   */
  readonly editableProps?: readonly import('./TilemapTerrain').EditableProp[];
  /**
   * The invisible collision body standing on each blocked tile, keyed
   * `"col,row"`. `MapEditor`'s ground brush reads this to take a cell's body
   * back out when a walkable tile gets painted over what used to be water or
   * the void — without it, `blocked[]` and what the tile actually looks like
   * would drift apart the moment anyone painted over either.
   */
  readonly blockedBodies?: ReadonlyMap<string, Phaser.Physics.Arcade.Sprite>;
}

export interface TerrainSource {
  /** Stable name, for `MapManager` errors and the debug overlay. */
  readonly id: string;
  build(scene: Phaser.Scene, map: ZoneDef, context: TerrainContext): TerrainHandle;
}

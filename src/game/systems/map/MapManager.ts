import Phaser from 'phaser';
import type { WorldLights } from '../WorldLights';
import type { PropArt } from '../../env/kit';
import { zoneOf, type ZoneDef, type ZoneId } from '../../zones';
import type { TerrainHandle, TerrainSource } from './TerrainSource';
import { TileSpriteTerrain } from './TileSpriteTerrain';
import { TilemapTerrain } from './TilemapTerrain';

/**
 * Owns the ground a map is made of: terrain, solids, and the bounds both the
 * camera and the physics world are clamped to.
 *
 * It deliberately does *not* own what lives on that ground. Mobs, NPCs, chests,
 * the farm and the portals are placed by the scene, because each of them talks
 * to a system the map layer has no business knowing about — quests, the bag,
 * the net session. The line is: if destroying it is enough to unload it, it
 * belongs here; if it has to tell somebody it is going, it does not.
 *
 * Terrain is chosen per map through `TerrainSource`, so a map painted in Tiled
 * and a map built from a zone module can sit in the same world without the
 * scene branching on which is which.
 */
export class MapManager {
  private readonly sources = new Map<string, TerrainSource>();
  private terrain?: TerrainHandle;
  private current?: ZoneDef;

  /** Solids outlive a single terrain build: the scene adds to them too. */
  solids!: Phaser.Physics.Arcade.StaticGroup;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lighting: WorldLights,
  ) {
    this.register(new TileSpriteTerrain());
    this.register(new TilemapTerrain());
  }

  register(source: TerrainSource): void {
    this.sources.set(source.id, source);
  }

  /** The map in play. Throws only if read before the first `load`. */
  get map(): ZoneDef {
    if (!this.current) throw new Error('MapManager: no map loaded');
    return this.current;
  }

  get decals(): Phaser.GameObjects.Image[] {
    return this.terrain?.decals ?? [];
  }

  get overhead(): readonly Phaser.GameObjects.GameObject[] {
    return this.terrain?.overhead ?? [];
  }

  /** The active terrain's live tile layers, for `MapEditor` only — see `TerrainHandle`. */
  get tileLayers(): TerrainHandle['tileLayers'] {
    return this.terrain?.tileLayers;
  }

  /** The active terrain's live props, for `MapEditor` only — see `TerrainHandle`. */
  get editableProps(): TerrainHandle['editableProps'] {
    return this.terrain?.editableProps;
  }

  /** Per-tile collision bodies, for `MapEditor` only — see `TerrainHandle`. */
  get blockedBodies(): TerrainHandle['blockedBodies'] {
    return this.terrain?.blockedBodies;
  }

  /**
   * Swaps in a map: tears down the last terrain, builds the new one, and moves
   * the world bounds with it.
   *
   * The lighting pipeline is enabled *before* the build so every object the
   * source creates can be handed it on creation rather than swept up after.
   * `ambient` defaults to white, which leaves a zone looking exactly as it did
   * unlit — lights then only ever add.
   */
  load(id: ZoneId): ZoneDef {
    const map = zoneOf(id);
    if (map.id !== id) {
      // `zoneOf` falls back rather than throwing, which is right at runtime and
      // useless in development — a typo in a portal target would silently send
      // the player to the training ground.
      console.error(`MapManager: khong co map "${id}", da fallback ve "${map.id}"`);
    }
    this.swapTerrain(map);
    return map;
  }

  /**
   * Swaps in a `ZoneDef` that was never registered in `ZONES` — a blank canvas
   * `MapEditor` just built, or a saved draft it fetched back from Supabase.
   *
   * Only `MapEditor` calls this, and only as a local preview: nothing else
   * about the running scene (mobs, NPCs, the farm) knows the zone changed,
   * the same way its "Xoá TOÀN BỘ" already only ever touched what is on
   * screen. Reloading the page returns to whatever the player's own zone
   * actually is.
   */
  loadDraft(map: ZoneDef): void {
    this.swapTerrain(map);
  }

  /**
   * Tears down the last terrain, builds the new one, and moves the world
   * bounds with it — shared by a real zone id and a synthetic draft alike.
   *
   * The lighting pipeline is enabled *before* the build so every object the
   * source creates can be handed it on creation rather than swept up after.
   * `ambient` defaults to white, which leaves a zone looking exactly as it did
   * unlit — lights then only ever add.
   */
  private swapTerrain(map: ZoneDef): void {
    this.unload();
    this.current = map;

    const source = this.sources.get(sourceIdFor(map));
    if (!source) throw new Error(`MapManager: khong co terrain source "${sourceIdFor(map)}"`);

    this.lighting.enable(map.ambient ?? 0xffffff);
    this.solids = this.scene.physics.add.staticGroup();
    this.terrain = source.build(this.scene, map, { lighting: this.lighting, solids: this.solids });

    this.scene.physics.world.setBounds(0, 0, this.terrain.width, this.terrain.height);
  }

  /** Places one solid prop through the active terrain and returns the sprite. */
  addSolid(art: PropArt, x: number, y: number): Phaser.Physics.Arcade.Sprite {
    if (!this.terrain) throw new Error('MapManager: addSolid truoc khi load');
    return this.terrain.addSolid(art, x, y);
  }

  /** Drops decals a fixture is about to cover; returns how many went. */
  clearDecals(covers: (sprite: Phaser.GameObjects.Image) => boolean): number {
    const decals = this.terrain?.decals;
    if (!decals || decals.length === 0) return 0;
    let removed = 0;
    for (let i = decals.length - 1; i >= 0; i--) {
      if (!covers(decals[i])) continue;
      decals[i].destroy();
      decals.splice(i, 1);
      removed++;
    }
    return removed;
  }

  unload(): void {
    this.terrain?.destroy();
    this.terrain = undefined;
    this.current = undefined;
    // Wrapped: on HMR and scene teardown the physics world can be gone first,
    // and a throw here would strand the rest of the unload.
    try {
      this.solids?.clear(true, true);
    } catch {
      // physics world already torn down
    }
  }
}

/**
 * Which terrain a map wants.
 *
 * `ZoneDef` has no field for it yet, so every existing zone gets the sprite
 * ground it already had. When a map arrives carrying a Tiled key this reads it
 * instead, and the five zone modules keep working untouched — the whole reason
 * the seam is here.
 */
function sourceIdFor(map: ZoneDef): string {
  return (map as ZoneDef & { terrain?: string }).terrain ?? 'tilesprite';
}

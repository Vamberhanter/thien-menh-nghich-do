import Phaser from 'phaser';
import type { Mob } from '../../entities/Mob';
import { MOB_AI } from '../../entities/Mob';
import { EnemyAI, type AiTarget } from '../EnemyAI';
import type { MobKind, MobSpawn } from '../../zones';
import type { Vector2Like } from '../../types';

/**
 * Who is alive, where they came back from, and whether they are worth thinking
 * about this frame.
 *
 * The split with `WorldScene` is policy against wiring. Building a mob means
 * attaching it to the lighting pipeline, the hit effects, three colliders and
 * the target list — all of which reach into systems a spawner has no business
 * knowing — so the scene keeps that and hands it in as `create`. What lives
 * here is everything that decides *whether* to call it: nest sizes, placement,
 * respawn clocks, level gates, and the activation radius.
 *
 * That boundary is also why the tick loop moved. It was iterating packs to run
 * the AI, and the AI's target search is the one per-mob-per-frame cost in the
 * game; gating it is the point of `activeDistance`, and gating it from outside
 * would mean the scene asking this class a question every frame anyway.
 */

/** Shared respawn clock, for a spawn point that does not name its own. */
export const MOB_RESPAWN_MS = 12000;

/**
 * Past this from the nearest player a mob stops being simulated.
 *
 * The camera shows about 1280x720 world units, so 800 is comfortably outside
 * the corner of the screen: nothing the player can see is ever asleep, and
 * nothing asleep can be seen waking. It buys the AI's target search, which is
 * the only per-mob work that scales with how many other things are alive.
 */
export const ENEMY_ACTIVE_DISTANCE = 800;

/** One live mob and the state that belongs to it rather than to its nest. */
export interface MobPack {
  /** Stable id the net layer addresses this mob by. */
  index: number;
  mob: Mob;
  ai: EnemyAI;
  respawnAt: number | null;
  /** Heavenly tribulation wave — replaced by nothing when it dies. */
  tribulation?: boolean;
  /** Which spawn point owns it; absent for a tribulation wave. */
  nest?: MobSpawn;
  /** False while out of `activeDistance`. Read by the debug overlay. */
  active: boolean;
}

export interface SpawnHooks {
  /** Builds a mob already wired into the scene, or null if it cannot. */
  create(kind: MobKind, x: number, y: number, hpScale?: number): Mob | null;
  /** What the AI should hunt from a given point. */
  nearestPrey(from: Vector2Like): AiTarget | null;
  /** Pushes a mob back out of ground it must not stand on. */
  contain(mob: Mob): void;
  /** Drops a mob from the scene's own bookkeeping before it is destroyed. */
  forget(mob: Mob): void;
  /** True while this client simulates the world. */
  hosting(): boolean;
  /** The point activation is measured from, or null before the player exists. */
  focus(): Vector2Like | null;
  /** Cultivation level, for a nest that is gated on it. */
  level(): number;
}

/** Tribulation indices start here so they can never collide with a nest's. */
const TRIBULATION_BASE = 9000;

export class SpawnManager {
  private list: MobPack[] = [];
  private nests: MobSpawn[] = [];
  private nextIndex = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: SpawnHooks,
    private readonly activeDistance = ENEMY_ACTIVE_DISTANCE,
  ) {}

  get packs(): readonly MobPack[] {
    return this.list;
  }

  *mobs(): Iterable<Mob> {
    for (const pack of this.list) yield pack.mob;
  }

  packOf(mob: Mob): MobPack | undefined {
    return this.list.find((pack) => pack.mob === mob);
  }

  byIndex(index: number): MobPack | undefined {
    return this.list.find((pack) => pack.index === index);
  }

  /**
   * Fills a map's nests.
   *
   * Indices are handed out in nest order and then per member, so the first mob
   * of the first nest is 0 whatever the nest sizes are — the net layer holds
   * these across a zone and they have to be reproducible on every client.
   */
  load(nests: readonly MobSpawn[]): void {
    this.clear();
    this.nests = [...nests];
    this.nextIndex = 0;
    const level = this.hooks.level();
    for (const nest of this.nests) {
      const count = nest.maxCount ?? 1;
      for (let i = 0; i < count; i++) {
        const index = this.nextIndex++;
        if ((nest.minLevel ?? 0) > level) continue;
        this.hatch(nest, index);
      }
    }
  }

  /** A wave that owes nothing to the map: tougher, tinted, and never replaced. */
  summonWave(kinds: readonly MobKind[], at: Vector2Like, count: number, hpScale: number): void {
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length]!;
      const angle = (Math.PI * 2 * i) / count;
      const bounds = this.scene.physics.world.bounds;
      const x = Phaser.Math.Clamp(at.x + Math.cos(angle) * 140, 80, bounds.width - 80);
      const y = Phaser.Math.Clamp(at.y + Math.sin(angle) * 110, 80, bounds.height - 80);
      const mob = this.hooks.create(kind, x, y, hpScale);
      if (!mob) continue;
      mob.setTint(0xffe08a);
      this.list.push({
        index: TRIBULATION_BASE + i,
        mob,
        ai: new EnemyAI(mob, MOB_AI[kind]),
        respawnAt: null,
        tribulation: true,
        active: true,
      });
    }
  }

  /** Puts a kill on its nest's clock, or on nothing if it owes the map nothing. */
  scheduleRespawn(mob: Mob): void {
    const pack = this.packOf(mob);
    if (!pack) return;
    if (pack.tribulation) {
      pack.respawnAt = null;
      return;
    }
    pack.respawnAt = this.scene.time.now + (pack.nest?.respawnMs ?? MOB_RESPAWN_MS);
  }

  /**
   * Respawns what is due, then runs the AI for what is close enough to matter.
   *
   * `mob.tick` runs for everything alive whatever the distance: it is the
   * animation, the frost timer and the health bar, and a frost mark that
   * stopped counting down because the player walked away would be a bug rather
   * than an optimisation. What the radius gates is the AI, whose target search
   * is the only part that costs anything per mob.
   */
  tick(time: number, delta: number): void {
    const hosting = this.hooks.hosting();
    const focus = this.hooks.focus();
    const reach = this.activeDistance * this.activeDistance;

    for (const pack of this.list) {
      if (hosting && pack.respawnAt !== null && time >= pack.respawnAt) {
        pack.mob.respawn();
        pack.ai.anchorHere();
        pack.respawnAt = null;
      }
      pack.mob.tick(time, delta);

      if (!hosting || !pack.mob.alive || pack.mob.frozen) {
        pack.active = false;
        continue;
      }

      const foot = pack.mob.hitPoint();
      pack.active =
        !focus ||
        Phaser.Math.Distance.Squared(focus.x, focus.y, foot.x, foot.y) <= reach;
      if (!pack.active) {
        // Left standing rather than left running: a mob frozen mid-stride would
        // slide on for as long as the player stays away.
        pack.mob.setVelocity(0, 0);
        continue;
      }

      pack.ai.update(time, delta, this.hooks.nearestPrey(foot));
      this.hooks.contain(pack.mob);
    }
  }

  /** Drops every tribulation mob; the map's own nests are untouched. */
  clearWave(): void {
    const keep: MobPack[] = [];
    for (const pack of this.list) {
      if (!pack.tribulation) {
        keep.push(pack);
        continue;
      }
      this.hooks.forget(pack.mob);
      pack.mob.destroy();
    }
    this.list = keep;
  }

  clear(): void {
    for (const pack of this.list) pack.mob.destroy();
    this.list = [];
    this.nests = [];
  }

  /** Live/asleep/total, for the debug overlay and the frame readout. */
  census(): { total: number; alive: number; active: number } {
    let alive = 0;
    let active = 0;
    for (const pack of this.list) {
      if (pack.mob.alive) alive++;
      if (pack.active) active++;
    }
    return { total: this.list.length, alive, active };
  }

  private hatch(nest: MobSpawn, index: number): void {
    const radius = nest.radius ?? 0;
    let x = nest.x;
    let y = nest.y;
    if (radius > 0) {
      // Seeded off the nest and the member so a zone lays out the same way on
      // every client — the net layer addresses these by index.
      const rng = new Phaser.Math.RandomDataGenerator([`${nest.kind}:${nest.x}:${nest.y}:${index}`]);
      const angle = rng.frac() * Math.PI * 2;
      const distance = Math.sqrt(rng.frac()) * radius; // even over the disc
      const bounds = this.scene.physics.world.bounds;
      x = Phaser.Math.Clamp(nest.x + Math.cos(angle) * distance, 60, bounds.width - 60);
      y = Phaser.Math.Clamp(nest.y + Math.sin(angle) * distance, 60, bounds.height - 60);
    }
    const mob = this.hooks.create(nest.kind, x, y);
    if (!mob) return;
    this.list.push({
      index,
      mob,
      ai: new EnemyAI(mob, MOB_AI[nest.kind]),
      respawnAt: null,
      nest,
      active: true,
    });
  }
}

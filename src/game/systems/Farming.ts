export interface SeedDefinition {
  id: string;
  name: string;
  seedItemId: string;
  harvestItemId: string;
  growTimeMs: number;
  yield: number;
}

export type PlotStatus = 'empty' | 'growing' | 'ready';

export interface FarmPlot {
  id: string;
  status: PlotStatus;
  seedId: string | null;
  plantedAt: number | null;
  readyAt: number | null;
  /** Growth clock starts only after the first watering. */
  watered: boolean;
}

export interface FarmState {
  plots: FarmPlot[];
}

export type FarmingError =
  | 'unknown-plot'
  | 'unknown-seed'
  | 'plot-occupied'
  | 'plot-empty'
  | 'not-ready'
  | 'needs-water'
  | 'already-watered'
  | 'seed-unavailable'
  | 'invalid-time';

export type FarmingResult =
  | {
      ok: true;
      state: FarmState;
      plot: FarmPlot;
      inventoryDelta: Record<string, number>;
    }
  | { ok: false; state: FarmState; error: FarmingError };

export const DEFAULT_FARM_PLOTS = 12;

export const SEED_CATALOG: Readonly<Record<string, SeedDefinition>> = Object.freeze({
  'spirit-herb-seed': {
    id: 'spirit-herb-seed',
    name: 'Hạt Thanh Linh Thảo',
    seedItemId: 'spirit-herb-seed',
    harvestItemId: 'spirit-herb',
    growTimeMs: 60_000,
    yield: 2,
  },
  'blood-berry-seed': {
    id: 'blood-berry-seed',
    name: 'Hạt Huyết Quả',
    seedItemId: 'blood-berry-seed',
    harvestItemId: 'blood-berry',
    growTimeMs: 120_000,
    yield: 3,
  },
  'earth-fruit-seed': {
    id: 'earth-fruit-seed',
    name: 'Hạt Địa Linh Quả',
    seedItemId: 'earth-fruit-seed',
    harvestItemId: 'earth-fruit',
    growTimeMs: 240_000,
    yield: 2,
  },
  'essence-root-seed': {
    id: 'essence-root-seed',
    name: 'Mầm Hoàng Tinh Căn',
    seedItemId: 'essence-root-seed',
    harvestItemId: 'essence-root',
    growTimeMs: 480_000,
    yield: 1,
  },
});

function emptyPlot(id: string): FarmPlot {
  return {
    id,
    status: 'empty',
    seedId: null,
    plantedAt: null,
    readyAt: null,
    watered: false,
  };
}

export function createFarmState(plotCount = DEFAULT_FARM_PLOTS): FarmState {
  const count = Number.isFinite(plotCount) ? Math.max(0, Math.floor(plotCount)) : 0;
  return {
    plots: Array.from({ length: count }, (_, index) => emptyPlot(`plot-${index + 1}`)),
  };
}

/** Pads missing plot ids so older 6-plot saves grow into the full field. */
export function ensureFarmPlots(
  state: Readonly<FarmState>,
  plotCount = DEFAULT_FARM_PLOTS,
): FarmState {
  const count = Number.isFinite(plotCount) ? Math.max(0, Math.floor(plotCount)) : 0;
  const byId = new Map(snapshotFarm(state).plots.map((plot) => [plot.id, plot]));
  const plots: FarmPlot[] = [];
  for (let index = 0; index < count; index++) {
    const id = `plot-${index + 1}`;
    plots.push(byId.get(id) ?? emptyPlot(id));
  }
  return { plots };
}

export function snapshotFarm(state: Readonly<FarmState>): FarmState {
  return {
    plots: state.plots.map((plot) => {
      const seed = plot.seedId ? SEED_CATALOG[plot.seedId] : undefined;
      if (!seed || plot.plantedAt === null) return emptyPlot(plot.id);
      // Older saves started the clock on plant (readyAt set, no watered flag).
      const watered =
        plot.watered === true || (plot.watered !== false && plot.readyAt !== null);
      const readyAt = watered && plot.readyAt !== null ? plot.readyAt : null;
      return {
        id: plot.id,
        status: plot.status === 'ready' ? 'ready' : 'growing',
        seedId: seed.id,
        plantedAt: plot.plantedAt,
        readyAt,
        watered,
      };
    }),
  };
}

function validTime(now: number): boolean {
  return Number.isFinite(now) && now >= 0;
}

/** Advances watered plots to ready when their deadline has passed. */
export function growFarm(state: Readonly<FarmState>, now: number): FarmState {
  const next = snapshotFarm(state);
  if (!validTime(now)) return next;
  for (const plot of next.plots) {
    if (
      plot.status === 'growing' &&
      plot.watered &&
      plot.readyAt !== null &&
      now >= plot.readyAt
    ) {
      plot.status = 'ready';
    }
  }
  return next;
}

export function plantSeed(
  state: Readonly<FarmState>,
  plotId: string,
  seedId: string,
  now: number,
  availableSeeds = 1,
): FarmingResult {
  const next = snapshotFarm(state);
  if (!validTime(now)) return { ok: false, state: next, error: 'invalid-time' };
  const plot = next.plots.find((candidate) => candidate.id === plotId);
  if (!plot) return { ok: false, state: next, error: 'unknown-plot' };
  const seed = SEED_CATALOG[seedId];
  if (!seed) return { ok: false, state: next, error: 'unknown-seed' };
  if (plot.status !== 'empty') return { ok: false, state: next, error: 'plot-occupied' };
  if (!Number.isInteger(availableSeeds) || availableSeeds < 1) {
    return { ok: false, state: next, error: 'seed-unavailable' };
  }
  // Clock starts on water, not on plant.
  plot.status = 'growing';
  plot.seedId = seed.id;
  plot.plantedAt = now;
  plot.readyAt = null;
  plot.watered = false;
  return {
    ok: true,
    state: next,
    plot: { ...plot },
    inventoryDelta: { [seed.seedItemId]: -1 },
  };
}

/** First watering starts the growth timer. */
export function waterPlot(
  state: Readonly<FarmState>,
  plotId: string,
  now: number,
): FarmingResult {
  if (!validTime(now)) {
    return { ok: false, state: snapshotFarm(state), error: 'invalid-time' };
  }
  const next = growFarm(state, now);
  const plot = next.plots.find((candidate) => candidate.id === plotId);
  if (!plot) return { ok: false, state: next, error: 'unknown-plot' };
  if (plot.status === 'empty' || !plot.seedId) {
    return { ok: false, state: next, error: 'plot-empty' };
  }
  if (plot.status === 'ready') return { ok: false, state: next, error: 'not-ready' };
  if (plot.watered) return { ok: false, state: next, error: 'already-watered' };
  const seed = SEED_CATALOG[plot.seedId];
  if (!seed) return { ok: false, state: next, error: 'unknown-seed' };
  plot.watered = true;
  plot.readyAt = now + seed.growTimeMs;
  if (seed.growTimeMs === 0) plot.status = 'ready';
  return {
    ok: true,
    state: next,
    plot: { ...plot },
    inventoryDelta: {},
  };
}

export function harvestPlot(
  state: Readonly<FarmState>,
  plotId: string,
  now: number,
): FarmingResult {
  if (!validTime(now)) {
    return { ok: false, state: snapshotFarm(state), error: 'invalid-time' };
  }
  const next = growFarm(state, now);
  const plotIndex = next.plots.findIndex((candidate) => candidate.id === plotId);
  if (plotIndex < 0) return { ok: false, state: next, error: 'unknown-plot' };
  const plot = next.plots[plotIndex];
  if (plot.status === 'empty' || !plot.seedId) {
    return { ok: false, state: next, error: 'plot-empty' };
  }
  if (!plot.watered || plot.readyAt === null) {
    return { ok: false, state: next, error: 'needs-water' };
  }
  if (plot.status !== 'ready') return { ok: false, state: next, error: 'not-ready' };
  const seed = SEED_CATALOG[plot.seedId];
  const harvested = { ...plot };
  next.plots[plotIndex] = emptyPlot(plot.id);
  return {
    ok: true,
    state: next,
    plot: harvested,
    inventoryDelta: { [seed.harvestItemId]: seed.yield },
  };
}

/** Progress from 0 to 1 after watering; 0 while waiting for water. */
export function plotGrowth(plot: Readonly<FarmPlot>, now: number): number {
  if (plot.status === 'empty' || !plot.seedId) return 0;
  if (!plot.watered || plot.readyAt === null) return 0;
  if (plot.status === 'ready' || now >= plot.readyAt) return 1;
  const growMs = SEED_CATALOG[plot.seedId]?.growTimeMs ?? 0;
  if (growMs <= 0) return 1;
  const start = plot.readyAt - growMs;
  return Math.max(0, Math.min(1, (now - start) / growMs));
}

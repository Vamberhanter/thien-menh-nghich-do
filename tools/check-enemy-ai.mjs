// Drives EnemyAI with a fake clock and a stub actor, and checks the decisions.
//   node tools/check-enemy-ai.mjs
//
// The AI is deliberately free of Phaser, so its whole decision loop can be
// tested here rather than by watching a boss in the browser: aggro hysteresis,
// range bands, action gaps, patrol, and the hands-off rules. Run it after
// touching `EnemyAI.ts` or a boss profile.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

// EnemyAI is TypeScript; esbuild ships with vite, so no extra dependency
const out = join(mkdtempSync(join(tmpdir(), 'ai-')), 'EnemyAI.mjs');
buildSync({
  entryPoints: ['src/game/systems/EnemyAI.ts'],
  outfile: out,
  format: 'esm',
  bundle: true,
  platform: 'neutral',
});
const { EnemyAI } = await import(pathToFileURL(out).href);

/* ------------------------------------------------------------------ stubs */

function makeActor(x = 0, y = 0) {
  const calls = [];
  const actor = {
    position: { x, y },
    alive: true,
    busy: false,
    speed: 100,
    cooldowns: {},
    now: 0,
    move(direction, speedScale = 1) {
      calls.push({ kind: 'move', speedScale });
      // integrate at a fixed 16ms step so patrol legs actually get somewhere
      actor.position.x += direction.x * actor.speed * speedScale * 0.016;
      actor.position.y += direction.y * actor.speed * speedScale * 0.016;
    },
    halt() {
      calls.push({ kind: 'halt' });
    },
    look() {
      calls.push({ kind: 'look' });
    },
    ready(id) {
      return actor.now >= (actor.cooldowns[id] ?? 0);
    },
    perform(id) {
      if (!actor.ready(id)) return false;
      calls.push({ kind: 'perform', id, at: actor.now });
      actor.cooldowns[id] = actor.now + PROFILE.cooldowns[id];
      return true;
    },
    calls,
  };
  return actor;
}

/** Same shape as the boss's profile, with the cooldowns the stub enforces. */
const PROFILE = {
  aggroRadius: 460,
  leashRadius: 760,
  keepDistance: 94,
  patrolRadius: 190,
  patrolPause: [900, 2200],
  patrolSpeed: 0.45,
  actionGap: 620,
  strafe: 0.35,
  homeRadius: 620,
  actions: [
    { id: 'nova', maxRange: 168, priority: 4, recover: 520 },
    { id: 'melee', maxRange: 128, priority: 3, recover: 260 },
    { id: 'bolt', minRange: 150, maxRange: 460, priority: 2, recover: 340 },
  ],
  cooldowns: { melee: 1500, bolt: 3400, nova: 9000 },
};

/** Deterministic "random" so patrol legs are reproducible. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Runs the AI for `ms` of fake time in 16ms steps. */
function run(ai, actor, target, ms, onStep) {
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    actor.now += 16;
    ai.update(actor.now, 16, target);
    onStep?.(actor.now);
  }
}

/* ------------------------------------------------------------------ checks */

let failures = 0;
function check(name, condition, detail = '') {
  const mark = condition ? 'ok  ' : 'FAIL';
  if (!condition) failures++;
  console.log(`${mark} ${name}${detail ? `  — ${detail}` : ''}`);
}

// 1. no target -> patrols around its anchor, and comes back to it
{
  const actor = makeActor(1000, 1000);
  const ai = new EnemyAI(actor, PROFILE, seeded(7));
  let maxDrift = 0;
  run(ai, actor, null, 12000, () => {
    maxDrift = Math.max(
      maxDrift,
      Math.hypot(actor.position.x - 1000, actor.position.y - 1000),
    );
  });
  const moved = actor.calls.filter((c) => c.kind === 'move');
  check('patrols when nothing is near', moved.length > 100, `${moved.length} move calls`);
  check(
    'patrol walks at patrol speed, not full speed',
    moved.every((c) => c.speedScale === PROFILE.patrolSpeed),
  );
  check(
    'patrol stays inside its radius',
    maxDrift <= PROFILE.patrolRadius + 20,
    `max drift ${Math.round(maxDrift)}px of ${PROFILE.patrolRadius}`,
  );
  check(
    'patrol pauses between legs',
    actor.calls.some((c) => c.kind === 'halt'),
  );
}

// 2. aggro edge + hysteresis
{
  const actor = makeActor(0, 0);
  const ai = new EnemyAI(actor, PROFILE, seeded(3));
  const target = { position: { x: 500, y: 0 }, alive: true };
  run(ai, actor, target, 200);
  check('ignores a target outside aggro', !ai.debug.engaged, `at 500px`);

  target.position.x = 450;
  run(ai, actor, target, 100);
  check('engages inside aggro', ai.debug.engaged, 'at 450px');

  // Long enough for any `recover` from the shot it just took to lapse: while
  // recovering the AI deliberately holds its engagement rather than
  // re-evaluating aggro mid-swing, so a shorter window proves nothing.
  target.position.x = actor.position.x + 700;
  run(ai, actor, target, 900);
  check('keeps a target it already has past aggro (hysteresis)', ai.debug.engaged, 'at 700px');

  target.position.x = actor.position.x + 800;
  run(ai, actor, target, 900);
  check('drops it past the leash', !ai.debug.engaged, 'at 800px');
}

// 3. closes to keepDistance and no further
{
  const actor = makeActor(0, 0);
  const ai = new EnemyAI(actor, PROFILE, seeded(11));
  const target = { position: { x: 400, y: 0 }, alive: true };
  let closest = Infinity;
  run(ai, actor, target, 9000, () => {
    closest = Math.min(closest, Math.abs(target.position.x - actor.position.x));
  });
  check(
    'closes in on the target',
    closest < PROFILE.keepDistance + 30,
    `got within ${Math.round(closest)}px`,
  );
  check(
    'does not walk into the target',
    closest > PROFILE.keepDistance - 40,
    `closest ${Math.round(closest)}px vs keepDistance ${PROFILE.keepDistance}`,
  );
}

// 4. range bands pick the right action
{
  const at = (distance, ms = 1200) => {
    const actor = makeActor(0, 0);
    const ai = new EnemyAI(actor, PROFILE, seeded(5));
    const target = { position: { x: distance, y: 0 }, alive: true };
    // hold the distance: re-place the target each step so closing does not change it
    run(ai, actor, target, ms, () => {
      target.position.x = actor.position.x + distance;
    });
    return actor.calls.filter((c) => c.kind === 'perform').map((c) => c.id);
  };
  check('300px picks the ranged bolt', at(300)[0] === 'bolt', `${at(300)[0]}`);
  check('120px picks a melee band action', ['nova', 'melee'].includes(at(120)[0]), `${at(120)[0]}`);
  check('100px prefers nova while it is up (priority)', at(100)[0] === 'nova', `${at(100)[0]}`);
  check('600px fires nothing', at(600).length === 0);
  // point blank: the bolt's minRange keeps it out
  check('60px never fires the bolt', !at(60, 4000).includes('bolt'), at(60, 4000).join(','));
}

// 5. gaps and cooldowns
{
  const actor = makeActor(0, 0);
  const ai = new EnemyAI(actor, PROFILE, seeded(2));
  const target = { position: { x: 100, y: 0 }, alive: true };
  run(ai, actor, target, 20000, () => {
    target.position.x = actor.position.x + 100;
  });
  const performs = actor.calls.filter((c) => c.kind === 'perform');
  let minGap = Infinity;
  for (let i = 1; i < performs.length; i++) {
    minGap = Math.min(minGap, performs[i].at - performs[i - 1].at);
  }
  check(
    'never fires two actions closer than the gap',
    minGap >= PROFILE.actionGap,
    `min gap ${minGap}ms of ${PROFILE.actionGap}`,
  );
  const melees = performs.filter((p) => p.id === 'melee');
  let minMelee = Infinity;
  for (let i = 1; i < melees.length; i++) {
    minMelee = Math.min(minMelee, melees[i].at - melees[i - 1].at);
  }
  check(
    'respects each action cooldown',
    minMelee >= PROFILE.cooldowns.melee,
    `melee gap ${minMelee}ms of ${PROFILE.cooldowns.melee}`,
  );
  check('keeps fighting for the whole window', performs.length >= 8, `${performs.length} actions`);
}

// 6. hands off while an animation owns the body, and when dead
{
  const actor = makeActor(0, 0);
  const ai = new EnemyAI(actor, PROFILE, seeded(9));
  const target = { position: { x: 100, y: 0 }, alive: true };
  actor.busy = true;
  run(ai, actor, target, 2000);
  check('never steers a busy actor', actor.calls.length === 0, `${actor.calls.length} calls`);
  check('reports the strike state while busy', ai.debug.state === 'strike');

  actor.busy = false;
  actor.alive = false;
  actor.calls.length = 0;
  run(ai, actor, target, 2000);
  check('never steers a dead actor', actor.calls.length === 0, `${actor.calls.length} calls`);
  check('reports dead', ai.debug.state === 'dead');
}

// 7. stops fighting a corpse
{
  const actor = makeActor(0, 0);
  const ai = new EnemyAI(actor, PROFILE, seeded(4));
  const target = { position: { x: 120, y: 0 }, alive: true };
  run(ai, actor, target, 3000, () => {
    target.position.x = actor.position.x + 120;
  });
  const before = actor.calls.filter((c) => c.kind === 'perform').length;
  target.alive = false;
  actor.calls.length = 0;
  run(ai, actor, target, 4000);
  const after = actor.calls.filter((c) => c.kind === 'perform').length;
  check('was fighting a live target', before > 0, `${before} actions`);
  check('stops attacking once it dies', after === 0);
  check('goes back to patrolling', ['patrol', 'idle', 'return'].includes(ai.debug.state), ai.debug.state);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'game-assets';

/**
 * Upload targets. Each character also has a key of its own so a rebuild of one
 * kit does not have to push the others' atlases over the live copies.
 */
const SETS = {
  nhuyen: ['public/assets/characters/nhuyen/atlas'],
  huyetlang: ['public/assets/characters/huyetlang/atlas'],
  wukong: ['public/assets/characters/wukong/atlas'],
  characters: [
    'public/assets/characters/nhuyen/atlas',
    'public/assets/characters/huyetlang/atlas',
    'public/assets/characters/miku/atlas',
    'public/assets/characters/wukong/atlas',
  ],
  boss: ['public/assets/boss/boss1/atlas'],
  environment: ['public/assets/environment/manaseed'],
  monsters: ['public/assets/monsters'],
  items: ['public/assets/items'],
  weapons: ['public/assets/weapons'],
  resources: ['public/assets/resources'],
};

function loadEnv() {
  const text = readFileSync(join(ROOT, '.env'), 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

/**
 * Which normal maps this directory actually uses.
 *
 * `build-normals` leaves its output on disk even when the `normalMap` keys are
 * stripped back out of the atlas, so turning the lighting on later is one
 * command rather than a rebuild. That is only free as long as nothing ships
 * them: they run half again the size of the textures, and the game never
 * fetches a normal map the JSON does not name. So the JSON is the authority
 * here, not the file listing.
 */
function referencedNormals(abs) {
  const used = new Set();
  for (const name of readdirSync(abs)) {
    if (!name.endsWith('.json')) continue;
    let atlas;
    try {
      atlas = JSON.parse(readFileSync(join(abs, name), 'utf8'));
    } catch {
      continue; // not an atlas; it still gets uploaded verbatim below
    }
    for (const texture of atlas.textures ?? []) {
      if (texture.normalMap) used.add(texture.normalMap);
    }
  }
  return used;
}

function collect(dir) {
  const abs = join(ROOT, dir);
  const out = [];
  const normals = referencedNormals(abs);
  for (const name of readdirSync(abs)) {
    const full = join(abs, name);
    if (statSync(full).isDirectory()) continue;
    if (!/\.(webp|png|json)$/i.test(name)) continue;
    if (/_n[.](webp|png)$/i.test(name) && !normals.has(name)) continue;
    const objectPath = posix.join(...relative(join(ROOT, 'public', 'assets'), full).split(/\\|\//));
    out.push({ full, objectPath, name });
  }
  return out;
}

function mime(name) {
  if (name.endsWith('.json')) return 'application/json';
  return name.endsWith('.webp') ? 'image/webp' : 'image/png';
}

async function upload(url, key, file) {
  const body = readFileSync(file.full);
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${file.objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': mime(file.name),
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    if (/row-level security|Unauthorized|AccessDenied/i.test(text)) {
      throw new Error(
        `${file.objectPath}: ${res.status} ${text}\n\n` +
          'The bucket is refusing this key. Either add SUPABASE_SERVICE_ROLE_KEY to\n' +
          '.env (Supabase dashboard -> Project Settings -> API -> service_role), or\n' +
          'give the anon role an insert/update policy on the game-assets bucket.',
      );
    }
    throw new Error(`${file.objectPath}: ${res.status} ${text}`);
  }
  return body.length;
}

const which = process.argv.slice(2);
const keys = which.length ? which : Object.keys(SETS);
const dirs = keys.flatMap((key) => {
  if (!SETS[key]) throw new Error(`Unknown set "${key}". Use: ${Object.keys(SETS).join(', ')}`);
  return SETS[key];
});

const env = loadEnv();
const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
/*
 * Service-role key first, publishable key as the fallback.
 *
 * Writing to the bucket goes through the same row-level security as any
 * other table, and the publishable key is the anonymous role — so whether it
 * can upload depends entirely on the storage policies of the day. When it
 * cannot, the failure is a 400 carrying a 403 inside it, which reads like a
 * bad request rather than like a permission problem; the message below says
 * what it actually is.
 *
 * SUPABASE_SERVICE_ROLE_KEY has no VITE_ prefix on purpose. Vite only inlines
 * VITE_-prefixed variables into the bundle, so naming it this way is what
 * keeps a key that bypasses RLS out of the shipped client.
 */
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) in .env',
  );
}

const files = dirs.flatMap(collect);
let bytes = 0;
for (const file of files) {
  const size = await upload(url, key, file);
  bytes += size;
  console.log(`ok  ${file.objectPath}  ${(size / 1024).toFixed(1)} KB`);
}
console.log(`\n${files.length} files, ${(bytes / 1048576).toFixed(2)} MB → ${BUCKET}`);

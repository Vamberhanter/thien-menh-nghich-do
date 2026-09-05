import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'game-assets';

const SETS = {
  characters: [
    'public/assets/characters/lamuyen',
    'public/assets/characters/nhuyen/atlas',
    'public/assets/characters/huyetlang/atlas',
    'public/assets/characters/miku/atlas',
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

function collect(dir) {
  const abs = join(ROOT, dir);
  const out = [];
  for (const name of readdirSync(abs)) {
    const full = join(abs, name);
    if (statSync(full).isDirectory()) continue;
    if (!/\.(png|json)$/i.test(name)) continue;
    const objectPath = posix.join(...relative(join(ROOT, 'public', 'assets'), full).split(/\\|\//));
    out.push({ full, objectPath, name });
  }
  return out;
}

function mime(name) {
  return name.endsWith('.json') ? 'application/json' : 'image/png';
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

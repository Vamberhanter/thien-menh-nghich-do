import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY');

const ROOT = new URL('../public/assets/', import.meta.url);
const FILES = [
  'characters/lamuyen/lamuyen.json',
  'characters/lamuyen/lamuyen-idle.png',
  'characters/lamuyen/lamuyen-walk.png',
  'characters/lamuyen/lamuyen-attack.png',
  'characters/lamuyen/lamuyen-skill.png',
  'characters/lamuyen/lamuyen-hurt.png',
  'characters/lamuyen/lamuyen-death.png',
  'characters/lamuyen/lamuyen-fx.png',
  'characters/nhuyen/atlas/nhuyen.json',
  'characters/nhuyen/atlas/nhuyen-idle.png',
  'characters/nhuyen/atlas/nhuyen-walk.png',
  'characters/nhuyen/atlas/nhuyen-attack.png',
  'characters/nhuyen/atlas/nhuyen-skill.png',
  'characters/nhuyen/atlas/nhuyen-hurt.png',
  'characters/nhuyen/atlas/nhuyen-fx.png',
  'characters/nhuyen/atlas/nhuyen-fx-ice.png',
  'characters/huyetlang/atlas/huyetlang.json',
  'characters/huyetlang/atlas/huyetlang-idle.png',
  'characters/huyetlang/atlas/huyetlang-walk.png',
  'characters/huyetlang/atlas/huyetlang-attack.png',
  'characters/huyetlang/atlas/huyetlang-skill.png',
  'characters/huyetlang/atlas/huyetlang-hurt.png',
  'characters/huyetlang/atlas/huyetlang-fx.png',
  'characters/huyetlang/atlas/huyetlang-fx-magma.png',
];

function mime(name) {
  return name.endsWith('.json') ? 'application/json' : 'image/png';
}

for (const file of FILES) {
  const disk = new URL(file, ROOT);
  const body = readFileSync(disk);
  const target = `${url}/storage/v1/object/game-assets/${file}`;
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': mime(file),
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok && res.status !== 400) {
    const text = await res.text();
    throw new Error(`${file} → ${res.status} ${text}`);
  }
  if (!res.ok) {
    const retry = await fetch(target, {
      method: 'PUT',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': mime(file),
        'x-upsert': 'true',
      },
      body,
    });
    if (!retry.ok) throw new Error(`${file} → ${retry.status} ${await retry.text()}`);
  }
  const kb = (body.length / 1024).toFixed(1);
  console.log(`ok ${file} (${kb} KB)`);
}

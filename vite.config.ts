import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Drops the hand-made source sheets from the build.
 *
 * The sheets live under `public/` because that is where they are authored and
 * where `npm run build:lamuyen` / `build:nhuyen` / `build:boss` read them from,
 * but the game only ever loads the atlases cut out of them — so Vite copying
 * them into `dist/` ships megabytes nothing fetches.
 *
 * The list of what to keep is *derived*, not written down: every atlas JSON in
 * the build names the images it needs, and the bundled CSS/JS names the UI art
 * it points at. Anything else under `assets/` is by definition unreachable. A
 * hardcoded list used to do this and silently rotted twice — it never learned
 * about the five boss sheets, and it still named `nhuyen-attack (1).png` after
 * that file was renamed — leaving 12MB of dead art in `dist`.
 */
function stripSourceSheets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'strip-source-sheets',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const assets = join(outDir, 'assets');
      const files = await walk(assets);

      const referenced = new Set<string>();
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        try {
          const atlas = JSON.parse(await readFile(file, 'utf8'));
          for (const texture of atlas.textures ?? []) {
            if (texture.image) referenced.add(resolve(dirname(file), texture.image));
          }
        } catch {
          // not an atlas: leave whatever it is alone
        }
      }

      // The lobby art is reached from a stylesheet rather than an atlas, so
      // whatever the emitted bundles name is reachable too. Root-relative and
      // document-relative spellings both count — Phaser loaders use the latter.
      const bundles = (await walk(outDir)).filter((file) => /\.(css|js|html)$/i.test(file));
      for (const file of bundles) {
        const text = await readFile(file, 'utf8');
        for (const [url] of text.matchAll(/\/?assets\/[\w\-./@]+\.(?:png|webp|jpe?g)/gi)) {
          referenced.add(resolve(outDir, url.replace(/^\//, '')));
        }
      }

      let removed = 0;
      let bytes = 0;
      for (const file of files) {
        if (!/\.(png|webp|jpe?g)$/i.test(file)) continue;
        if (referenced.has(resolve(file))) continue;
        bytes += (await stat(file)).size;
        await rm(file, { force: true });
        removed++;
      }
      if (removed > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `strip-source-sheets: dropped ${removed} unreferenced image(s), ` +
            `${(bytes / 1048576).toFixed(2)} MB`,
        );
      }
    },
  };
}

/** Every file under `dir`, recursively. Missing directories yield nothing. */
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

export default defineConfig({
  plugins: [react(), stripSourceSheets()],
  server: {
    port: 5173,
    /**
     * Bind every interface, not just loopback, so a phone or a second machine
     * on the same LAN can open the game. This is a dev server with no auth —
     * anyone who can reach this network can load it, so leave it off (`host:
     * false`) when on a network you do not trust.
     */
    host: true,
  },
  build: { target: 'es2020' },
});

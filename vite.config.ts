import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Hand-made sprite sheets, in the order their builders consume them.
 *
 * They live under `public/` because that is where they are authored and where
 * `npm run build:lamuyen` / `build:nhuyen` read them from, but the game only
 * ever loads the atlases cut out of them — so Vite copying them into `dist/`
 * adds ~13MB of art nothing fetches. Keeping the list here rather than moving
 * the art keeps the authoring layout intact.
 */
const SOURCE_SHEETS = [
  'assets/characters/lamuyen/lamuyen.png',
  'assets/characters/nhuyen/nhuyen-idle.png',
  'assets/characters/nhuyen/nhuyen-walk&run.png',
  'assets/characters/nhuyen/nhuyen-attack (1).png',
  'assets/characters/nhuyen/nhuyen-skill.png',
  'assets/characters/nhuyen/nhuyen-hurt&death.png',
];

function stripSourceSheets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'strip-source-sheets',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      for (const sheet of SOURCE_SHEETS) {
        await rm(join(outDir, sheet), { force: true });
      }
    },
  };
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

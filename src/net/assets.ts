const BUCKET = 'game-assets';

function storageRoot(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}`;
}

/** Local asset in development, public Storage object in production. */
export function gameAssetUrl(path: string): string {
  const objectPath = path.replace(/^\/?assets\//, '');
  const localUrl = `assets/${objectPath}`;
  const root = storageRoot();
  return root && !import.meta.env.DEV ? `${root}/${objectPath}` : localUrl;
}

export type AtlasLoc = {
  url: string;
  path: string;
  /** Vite `public/` copy — BootScene falls back here if the CDN miss. */
  localUrl: string;
  localPath: string;
};

export function localAtlas(jsonPath: string, dirPath: string): AtlasLoc {
  const url = `assets/${jsonPath}`;
  const path = `assets/${dirPath}`;
  return { url, path, localUrl: url, localPath: path };
}

/**
 * Atlas JSON URL + folder Phaser uses to resolve each sheet PNG.
 *
 * Dev always hits Vite's `public/` folder so a newly built character works
 * before anyone uploads it to Storage. Production builds prefer the CDN and
 * keep `localUrl`/`localPath` for a BootScene miss fallback.
 */
export function remoteAtlas(jsonPath: string, dirPath: string): AtlasLoc {
  const local = localAtlas(jsonPath, dirPath);
  const root = storageRoot();
  if (!root || import.meta.env.DEV) return local;
  return {
    url: `${root}/${jsonPath}`,
    path: `${root}/${dirPath}`,
    localUrl: local.url,
    localPath: local.path,
  };
}

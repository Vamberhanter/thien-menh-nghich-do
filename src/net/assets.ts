const BUCKET = 'game-assets';

function storageRoot(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}`;
}

/** Atlas JSON URL + folder Phaser uses to resolve each sheet PNG. */
export function remoteAtlas(jsonPath: string, dirPath: string): { url: string; path: string } {
  const root = storageRoot();
  if (!root) {
    return { url: `assets/${jsonPath}`, path: `assets/${dirPath}` };
  }
  return {
    url: `${root}/${jsonPath}`,
    path: `${root}/${dirPath}`,
  };
}

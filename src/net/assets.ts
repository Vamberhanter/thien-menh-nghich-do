const BUCKET = 'game-assets';

function storageRoot(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}`;
}

export type AtlasLoc = {
  url: string;
  path: string;
  localUrl: string;
  localPath: string;
};

export function localAtlas(jsonPath: string, dirPath: string): AtlasLoc {
  const url = `assets/${jsonPath}`;
  const path = `assets/${dirPath}`;
  return { url, path, localUrl: url, localPath: path };
}

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

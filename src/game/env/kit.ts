import type { GroundKind } from '../zones/types';

export interface PropBox {
  width: number;
  height: number;
  /** Body top, measured down from the sprite's anchor row. */
  offsetY: number;
}

export interface PropArt {
  texture: string;
  /**
   * 0.5 anchors the sprite at its centre, 1 at its base. Tileset props anchor
   * at the base so `depth = y` sorts against the player's foot correctly.
   */
  originY: number;
  box?: PropBox;
}

export interface PortalArt {
  texture: string;
  originY: number;
  /** How far above the anchor the name plate sits. */
  labelLift: number;
}

/** Ground clutter a tileset ships with. Never collides. */
export interface DecalArt {
  texture: string;
  /** Relative pick weight when scattering. */
  weight: number;
}

export interface EnvKit {
  id: string;
  label: string;
  /**
   * Only the grounds this kit has art for. A tileset built around one biome will
   * not cover all three, and a zone on a ground the kit omits renders through the
   * placeholder instead (see `envKitFor`).
   */
  ground: Partial<Record<GroundKind, string>>;
  tree: PropArt;
  rock: PropArt;
  stone: PropArt;
  portal: PortalArt;
  decals: readonly DecalArt[];
}

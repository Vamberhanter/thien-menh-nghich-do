/**
 * What the map editor's palette offers, and nothing about how it draws it.
 *
 * Kept Phaser-free and framework-free on purpose: the React palette and the
 * Phaser-side `MapEditor` both need the same list, and a list that only one
 * of them could import would drift the moment somebody added an entry to
 * just one side. Text labels only, no thumbnails — the frames these name
 * already exist in a loaded atlas, but cropping a preview image for each
 * would mean parsing the atlas manifest a second time in React for a v1
 * palette; a label reads fine at 24 entries.
 */

export interface EditorPropDef {
  readonly id: string;
  readonly label: string;
  readonly texture: string;
  readonly frame: string;
  /** Omitted means decoration — walk-through, no collision box. */
  readonly solid?: { readonly width: number; readonly height: number };
}

export interface EditorCategory {
  readonly id: string;
  readonly label: string;
  readonly props: readonly EditorPropDef[];
}

/** Footprints reused across entries, same reasoning as `nguHanhSon.ts`'s `FOOT`. */
const FOOT = {
  tree: { width: 48, height: 32 },
  greatTree: { width: 70, height: 40 },
  rock: { width: 56, height: 36 },
  building: { width: 140, height: 64 },
  gate: { width: 40, height: 32 },
  small: { width: 32, height: 24 },
} as const;

export const EDITOR_CATEGORIES: readonly EditorCategory[] = [
  {
    id: 'flora',
    label: 'Cây cối',
    props: [
      { id: 'banyan', label: 'Cây đa cổ thụ', texture: 'nhs2-flora', frame: 'flora_1', solid: FOOT.greatTree },
      { id: 'cherry', label: 'Anh đào', texture: 'nhs2-flora', frame: 'flora_4', solid: FOOT.tree },
      { id: 'maple', label: 'Phong đỏ', texture: 'nhs2-flora', frame: 'flora_0', solid: FOOT.tree },
      { id: 'pine', label: 'Cây thông', texture: 'nhs2-flora', frame: 'flora_6', solid: FOOT.tree },
      { id: 'willow', label: 'Liễu rủ', texture: 'nhs2-flora', frame: 'flora_11', solid: FOOT.tree },
      { id: 'bamboo', label: 'Trúc', texture: 'nhs2-flora', frame: 'flora_7', solid: FOOT.tree },
      { id: 'bush', label: 'Bụi cây', texture: 'nhs2-flora', frame: 'flora_24' },
      { id: 'stump', label: 'Gốc cây', texture: 'nhs2-flora', frame: 'flora_49' },
    ],
  },
  {
    id: 'rock',
    label: 'Đá & vách',
    props: [
      { id: 'crag-a', label: 'Tảng đá', texture: 'nhs2-cliff2', frame: 'cliff2_58', solid: FOOT.rock },
      { id: 'crag-b', label: 'Cụm đá rêu', texture: 'nhs2-cliff2', frame: 'cliff2_62', solid: FOOT.rock },
      { id: 'rim', label: 'Khối vách đảo', texture: 'nhs2-cliff2', frame: 'cliff2_0', solid: { width: 110, height: 60 } },
      { id: 'fall', label: 'Vách có thác', texture: 'nhs2-cliff2', frame: 'cliff2_18', solid: { width: 110, height: 60 } },
      { id: 'cave', label: 'Cửa hang', texture: 'nhs2-cliff2', frame: 'cliff2_30', solid: FOOT.building },
    ],
  },
  {
    id: 'build',
    label: 'Kiến trúc',
    props: [
      { id: 'hall', label: 'Đại điện', texture: 'nhs2-cliff2', frame: 'cliff2_40', solid: FOOT.building },
      { id: 'stairs', label: 'Bậc thang đá', texture: 'nhs2-cliff2', frame: 'cliff2_29', solid: { width: 60, height: 32 } },
      { id: 'bridge', label: 'Cầu gỗ', texture: 'nhs2-lake', frame: 'lake_25', solid: { width: 24, height: 40 } },
      { id: 'well', label: 'Giếng nước', texture: 'nhs2-lake', frame: 'lake_13', solid: FOOT.small },
      { id: 'fountain', label: 'Đài phun nước', texture: 'nhs2-lake', frame: 'lake_15', solid: FOOT.small },
      { id: 'stall', label: 'Quầy hàng', texture: 'nhs2-cliff2', frame: 'cliff2_67', solid: FOOT.small },
    ],
  },
  {
    id: 'decor',
    label: 'Trang trí',
    props: [
      { id: 'lantern', label: 'Đèn đá', texture: 'nhs2-cliff2', frame: 'cliff2_51' },
      { id: 'signpost', label: 'Biển chỉ đường', texture: 'nhs2-cliff2', frame: 'cliff2_61' },
      { id: 'stele', label: 'Bia đá', texture: 'nhs2-flora', frame: 'flora_38' },
      { id: 'arch', label: 'Cổng đá cổ', texture: 'nhs2-flora', frame: 'flora_18' },
      { id: 'banner-red', label: 'Cờ đỏ', texture: 'nhs2-cliff2', frame: 'cliff2_45' },
      { id: 'banner-blue', label: 'Cờ xanh dương', texture: 'nhs2-cliff2', frame: 'cliff2_46' },
      { id: 'banner-green', label: 'Cờ xanh lá', texture: 'nhs2-cliff2', frame: 'cliff2_47' },
      { id: 'fence', label: 'Hàng rào', texture: 'nhs2-cliff2', frame: 'cliff2_56' },
    ],
  },
  {
    id: 'water',
    label: 'Nước',
    props: [
      { id: 'waterfall-big', label: 'Thác lớn', texture: 'nhs2-lake', frame: 'lake_0', solid: { width: 70, height: 40 } },
      { id: 'waterfall-small', label: 'Thác nhỏ', texture: 'nhs2-lake', frame: 'lake_5' },
      { id: 'lily', label: 'Hoa sen nước', texture: 'nhs2-lake', frame: 'lake_32' },
    ],
  },
];

/** Flat lookup, for `MapEditor` to resolve a palette id without re-scanning categories. */
export const PROP_BY_ID: ReadonlyMap<string, EditorPropDef> = new Map(
  EDITOR_CATEGORIES.flatMap((category) => category.props.map((prop) => [prop.id, prop] as const)),
);

/** The mob kinds a nest can spawn — mirrors `MobKind` in `zones/types.ts` without importing it, so this stays Phaser-free. */
export const MOB_KIND_OPTIONS = [
  'toad',
  'crab',
  'serpent',
  'drake',
  'golem',
  'troll',
  'blood-serpent',
  'fire-drake',
  'ember-golem',
] as const;

export const CHEST_TIER_OPTIONS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;

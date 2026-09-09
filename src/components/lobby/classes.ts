import type { NetCharacter } from '../../net/types';

export type Gender = 'male' | 'female';

/** `create` forges a new hero, `load` picks one that is already saved. */
export type CreationMode = 'create' | 'load';

/**
 * Relative pull, 1-5, for the five bars on the class-select screen.
 *
 * Flavor, not physics: `Progression.derive()` is where the real numbers a
 * kit spawns with live, and those scale with level — useless as a fixed bar
 * next to a class nobody has created yet. This is the same shape of rating
 * an ARPG's character-select screen has always used, sized by eye against
 * each kit's own skill list below.
 */
export interface ClassRatings {
  attack: number;
  defense: number;
  hp: number;
  speed: number;
  control: number;
}

/**
 * The five playable kits, dressed as gothic ARPG archetypes for the class
 * grid. `id` is the real kit the rest of the game keys off; `archetype` is
 * only the label on the tile.
 */
export interface ClassEntry {
  id: NetCharacter;
  archetype: string;
  name: string;
  sect: string;
  /** Canon gender, used as the default in the gender panel. */
  gender: Gender;
  portrait: string;
  /** One-line pitch shown while the class is selected. */
  blurb: string;
  ratings: ClassRatings;
  /** The four skills shown on the info panel — real names, off `SkillSystem`'s own tree, low tier to ultimate. */
  skills: readonly string[];
}

/** Grid order matches the 2x2 layout: warrior, rogue, sorcerer, necromancer. */
export const CLASSES: readonly ClassEntry[] = [
  {
    id: 'wukong',
    archetype: 'Chiến Binh',
    name: 'Tôn Ngộ Không',
    sect: 'Hoa Quả Sơn',
    gender: 'male',
    portrait: '/assets/ui/class-wukong.jpg',
    blurb: 'Côn pháp Hoa Quả Sơn — bốn tuyệt kỹ và Cân Đẩu Vân bay lên mây.',
    ratings: { attack: 4, defense: 3, hp: 4, speed: 3, control: 3 },
    skills: ['Cửu U Nộ Diễm', 'Cân Đẩu Vân', 'Hàng Ma Chân Lôi', 'Ma Nguyệt Trảm'],
  },
  {
    id: 'nhuyen',
    archetype: 'Du Hiệp',
    name: 'Như Yên',
    sect: 'Băng Cung',
    gender: 'female',
    portrait: '/assets/ui/class-nhuyen.jpg',
    blurb: 'Cung băng tầm xa — combo ba nhịp và dấu Hàn Băng.',
    ratings: { attack: 3, defense: 2, hp: 2, speed: 4, control: 4 },
    skills: ['Hàn Băng Chưởng', 'Sương Ảnh Bộ', 'Băng Liên', 'Thiên Lý Băng Phong'],
  },
  {
    id: 'miku',
    archetype: 'Pháp Sư',
    name: 'Miku',
    sect: 'Ảo Âm Các',
    gender: 'female',
    portrait: '/assets/ui/class-miku.jpg',
    blurb: 'Pháp sư âm phù — linh lực sâu, khống chế diện rộng.',
    ratings: { attack: 4, defense: 2, hp: 2, speed: 3, control: 5 },
    skills: ['Âm Nhận', 'Ảo Vũ Bộ', 'Thất Huyền Khúc', 'Vạn Âm Triều Tông'],
  },
  {
    id: 'kiemtien',
    archetype: 'Kiếm Tu',
    name: 'Kiếm Tiên',
    sect: 'Thanh Vân Kiếm Các',
    gender: 'female',
    portrait: '/assets/ui/class-lamuyen.jpg',
    blurb: 'Một kiếm tám hướng — bốn tuyệt kỹ và Ngự Kiếm Hành đạp kiếm mà bay.',
    ratings: { attack: 5, defense: 2, hp: 3, speed: 5, control: 3 },
    skills: ['Thanh Phong Trảm', 'Ngự Kiếm Hành', 'Vạn Kiếm Quy Tông', 'Huyết Kiếm Sát'],
  },
  {
    id: 'huyetlang',
    archetype: 'Tử Linh',
    name: 'Huyết Lang',
    sect: 'Tam Thủ Môn',
    gender: 'male',
    portrait: '/assets/ui/class-huyetlang.jpg',
    blurb: 'Trọng giáp huyết đao — máu dày, mỗi nhát đều nặng.',
    ratings: { attack: 3, defense: 5, hp: 5, speed: 2, control: 2 },
    skills: ['Huyết Trảm', 'Ma Ảnh Xung', 'Huyết Bạo', 'Ma Thần Giáng Thế'],
  },
];

/**
 * Teaser tiles only — no kit, no portrait, nothing to pick. `Lobby` has
 * exactly five real classes; the reference layout wanted eight tiles, and
 * the honest way to fill that without inventing four kits nobody can
 * actually play is a locked "more coming" card, same as every ARPG's roster
 * screen carries a few silhouettes for classes not yet shipped.
 */
export interface LockedClassEntry {
  name: string;
  role: string;
}

export const LOCKED_CLASSES: readonly LockedClassEntry[] = [
  { name: 'Thanh Phong', role: 'Tầm Xa' },
  { name: 'Huyết Ma', role: 'Cận Chiến' },
  { name: 'Linh Nguyệt', role: 'Pháp Thuật' },
  { name: 'Vô Ưu', role: 'Hỗ Trợ' },
];

const BY_ID = new Map(CLASSES.map((entry) => [entry.id, entry]));

export function classOf(id: NetCharacter): ClassEntry {
  return BY_ID.get(id) ?? CLASSES[0];
}

/**
 * Gender is cosmetic and has no column on `avatars`, so it lives in local
 * storage keyed by avatar id rather than pretending to be synced.
 */
const GENDER_KEY = 'tmnd.gender';

function readGenderMap(): Record<string, Gender> {
  try {
    const raw = localStorage.getItem(GENDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, Gender> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (value === 'male' || value === 'female') out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function readGender(avatarId: string, fallback: Gender): Gender {
  return readGenderMap()[avatarId] ?? fallback;
}

export function writeGender(avatarId: string, gender: Gender): void {
  const map = readGenderMap();
  map[avatarId] = gender;
  localStorage.setItem(GENDER_KEY, JSON.stringify(map));
}

export function clearGender(avatarId: string): void {
  const map = readGenderMap();
  if (!(avatarId in map)) return;
  delete map[avatarId];
  localStorage.setItem(GENDER_KEY, JSON.stringify(map));
}

import type { NetCharacter } from '../../net/types';

export type Gender = 'male' | 'female';

/**
 * The four playable kits, dressed as gothic ARPG archetypes for the class
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
}

/** Grid order matches the 2x2 layout: warrior, rogue, sorcerer, necromancer. */
export const CLASSES: readonly ClassEntry[] = [
  {
    id: 'lamuyen',
    archetype: 'Chiến Binh',
    name: 'Lâm Uyên',
    sect: 'Hư Vô Kiếm',
    gender: 'male',
    portrait: '/assets/ui/class-lamuyen.jpg',
    blurb: 'Kiếm khách tuyến đầu — sát thương ổn định, phòng ngự vững.',
  },
  {
    id: 'nhuyen',
    archetype: 'Du Hiệp',
    name: 'Như Yên',
    sect: 'Băng Cung',
    gender: 'female',
    portrait: '/assets/ui/class-nhuyen.jpg',
    blurb: 'Cung băng tầm xa — combo ba nhịp và dấu Hàn Băng.',
  },
  {
    id: 'miku',
    archetype: 'Pháp Sư',
    name: 'Miku',
    sect: 'Ảo Âm Các',
    gender: 'female',
    portrait: '/assets/ui/class-miku.jpg',
    blurb: 'Pháp sư âm phù — linh lực sâu, khống chế diện rộng.',
  },
  {
    id: 'huyetlang',
    archetype: 'Tử Linh',
    name: 'Huyết Lang',
    sect: 'Tam Thủ Môn',
    gender: 'male',
    portrait: '/assets/ui/class-huyetlang.jpg',
    blurb: 'Trọng giáp huyết đao — máu dày, mỗi nhát đều nặng.',
  },
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

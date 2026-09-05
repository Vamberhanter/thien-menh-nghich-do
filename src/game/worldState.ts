import type { ZoneId } from './zones';
import { DEFAULT_ZONE } from './zones';

let zone: ZoneId = DEFAULT_ZONE;

export function currentZone(): ZoneId {
  return zone;
}

export function setCurrentZone(next: ZoneId): void {
  zone = next;
}

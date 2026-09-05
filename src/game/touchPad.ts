/** Shared virtual stick — React writes, Phaser controllers read. */

export type PadAction =
  | 'attack'
  | 'skill0'
  | 'skill1'
  | 'skill2'
  | 'bag'
  | 'pick'
  | 'envArt';

interface PadMove {
  x: number;
  y: number;
  sprint: boolean;
}

const move: PadMove = { x: 0, y: 0, sprint: false };
const pending = new Set<PadAction>();

export function setPadMove(x: number, y: number, sprint: boolean): void {
  move.x = x;
  move.y = y;
  move.sprint = sprint;
}

export function resetPadMove(): void {
  move.x = 0;
  move.y = 0;
  move.sprint = false;
}

export function padMove(): PadMove {
  return move;
}

export function pressPad(action: PadAction): void {
  pending.add(action);
}

export function consumePad(action: PadAction): boolean {
  if (!pending.has(action)) return false;
  pending.delete(action);
  return true;
}

const FORCE_KEY = 'tmnd.touchpad';

/** Real phone / tablet: coarse pointer and no hover. Desktops stay off. */
export function isPhoneUi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function readTouchPadForced(): boolean | null {
  const value = localStorage.getItem(FORCE_KEY);
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

export function writeTouchPadForced(on: boolean): void {
  localStorage.setItem(FORCE_KEY, on ? '1' : '0');
}

export function prefersTouchUi(): boolean {
  return readTouchPadForced() ?? isPhoneUi();
}

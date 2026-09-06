/** Shared virtual stick — React writes, Phaser controllers read. */

export type PadAction =
  | 'attack'
  | 'skill0'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'bag'
  | 'pick'
  | 'envArt'
  | 'warp'
  | 'swap'
  | 'menu'
  | 'menuUp'
  | 'menuDown'
  | 'menuConfirm'
  | 'menuBack';

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
const MODE_KEY = 'tmnd.controlMode';

/** How the player wants to drive the character. */
export type ControlMode = 'keyboard' | 'touch' | 'gamepad';

export const CONTROL_MODE_LABEL: Readonly<Record<ControlMode, string>> = {
  keyboard: 'Bàn phím',
  touch: 'Nút màn hình',
  gamepad: 'Tay cầm + nút',
};

/** Real phone / tablet: coarse pointer and no hover. Desktops stay off. */
export function isPhoneUi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** Phone-sized portrait or short landscape viewport, including browser emulation. */
export function isCompactScreen(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(
    '(max-width: 720px), (max-width: 960px) and (max-height: 520px)',
  ).matches;
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

export function readControlMode(): ControlMode {
  const raw = localStorage.getItem(MODE_KEY);
  if (raw === 'keyboard' || raw === 'touch' || raw === 'gamepad') return raw;
  if (readTouchPadForced() === true) return 'touch';
  if (readTouchPadForced() === false) return 'keyboard';
  if (isCompactScreen() || isPhoneUi()) return 'touch';
  return 'keyboard';
}

export function controlModeShowsPad(mode: ControlMode): boolean {
  return mode === 'touch' || mode === 'gamepad';
}

export function writeControlMode(mode: ControlMode): void {
  localStorage.setItem(MODE_KEY, mode);
  writeTouchPadForced(controlModeShowsPad(mode));
}

/** keyboard → touch → gamepad → keyboard */
export function cycleControlMode(from = readControlMode()): ControlMode {
  const order: ControlMode[] = ['keyboard', 'touch', 'gamepad'];
  const next = order[(order.indexOf(from) + 1) % order.length] ?? 'keyboard';
  writeControlMode(next);
  return next;
}

export function prefersTouchUi(): boolean {
  return controlModeShowsPad(readControlMode());
}

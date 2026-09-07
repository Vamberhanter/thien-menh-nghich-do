/**
 * Browser Gamepad API → shared virtual pad ({@link touchPad}).
 *
 * Gameplay mapping (Xbox / DualShock via Chromium):
 *   Left stick / D-pad   move
 *   LT / stick click     sprint (Như Yên)
 *   A / Cross            attack
 *   X / Square           skill 0 (K)
 *   Y / Triangle         skill 1 (L)
 *   B / Circle           dash / skill 2 (Space)
 *   RB                   interact / pick (F)
 *   LB                   bag (I)
 *   Back / Select        swap at shrine (Q)
 *   Start                menu (Esc)
 *   RT                   warp (T)
 *
 * Pause-menu mapping (when {@link isSystemMenuOpen}):
 *   D-pad / stick        move highlight
 *   A                    confirm
 *   B / Start            close / back
 */
import { GameBus, GameEvent } from './events';
import { isSystemMenuOpen } from '../net/bind';
import {
  pressPad,
  resetPadMove,
  setPadMove,
  type PadAction,
} from './touchPad';

const STICK_DEADZONE = 0.22;
const NAV_STICK = 0.45;
const TRIGGER_DEADZONE = 0.35;
const SPRINT_STICK = 0.85;
const NAV_REPEAT_MS = 220;

/** Standard Gamepad button indices. */
const Btn = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Back: 8,
  Start: 9,
  L3: 10,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
} as const;

const GAMEPLAY_ACTIONS: ReadonlyArray<{ index: number; action: PadAction }> = [
  { index: Btn.A, action: 'attack' },
  { index: Btn.X, action: 'skill0' },
  { index: Btn.Y, action: 'skill1' },
  { index: Btn.B, action: 'skill2' },
  { index: Btn.L3, action: 'skill3' },
  { index: Btn.LB, action: 'bag' },
  { index: Btn.RB, action: 'pick' },
  { index: Btn.RT, action: 'warp' },
  { index: Btn.Back, action: 'swap' },
  { index: Btn.Start, action: 'menu' },
];

const prevDown = new Map<number, boolean>();
let owningMove = false;
let listening = false;
let announcedId: string | null = null;
let navDir = 0;
let navNextAt = 0;

function buttonDown(pad: Gamepad, index: number): boolean {
  const button = pad.buttons[index];
  if (!button) return false;
  if (typeof button === 'object') {
    return button.pressed || button.value > TRIGGER_DEADZONE;
  }
  return Boolean(button);
}

function axis(pad: Gamepad, index: number): number {
  const value = pad.axes[index] ?? 0;
  return Math.abs(value) < STICK_DEADZONE ? 0 : value;
}

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const list = navigator.getGamepads();
  for (let i = 0; i < list.length; i++) {
    const pad = list[i];
    if (pad?.connected) return pad;
  }
  return null;
}

function edge(pad: Gamepad, index: number): boolean {
  const down = buttonDown(pad, index);
  const was = prevDown.get(index) ?? false;
  prevDown.set(index, down);
  return down && !was;
}

function syncButton(pad: Gamepad, index: number): void {
  prevDown.set(index, buttonDown(pad, index));
}

function ensureListeners(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('gamepadconnected', (event) => {
    const pad = event.gamepad;
    if (!pad || announcedId === pad.id) return;
    announcedId = pad.id;
    GameBus.emit(GameEvent.Notice, `Tay cầm: ${pad.id.slice(0, 48)}`);
  });
  window.addEventListener('gamepaddisconnected', () => {
    if (owningMove) {
      resetPadMove();
      owningMove = false;
    }
    prevDown.clear();
    navDir = 0;
  });
}

function pollMenuNav(pad: Gamepad, now: number): void {
  let dir = 0;
  if (buttonDown(pad, Btn.Up) || axis(pad, 1) < -NAV_STICK) dir = -1;
  else if (buttonDown(pad, Btn.Down) || axis(pad, 1) > NAV_STICK) dir = 1;

  if (dir !== 0) {
    if (dir !== navDir || now >= navNextAt) {
      pressPad(dir < 0 ? 'menuUp' : 'menuDown');
      navNextAt = now + (dir === navDir ? NAV_REPEAT_MS : 0);
      if (dir !== navDir) navNextAt = now + NAV_REPEAT_MS;
      navDir = dir;
    }
  } else {
    navDir = 0;
  }

  if (edge(pad, Btn.A)) pressPad('menuConfirm');
  if (edge(pad, Btn.B)) pressPad('menuBack');
  if (edge(pad, Btn.Start)) pressPad('menu');
  // Absorb gameplay faces so they do not fire after the menu closes.
  for (const index of [Btn.X, Btn.Y, Btn.LB, Btn.RB, Btn.LT, Btn.RT, Btn.Back, Btn.L3]) {
    syncButton(pad, index);
  }
}

/**
 * Call once per frame from the world scene, before character controllers read
 * the virtual pad. When `gated`, movement is cleared and button edges are
 * absorbed so a lobby press does not fire on the first in-game frame.
 */
export function pollGamepad(options: { gated?: boolean } = {}): void {
  ensureListeners();
  const gated = Boolean(options.gated);
  const menuOpen = isSystemMenuOpen();
  const pad = firstPad();
  if (!pad) {
    if (owningMove) {
      resetPadMove();
      owningMove = false;
    }
    return;
  }

  if (menuOpen) {
    if (owningMove) {
      resetPadMove();
      owningMove = false;
    }
    if (!gated) pollMenuNav(pad, performance.now());
    else {
      for (let i = 0; i < pad.buttons.length; i++) syncButton(pad, i);
    }
    return;
  }

  navDir = 0;

  let x = axis(pad, 0);
  let y = axis(pad, 1);
  if (buttonDown(pad, Btn.Left)) x = -1;
  if (buttonDown(pad, Btn.Right)) x = 1;
  if (buttonDown(pad, Btn.Up)) y = -1;
  if (buttonDown(pad, Btn.Down)) y = 1;

  const sprint =
    buttonDown(pad, Btn.LT) ||
    buttonDown(pad, Btn.L3) ||
    Math.hypot(x, y) >= SPRINT_STICK;

  if (x !== 0 || y !== 0) {
    owningMove = true;
    if (!gated) setPadMove(x, y, sprint);
    else resetPadMove();
  } else if (owningMove) {
    owningMove = false;
    resetPadMove();
  }

  for (const { index, action } of GAMEPLAY_ACTIONS) {
    const down = buttonDown(pad, index);
    const was = prevDown.get(index) ?? false;
    prevDown.set(index, down);
    if (down && !was && !gated) pressPad(action);
  }
}

export function gamepadConnected(): boolean {
  return firstPad() !== null;
}

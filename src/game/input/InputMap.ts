import Phaser from 'phaser';
import { consumePad, padMove } from '../touchPad';
import type { Vector2Like } from '../types';
import { MOVE_BINDINGS, type Binding } from './bindings';

/**
 * The live keys behind the bindings.
 *
 * Split from `bindings.ts` because that table has to stay importable without a
 * browser — Phaser reads `window` the moment it loads, and the test that keeps
 * the table honest against the skill lists runs in node.
 *
 * A controller never names a key code and never repeats the "keyboard or
 * touch" test; it asks this in terms of the bindings.
 */
export class InputMap {
  private readonly keys = new Map<Binding, Phaser.Input.Keyboard.Key[]>();

  constructor(
    private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin,
    bindings: readonly Binding[],
  ) {
    for (const binding of bindings) {
      this.keys.set(
        binding,
        // `false` for `enableCapture`, so Phaser does not swallow the browser's
        // own handling: the game shares the page with a React HUD that has text
        // fields, and capturing here is what made typing "k" in chat throw a
        // technique across the room.
        binding.keys.map((name) => keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[name], false)),
      );
    }
  }

  /** Held down now. */
  down(binding: Binding): boolean {
    const group = this.keys.get(binding);
    if (!group) return false;
    for (const key of group) if (key.isDown) return true;
    return false;
  }

  /**
   * Pressed this frame, keyboard or touch.
   *
   * The touch read consumes — `consumePad` clears the press — so this is a
   * once-per-frame-per-binding question, which is how the controllers ask it.
   * Keyboard is tested first so a key press is never eaten by a stale tap.
   */
  pressed(binding: Binding): boolean {
    const group = this.keys.get(binding);
    if (group) {
      for (const key of group) if (Phaser.Input.Keyboard.JustDown(key)) return true;
    }
    return binding.pad ? consumePad(binding.pad) : false;
  }

  /** Heading from the keys, falling back to the touch stick. */
  axis(): Vector2Like {
    let x = 0;
    let y = 0;
    if (this.down(MOVE_BINDINGS.left)) x -= 1;
    if (this.down(MOVE_BINDINGS.right)) x += 1;
    if (this.down(MOVE_BINDINGS.up)) y -= 1;
    if (this.down(MOVE_BINDINGS.down)) y += 1;
    if (x !== 0 || y !== 0) return { x, y };
    const pad = padMove();
    return { x: pad.x, y: pad.y };
  }

  /** True while the run key or the stick's sprint zone is held. */
  sprinting(): boolean {
    return this.down(MOVE_BINDINGS.sprint) || padMove().sprint;
  }

  destroy(): void {
    for (const group of this.keys.values()) {
      for (const key of group) this.keyboard.removeKey(key, true);
    }
    this.keys.clear();
  }
}

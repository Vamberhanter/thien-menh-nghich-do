import type { Vector2Like } from '../../types';
import type { ZoneDef, ZoneId } from '../../zones';

/**
 * The one place the world changes underneath the player.
 *
 * There were three of them — walking into a portal, taking the travel altar,
 * and respawning in another zone — and each spelled out the same sandwich by
 * hand: set a flag, fade out, load, run some arrival work, fade in, clear the
 * flag, save. The flag is the part that matters and the part that was easiest
 * to get wrong: `crossing` is what stops `tickPortals` firing a second
 * transition while the screen is black, and any new caller that forgot to set
 * it would put the player through two fades at once.
 *
 * So a transition is a request, and everything that differs between the three
 * is a field on it. Nothing else in the game may call `loadZone`.
 */

export interface TransitionRequest {
  to: ZoneId;
  /**
   * Where to stand afterwards. Omitted means the destination decides — its
   * shrine, scattered, which is what a fresh arrival wants.
   */
  at?: Vector2Like;
  /**
   * Checked before the fade starts. Return a reason to refuse, or null to let
   * it through; the reason is shown to the player and nothing happens.
   */
  gate?: () => string | null;
  /** Runs on the new map while the screen is still black. */
  arrive?: (zone: ZoneDef) => void;
  /** Shown once the screen is back. Return null for silence. */
  notice?: (zone: ZoneDef) => string | null;
}

export interface TransitionHooks {
  fadeOut(): Promise<void>;
  fadeIn(): void;
  /** Builds the destination and returns it. */
  load(to: ZoneId, at?: Vector2Like): ZoneDef;
  /** Told why a transition was refused, or what happened after one. */
  say(message: string): void;
  /** Flushes the run, so a crash after a crossing does not lose the zone. */
  persist(): void;
}

export class TransitionManager {
  private busyFlag = false;

  constructor(private readonly hooks: TransitionHooks) {}

  /**
   * True while a crossing is in flight.
   *
   * Read by anything that could start another one: standing on a portal is
   * tested every frame, and the fade takes 280ms of frames.
   */
  get busy(): boolean {
    return this.busyFlag;
  }

  /** Resolves true if the world changed, false if it was refused or busy. */
  async go(request: TransitionRequest): Promise<boolean> {
    if (this.busyFlag) return false;

    const refusal = request.gate?.() ?? null;
    if (refusal) {
      this.hooks.say(refusal);
      return false;
    }

    this.busyFlag = true;
    try {
      await this.hooks.fadeOut();
      const zone = this.hooks.load(request.to, request.at);
      request.arrive?.(zone);
      this.hooks.fadeIn();
      const notice = request.notice?.(zone) ?? null;
      if (notice) this.hooks.say(notice);
      this.hooks.persist();
      return true;
    } finally {
      // In a finally because a throw inside `load` — a missing atlas, a bad
      // spawn — would otherwise leave the flag set and the player unable to
      // cross anywhere again for the rest of the session.
      this.busyFlag = false;
    }
  }
}

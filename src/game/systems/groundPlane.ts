import type Phaser from 'phaser';

/**
 * The one ratio that says how a head-on drawing lies down on the floor.
 *
 * Every effect in this game is painted face-on, because that is how a sprite
 * sheet is drawn. Spawned at an even scale, one that is *supposed* to be on the
 * ground — a scorch, a bloom, the burst where a hit lands — stands up instead,
 * a poster propped in the grass. Squashing it on Y is the whole fix: the camera
 * looks down at the world at an angle, so a circle on the floor reaches the eye
 * as an ellipse, and 0.55 is roughly the angle the tiles and the shadows already
 * imply.
 *
 * It lives on its own so the number is shared. Four characters and a boss each
 * spawn their own version of the same handful of ground effects, and the moment
 * two of them disagree about how flat the floor is, the floor stops reading as
 * one surface.
 *
 * Anything that genuinely stands up — a pillar of flame, a beam, the dragon —
 * must NOT go through here. Those are drawn rising out of the ground and are
 * correct at an even scale; flattening them would lay them down like felled
 * trees.
 */
export const GROUND_TILT = 0.55;

/** `scale` on X, tilted on Y: for a sprite meant to lie on the floor. */
export function layFlat<T extends Phaser.GameObjects.Components.Transform>(
  sprite: T,
  scale: number,
): T {
  sprite.setScale(scale, scale * GROUND_TILT);
  return sprite;
}

/** The Y a tween should run to, for an effect that grows while lying flat. */
export const flatY = (scale: number): number => scale * GROUND_TILT;

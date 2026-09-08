import Phaser from 'phaser';
import { PLAYER_TEXTURES, type PlayerId } from './playerHandle';
import {
  NHU_YEN_TEXTURE,
  NhuYenClip,
  createNhuYenAnimations,
} from '../animations/nhuYenAnimations';
import {
  HuyetLangClip,
  createHuyetLangAnimations,
} from '../animations/huyetLangAnimations';
import {
  MikuClip,
  createMikuAnimations,
} from '../animations/mikuAnimations';
import {
  WukongClip,
  WUKONG_ART_SCALE,
  castScaleOf as wukongCastScale,
  createWukongAnimations,
} from '../animations/wukongAnimations';
import {
  KIEMTIEN_ART_SCALE,
  KiemTienClip,
  clipScaleOf as kiemTienClipScale,
  createKiemTienAnimations,
} from '../animations/kiemtienAnimations';
import type { CharacterState, Direction, Vector2Like } from '../types';
import {
  BANG_PHACH_TRAM,
  BANG_TINH_TRAN,
  HUYET_DIEM_TRAM,
  HUYET_KIEM_SAT,
  LAC_ANH_KIEM_QUANG,
  TINH_MANG_TRAM,
  MA_NGUYET_TRAM,
  HANG_MA_CHAN_LOI,
  PHAN_THIEN_MA_DIEM,
  VAN_KIEM_QUY_TONG,
} from '../systems/CombatSystem';
import { GroundShadow } from '../systems/GroundShadow';
import type { NetAction, NetPose } from '../../net/types';

const LABEL_LIFT = 92;

/**
 * How high the replica is allowed to be drawn, as a guard on a number that
 * arrived over the wire. Wukong's cloud is the tallest thing any kit does at
 * 44px, and the dip Kiếm Tiên takes before she rises is the deepest at -5.
 */
const LIFT_MAX = 60;
const LIFT_MIN = -12;

/**
 * Above the ground plane a flying character is not in the depth ordering at
 * all — the same band the local player uses, for the same reason.
 */
const FLY_DEPTH_BAND = 4000;

/**
 * Each kit's shadow, copied from the entity that owns it.
 *
 * A replica needs one or the height it is now being told about cannot be seen:
 * in this view nothing distinguishes higher up from further north, and the gap
 * between a sprite and its own shadow *is* the height. The local characters
 * have had these all along; their replicas had nothing on the floor at all.
 */
const SHADOW: Record<PlayerId, { size?: { w: number; h: number }; lift: number }> = {
  nhuyen: { size: { w: 38, h: 15 }, lift: 0 },
  huyetlang: { size: { w: 46, h: 18 }, lift: 0 },
  miku: { size: { w: 38, h: 15 }, lift: 0 },
  wukong: { lift: 44 },
  kiemtien: { lift: 34 },
};

const LABEL_COLOR: Record<PlayerId, string> = {
  nhuyen: '#9fe8ff',
  huyetlang: '#ff7a4a',
  miku: '#c9a0ff',
  wukong: '#c98aff',
  kiemtien: '#8fd0ff',
};

/**
 * A visual replica of another player. No input, no combat system, no GameBus
 * — it only plays the clips the network tells it to, and slides between the
 * poses it is given.
 */
export class RemoteAvatar {
  readonly id: string;
  hp = 100;
  private name: string;
  private character: PlayerId;
  private sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private facing: Direction = 'down';
  /**
   * Where the swing is *aimed*, which is a finer thing than which way the
   * replica faces.
   *
   * Kiếm Tiên and Tôn Ngộ Không have all eight swings drawn, and the local
   * player picks between them off this vector. It has been in every pose packet
   * as `ax`/`ay` since the beginning and the replica threw it away, so their
   * diagonal cuts played as one of four on everybody else's screen.
   */
  private aim: Vector2Like = { x: 0, y: 1 };
  private state: CharacterState = 'idle';
  private atk = 0;
  private skillName = '';
  private startX: number;
  private startY: number;
  private destX: number;
  private destY: number;
  private lerpT = 1;
  private playedKey = '';
  private shadow: GroundShadow;
  /** Drawn height, eased between poses the way x and y are. */
  private lift = 0;
  private startLift = 0;
  private destLift = 0;

  constructor(private readonly scene: Phaser.Scene, pose: NetPose, name: string) {
    this.id = pose.id;
    this.name = name;
    this.character = pose.character;
    this.aim = { x: pose.ax, y: pose.ay };
    this.startX = pose.x;
    this.startY = pose.y;
    this.destX = pose.x;
    this.destY = pose.y;
    this.lift = Phaser.Math.Clamp(pose.lift ?? 0, LIFT_MIN, LIFT_MAX);
    this.startLift = this.lift;
    this.destLift = this.lift;

    createNhuYenAnimations(scene);
    createHuyetLangAnimations(scene);
    createMikuAnimations(scene);
    createWukongAnimations(scene);
    createKiemTienAnimations(scene);

    this.sprite = this.makeSprite(pose.character, pose.x, pose.y);
    this.shadow = makeShadow(scene, pose.character);
    this.label = scene.add
      .text(pose.x, pose.y - LABEL_LIFT, name, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: LABEL_COLOR[pose.character] ?? '#c8d6ff',
        stroke: '#05070d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(pose.y + 1);

    this.applyVisual(pose);
  }

  get spriteRef(): Phaser.GameObjects.Sprite {
    return this.sprite;
  }

  rename(name: string): void {
    if (this.name === name) return;
    this.name = name;
    this.label.setText(name);
  }

  foot(): { x: number; y: number } {
    return { x: this.displayX(), y: this.displayY() };
  }

  applyPose(pose: NetPose): void {
    this.hp = pose.hp;
    this.startX = this.displayX();
    this.startY = this.displayY();
    this.destX = pose.x;
    this.destY = pose.y;
    this.startLift = this.lift;
    this.destLift = Phaser.Math.Clamp(pose.lift ?? 0, LIFT_MIN, LIFT_MAX);
    this.lerpT = 0;

    if (pose.character !== this.character) {
      this.rebuild(pose.character);
    }
    this.applyVisual(pose);
  }

  playAction(action: NetAction): void {
    if (action.kind === 'skill' && action.skill) {
      this.skillName = action.skill.name;
      this.facing = action.skill.direction;
      // The action is published on the frame of the cast; the pose is up to a
      // packet behind it, so this is the fresher heading of the two.
      if (action.skill.aim) this.aim = action.skill.aim;
      this.state = 'skill';
      this.playClip(this.clipFor('skill'), true);
      return;
    }
    if (action.kind === 'attack' && action.attack) {
      this.facing = action.attack.direction;
      if (action.attack.aim) this.aim = action.attack.aim;
      this.state = 'attack';
      if ('step' in action.attack) {
        this.atk = (action.attack as { step: number }).step;
      }
      this.playClip(this.clipFor('attack'), true);
      return;
    }
    if (action.kind === 'dash' && action.dash) {
      this.facing = action.dash.direction;
      this.state = 'dash';
      this.playClip(this.clipFor('dash'), true);
    }
  }

  update(delta: number): void {
    this.lerpT = Math.min(1, this.lerpT + delta / 90);
    const x = Phaser.Math.Linear(this.startX, this.destX, this.lerpT);
    const y = Phaser.Math.Linear(this.startY, this.destY, this.lerpT);
    this.lift = Phaser.Math.Linear(this.startLift, this.destLift, this.lerpT);
    this.setFoot(x, y);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.shadow.destroy();
  }

  /* -------------------------------------------------------------- internals */

  private applyVisual(pose: NetPose): void {
    this.facing = pose.facing;
    // Zero would be a peer with no heading at all; keep the last real one.
    if (pose.ax !== 0 || pose.ay !== 0) this.aim = { x: pose.ax, y: pose.ay };
    if (pose.atk !== undefined) this.atk = pose.atk;
    const changed = pose.state !== this.state;
    this.state = pose.state;
    this.playClip(this.clipFor(pose.state), changed && isOneShot(pose.state));
  }

  private clipFor(state: CharacterState): { key: string; flip: boolean } {
    if (this.character === 'huyetlang') {
      return huyetLangClip(state, this.facing, this.atk, this.skillName);
    }
    if (this.character === 'miku') {
      return mikuClip(state, this.facing, this.atk, this.skillName);
    }
    if (this.character === 'wukong') {
      return wukongClip(state, this.facing, this.atk, this.skillName, this.aim);
    }
    if (this.character === 'kiemtien') {
      return kiemTienClip(state, this.facing, this.skillName, this.aim);
    }
    return nhuYenClip(state, this.facing, this.atk, this.skillName);
  }

  private playClip(clip: { key: string; flip: boolean }, force: boolean): void {
    this.sprite.setFlipX(clip.flip);
    // Wukong's techniques are drawn larger than he is, by a factor that differs
    // per technique (CAST_SCALE in wukongAnimations), so somebody else casting
    // one has to read the same size on your screen as it does on theirs.
    const cast = this.character === 'wukong' && this.state === 'skill';
    // Kiếm Tiên's sheets were each drawn at their own size, so her replica has
    // to apply the same per-clip correction the local one does or she would
    // shrink on somebody else's screen exactly where she used to shrink here.
    const kiemTien = this.character === 'kiemtien' ? kiemTienClipScale(clip) : 1;
    // Divided by the art scale for the same reason the local one is: his atlas is
    // baked larger than the world. The other three kits are still 1:1, so they
    // divide by 1 and nothing changes for them.
    const art =
      this.character === 'wukong'
        ? WUKONG_ART_SCALE
        : this.character === 'kiemtien'
          ? KIEMTIEN_ART_SCALE
          : 1;
    this.sprite.setScale((cast ? wukongCastScale(clip) : kiemTien) / art);
    if (!force && this.playedKey === clip.key) return;
    this.playedKey = clip.key;
    if (this.scene.anims.exists(clip.key)) {
      this.sprite.play(clip.key, !force);
    }
  }

  private rebuild(character: PlayerId): void {
    const { x, y } = { x: this.displayX(), y: this.displayY() };
    this.sprite.destroy();
    this.shadow.destroy();
    this.character = character;
    this.playedKey = '';
    this.sprite = this.makeSprite(character, x, y);
    this.shadow = makeShadow(this.scene, character);
    this.label.setColor(LABEL_COLOR[character] ?? '#c8d6ff');
  }

  // Every character carries a feet pivot on every atlas frame, so the
  // sprite's own position already is the foot point.
  private makeSprite(character: PlayerId, x: number, y: number): Phaser.GameObjects.Sprite {
    const texture = PLAYER_TEXTURES[character] ?? NHU_YEN_TEXTURE;
    const sprite = this.scene.add.sprite(x, y, texture, 'idle_down_0');
    sprite.setDepth(y);
    return sprite;
  }

  private setFoot(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    // Above everything when off the ground, in the ordinary ordering when not.
    this.sprite.setDepth(y + (this.lift > 0 ? FLY_DEPTH_BAND : 0));
    this.label.setPosition(x, y - LABEL_LIFT - Math.max(0, this.lift));
    this.label.setDepth(y + (this.lift > 0 ? FLY_DEPTH_BAND : 0) + 1);
    // Clamped at the floor: a shadow does not grow when its owner crouches.
    this.shadow.sync(x, y, Math.max(0, this.lift));
    this.applyLift();
  }

  /**
   * Draws the replica `lift` px higher without moving it.
   *
   * Into the origin, not into `y`, exactly as the local characters do it: `y`
   * is the tile the player is over, and moving it would take their name plate,
   * their shadow and their place in the depth order into the air with them.
   * Re-applied every frame because each atlas frame carries its own baked pivot
   * that Phaser puts back as the animation runs.
   */
  private applyLift(): void {
    const frame = this.sprite.frame;
    const baseX = frame.customPivot ? frame.pivotX : 0.5;
    const baseY = frame.customPivot ? frame.pivotY : 0.5;
    if (this.lift === 0) {
      this.sprite.setOrigin(baseX, baseY);
      return;
    }
    // Against the drawn size rather than the texture size, because the scale in
    // force is never 1 for the kits that fly — see the local applyFlyLift.
    const height = this.sprite.height * this.sprite.scaleY;
    this.sprite.setOrigin(baseX, baseY + (height ? this.lift / height : 0));
  }

  private displayX(): number {
    return this.sprite.x;
  }

  private displayY(): number {
    return this.sprite.y;
  }
}

function makeShadow(scene: Phaser.Scene, character: PlayerId): GroundShadow {
  const spec = SHADOW[character] ?? SHADOW.nhuyen;
  return new GroundShadow(scene, spec);
}

function isOneShot(state: CharacterState): boolean {
  return state === 'attack' || state === 'skill' || state === 'dash' || state === 'hurt' || state === 'dead';
}

function nhuYenClip(
  state: CharacterState,
  facing: Direction,
  atk: number,
  skillName: string,
): { key: string; flip: boolean } {
  switch (state) {
    case 'walk':
      return NhuYenClip.move(facing, false);
    case 'run':
    case 'dash':
      return NhuYenClip.move(facing, true);
    case 'attack':
      return NhuYenClip.attack(facing, atk);
    case 'skill':
      return skillName === BANG_TINH_TRAN.name || skillName === ''
        ? NhuYenClip.channel(facing)
        : skillName === BANG_PHACH_TRAM.name
          ? NhuYenClip.qiSlash(facing)
          : NhuYenClip.dash(facing);
    case 'hurt':
      return NhuYenClip.hurt();
    case 'dead':
      return NhuYenClip.death();
    default:
      return NhuYenClip.idle(facing);
  }
}

function huyetLangClip(
  state: CharacterState,
  facing: Direction,
  atk: number,
  skillName: string,
): { key: string; flip: boolean } {
  switch (state) {
    case 'walk':
    case 'run':
      return HuyetLangClip.move(facing);
    case 'dash':
      return HuyetLangClip.dash(facing);
    case 'attack':
      return HuyetLangClip.attack(facing, atk);
    case 'skill':
      // an unnamed skill is the roar, whose charge is the safest thing to show
      return skillName === HUYET_DIEM_TRAM.name
        ? HuyetLangClip.magmaSlash(facing)
        : HuyetLangClip.roar(facing);
    case 'hurt':
      return HuyetLangClip.hurt();
    case 'dead':
      return HuyetLangClip.death();
    default:
      return HuyetLangClip.idle(facing);
  }
}

function mikuClip(
  state: CharacterState,
  facing: Direction,
  atk: number,
  skillName: string,
): { key: string; flip: boolean } {
  switch (state) {
    case 'walk':
    case 'run':
      return MikuClip.move(facing);
    case 'dash':
      return MikuClip.dash(facing);
    case 'attack':
      return MikuClip.attack(facing, atk);
    case 'skill':
      return skillName === TINH_MANG_TRAM.name
        ? MikuClip.starSlash(facing)
        : MikuClip.starArray(facing);
    case 'hurt':
      return MikuClip.hurt();
    case 'dead':
      return MikuClip.death();
    default:
      return MikuClip.idle(facing);
  }
}

/**
 * Tôn Ngộ Không has real art for every state a replica can be in, including a
 * dedicated run and a cloud dash, so unlike the others nothing here has to
 * borrow a neighbouring clip. The skill name picks between his three
 * techniques; an unnamed one is Cửu U Nộ Diễm, whose qi gathers from nothing
 * and so is the safest thing to show while the packet naming it is in flight.
 */
/**
 * Kiếm Tiên's replica.
 *
 * No `atk` argument, unlike the other four: her attack is one drawn cut rather
 * than a chain, so there is no step to pick between. The aim is not carried
 * over the wire either, so a remote swing plays the cardinal of the eight
 * headings that matches her facing — the diagonals are a local nicety.
 */
function kiemTienClip(
  state: CharacterState,
  facing: Direction,
  skillName: string,
  aim: Vector2Like,
): { key: string; flip: boolean } {
  switch (state) {
    case 'walk':
    case 'run':
      return KiemTienClip.move(facing);
    case 'dash':
      return KiemTienClip.fly(facing);
    case 'attack':
      return KiemTienClip.attack(facing, aim);
    case 'skill':
      return skillName === HUYET_KIEM_SAT.name
        ? KiemTienClip.skill4(facing)
        : skillName === VAN_KIEM_QUY_TONG.name
          ? KiemTienClip.skill3(facing)
          : skillName === LAC_ANH_KIEM_QUANG.name
            ? KiemTienClip.skill2(facing)
            : KiemTienClip.skill1(facing);
    case 'hurt':
      return KiemTienClip.hurt();
    case 'dead':
      return KiemTienClip.death();
    default:
      return KiemTienClip.idle(facing);
  }
}

function wukongClip(
  state: CharacterState,
  facing: Direction,
  atk: number,
  skillName: string,
  aim: Vector2Like,
): { key: string; flip: boolean } {
  switch (state) {
    case 'walk':
      return WukongClip.move(facing, false);
    case 'run':
      return WukongClip.move(facing, true);
    case 'dash':
      return WukongClip.dash(facing);
    case 'attack':
      return WukongClip.attack(facing, atk, aim);
    case 'skill':
      return skillName === MA_NGUYET_TRAM.name
        ? WukongClip.dragon(facing, aim)
        : skillName === HANG_MA_CHAN_LOI.name
          ? WukongClip.lance(facing, aim)
          : skillName === PHAN_THIEN_MA_DIEM.name
            ? WukongClip.wrath(facing)
            : WukongClip.nova(facing, aim);
    case 'hurt':
      return WukongClip.hurt();
    case 'dead':
      return WukongClip.death();
    default:
      return WukongClip.idle(facing);
  }
}

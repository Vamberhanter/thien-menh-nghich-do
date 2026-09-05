import Phaser from 'phaser';
import { FEET_OFFSET_Y } from './LinYuan';
import type { PlayerId } from './playerHandle';
import {
  LIN_YUAN_TEXTURE,
  LinYuanAnim,
  createLinYuanAnimations,
} from '../animations/linYuanAnimations';
import {
  NHU_YEN_TEXTURE,
  NhuYenClip,
  createNhuYenAnimations,
} from '../animations/nhuYenAnimations';
import {
  HUYET_LANG_TEXTURE,
  HuyetLangClip,
  createHuyetLangAnimations,
} from '../animations/huyetLangAnimations';
import type { CharacterState, Direction } from '../types';
import { BANG_PHACH_TRAM, BANG_TINH_TRAN, HUYET_DIEM_TRAM } from '../systems/CombatSystem';
import type { NetAction, NetPose } from '../../net/types';

const LABEL_LIFT = 92;

const LABEL_COLOR: Record<PlayerId, string> = {
  nhuyen: '#9fe8ff',
  lamuyen: '#c8d6ff',
  huyetlang: '#ff7a4a',
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
  private state: CharacterState = 'idle';
  private atk = 0;
  private skillName = '';
  private startX: number;
  private startY: number;
  private destX: number;
  private destY: number;
  private lerpT = 1;
  private playedKey = '';

  constructor(private readonly scene: Phaser.Scene, pose: NetPose, name: string) {
    this.id = pose.id;
    this.name = name;
    this.character = pose.character;
    this.startX = pose.x;
    this.startY = pose.y;
    this.destX = pose.x;
    this.destY = pose.y;

    createLinYuanAnimations(scene);
    createNhuYenAnimations(scene);
    createHuyetLangAnimations(scene);

    this.sprite = this.makeSprite(pose.character, pose.x, pose.y);
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
      this.state = 'skill';
      this.playClip(this.clipFor('skill'), true);
      return;
    }
    if (action.kind === 'attack' && action.attack) {
      this.facing = action.attack.direction;
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
    this.setFoot(x, y);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }

  /* -------------------------------------------------------------- internals */

  private applyVisual(pose: NetPose): void {
    this.facing = pose.facing;
    if (pose.atk !== undefined) this.atk = pose.atk;
    const changed = pose.state !== this.state;
    this.state = pose.state;
    this.playClip(this.clipFor(pose.state), changed && isOneShot(pose.state));
  }

  private clipFor(state: CharacterState): { key: string; flip: boolean } {
    if (this.character === 'nhuyen') {
      return nhuYenClip(state, this.facing, this.atk, this.skillName);
    }
    if (this.character === 'huyetlang') {
      return huyetLangClip(state, this.facing, this.atk, this.skillName);
    }
    return { key: linYuanKey(state, this.facing), flip: false };
  }

  private playClip(clip: { key: string; flip: boolean }, force: boolean): void {
    this.sprite.setFlipX(clip.flip);
    if (!force && this.playedKey === clip.key) return;
    this.playedKey = clip.key;
    if (this.scene.anims.exists(clip.key)) {
      this.sprite.play(clip.key, !force);
    }
  }

  private rebuild(character: PlayerId): void {
    const { x, y } = { x: this.displayX(), y: this.displayY() };
    this.sprite.destroy();
    this.character = character;
    this.playedKey = '';
    this.sprite = this.makeSprite(character, x, y);
    this.label.setColor(LABEL_COLOR[character] ?? '#c8d6ff');
  }

  private makeSprite(character: PlayerId, x: number, y: number): Phaser.GameObjects.Sprite {
    if (character === 'nhuyen') {
      const sprite = this.scene.add.sprite(x, y, NHU_YEN_TEXTURE, 'idle_down_0');
      sprite.setDepth(y);
      return sprite;
    }
    // Như Yên and Huyết Lang both carry a feet pivot on every atlas frame, so
    // their sprite position is the foot point already
    if (character === 'huyetlang') {
      const sprite = this.scene.add.sprite(x, y, HUYET_LANG_TEXTURE, 'idle_down_0');
      sprite.setDepth(y);
      return sprite;
    }
    const sprite = this.scene.add.sprite(x, y - FEET_OFFSET_Y, LIN_YUAN_TEXTURE, 'idle_down_0');
    sprite.setOrigin(0.5, 0.5);
    sprite.setDepth(y);
    return sprite;
  }

  private setFoot(x: number, y: number): void {
    if (this.character === 'nhuyen' || this.character === 'huyetlang') {
      this.sprite.setPosition(x, y);
    } else {
      this.sprite.setPosition(x, y - FEET_OFFSET_Y);
    }
    this.sprite.setDepth(y);
    this.label.setPosition(x, y - LABEL_LIFT);
    this.label.setDepth(y + 1);
  }

  private displayX(): number {
    return this.sprite.x;
  }

  private displayY(): number {
    if (this.character === 'nhuyen' || this.character === 'huyetlang') return this.sprite.y;
    return this.sprite.y + FEET_OFFSET_Y;
  }
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

function linYuanKey(state: CharacterState, facing: Direction): string {
  switch (state) {
    case 'walk':
    case 'run':
    case 'dash':
      return LinYuanAnim.walk(facing);
    case 'attack':
      return LinYuanAnim.attack(facing);
    case 'skill':
      return LinYuanAnim.skill(facing);
    case 'hurt':
      return LinYuanAnim.hurt;
    case 'dead':
      return LinYuanAnim.death;
    default:
      return LinYuanAnim.idle(facing);
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

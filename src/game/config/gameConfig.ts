import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { TestScene } from '../scenes/TestScene';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,

    width: GAME_WIDTH,
    height: GAME_HEIGHT,

    backgroundColor: '#0d1220',

    pixelArt: true,

    render: {
      antialias: false,
      roundPixels: true,
    },

    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },

    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },

    scene: [BootScene, TestScene],
  };
}

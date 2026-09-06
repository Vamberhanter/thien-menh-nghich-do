import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { WorldScene } from '../WorldScene';

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
      // Without this the WebGL buffer is empty by the time anything outside the
      // render loop reads it, so dev screenshots come out blank.
      preserveDrawingBuffer: import.meta.env.DEV,
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

    scene: [BootScene, WorldScene],
  };
}

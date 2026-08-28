import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/config/gameConfig';

/** Owns the Phaser game instance and its lifecycle. */
export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    const game = new Phaser.Game(createGameConfig(containerRef.current));
    gameRef.current = game;
    if (import.meta.env.DEV) {
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    }
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="game-canvas" ref={containerRef} />;
}

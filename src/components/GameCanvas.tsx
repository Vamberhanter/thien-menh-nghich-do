import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/config/gameConfig';
import { attachResponsiveCanvas } from '../game/config/ResponsiveCanvas';

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
    // The game runs in scale mode `NONE` (see `gameConfig`) precisely so this
    // can own resizing — see `ResponsiveCanvas`'s own header for why.
    const detach = attachResponsiveCanvas(game, containerRef.current);
    return () => {
      detach();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="game-canvas" ref={containerRef} />;
}

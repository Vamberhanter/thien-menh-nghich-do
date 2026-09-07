import { useEffect, useState } from 'react';
import { GameBus, GameEvent } from '../game/events';
import { gamepadConnected } from '../game/gamepad';
import { readControlMode } from '../game/touchPad';

/** Button map, in the order it reads on the pad rather than by key binding. */
const HINTS: ReadonlyArray<{ button: string; label: string }> = [
  { button: 'A', label: 'Đánh' },
  { button: 'X', label: 'Chiêu 1' },
  { button: 'Y', label: 'Chiêu 2' },
  { button: 'B', label: 'Lướt' },
  { button: 'LB', label: 'Túi' },
  { button: 'RB', label: 'Lấy' },
  { button: 'RT', label: 'Dịch chuyển' },
  { button: 'Start', label: 'Menu' },
];

/**
 * The pad legend, shown only in gamepad mode with a pad actually plugged in.
 *
 * `gamepadconnected` does not fire until the first button press, so the mode
 * alone is not enough to know there is a pad — the poll below covers a pad that
 * was already attached when the page loaded.
 */
export function GamepadHints() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sync = () => setShow(readControlMode() === 'gamepad' && gamepadConnected());
    const onMode = () => sync();

    sync();
    const timer = window.setInterval(sync, 1000);
    GameBus.on(GameEvent.ControlModeChanged, onMode);
    window.addEventListener('gamepadconnected', sync);
    window.addEventListener('gamepaddisconnected', sync);

    return () => {
      window.clearInterval(timer);
      GameBus.off(GameEvent.ControlModeChanged, onMode);
      window.removeEventListener('gamepadconnected', sync);
      window.removeEventListener('gamepaddisconnected', sync);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="gamepad-hints" aria-hidden="true">
      {HINTS.map((hint) => (
        <span className="gamepad-hint" key={hint.button}>
          <b>{hint.button}</b>
          {hint.label}
        </span>
      ))}
    </div>
  );
}

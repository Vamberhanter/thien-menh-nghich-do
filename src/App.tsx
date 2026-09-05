import { GameCanvas } from './components/GameCanvas';
import { GameUI } from './components/GameUI';
import { InventoryUI } from './components/InventoryUI';
import { Lobby } from './components/Lobby';
import { TouchPad } from './components/TouchPad';
import { WarpUI } from './components/WarpUI';

export default function App() {
  return (
    <div className="app">
      <div className="stage">
        <GameCanvas />
        <GameUI />
        <TouchPad />
        <InventoryUI />
        <WarpUI />
        <Lobby />
      </div>
    </div>
  );
}

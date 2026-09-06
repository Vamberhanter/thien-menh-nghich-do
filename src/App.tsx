import { GameCanvas } from './components/GameCanvas';
import { GameUI } from './components/GameUI';
import { InventoryUI } from './components/InventoryUI';
import { Lobby } from './components/Lobby';
import { TouchPad } from './components/TouchPad';
import { WarpUI } from './components/WarpUI';
import { CharacterPanel } from './components/CharacterPanel';
import { QuestJournal } from './components/QuestJournal';
import { ShopUI } from './components/ShopUI';
import { FarmUI } from './components/FarmUI';
import { StorageUI } from './components/StorageUI';
import { AlchemyUI } from './components/AlchemyUI';

export default function App() {
  return (
    <div className="app">
      <div className="stage">
        <GameCanvas />
        <GameUI />
        <TouchPad />
        <InventoryUI />
        <WarpUI />
        <CharacterPanel />
        <QuestJournal />
        <ShopUI />
        <FarmUI />
        <StorageUI />
        <AlchemyUI />
        <Lobby />
      </div>
    </div>
  );
}

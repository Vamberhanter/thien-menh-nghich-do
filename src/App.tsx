import { GameCanvas } from './components/GameCanvas';
import { GameUI } from './components/GameUI';

export default function App() {
  return (
    <div className="app">
      <div className="stage">
        <GameCanvas />
        <GameUI />
      </div>
    </div>
  );
}

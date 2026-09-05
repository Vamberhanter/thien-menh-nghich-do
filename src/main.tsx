import ReactDOM from 'react-dom/client';
import App from './App';
import { startAuth } from './net/auth';
import './index.css';

startAuth();

// No StrictMode: its double mount would create, destroy and recreate the
// Phaser game on every load, which aborts the asset loader mid-flight.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

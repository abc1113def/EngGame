import { createRoot } from 'react-dom/client';
import { sim } from './sim/sim';
import { App } from './ui/App';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<App />);

// для отладки и автотестов в браузере
(window as unknown as { __sim: typeof sim }).__sim = sim;

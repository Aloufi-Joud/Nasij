import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import { C } from '../../../src/theme';
import App from './App';
import Login from './Login';
import './styles.css';

// One source of colours: the app's theme becomes CSS variables (--primary, --bg, ...)
for (const [k, v] of Object.entries(C)) document.documentElement.style.setProperty(`--${k}`, v);

createRoot(document.getElementById('root')!).render(
  <Login>
    <App />
  </Login>,
);

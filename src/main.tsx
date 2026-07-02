import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Ask the browser to exempt this origin's storage from eviction — localStorage
// is the primary working copy, so best-effort eviction (e.g. under disk
// pressure) must not silently take it. Browsers may ignore this; that's fine.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

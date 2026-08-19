import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initDesktopMirror } from './state/desktop';
import './styles.css';

// Ask the browser to exempt this origin's storage from eviction — localStorage
// is the primary working copy, so best-effort eviction (e.g. under disk
// pressure) must not silently take it. Browsers may ignore this; that's fine.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist();
}

// Desktop build: keep a durable copy of the den on disk (no-op on the web).
void initDesktopMirror();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

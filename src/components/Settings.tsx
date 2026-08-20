/**
 * Settings — themes & appearance, soundscape, data export/import, onboarding
 * replay, and the reset. Everything saves instantly to this device.
 */

import { useRef, useState } from 'react';
import { SOUNDSCAPE_IDS, SOUNDSCAPE_LABELS, type Appearance, type State, type ThemeId } from '../core';
import { store } from '../state/store';
import { DesktopUpdate } from './DesktopUpdate';
import { useArmedConfirm } from './useArmedConfirm';

export interface SettingsProps {
  state: State;
}

const THEMES: { id: ThemeId; label: string; needs?: keyof State['perks'] }[] = [
  { id: 'cozy', label: 'Cozy' },
  { id: 'midnight', label: 'Midnight', needs: 'themeMidnight' },
  { id: 'sunrise', label: 'Sunrise', needs: 'themeSunrise' },
];

const APPEARANCES: { id: Appearance; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export function Settings({ state }: SettingsProps) {
  const { settings, perks } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetArmed, fireReset] = useArmedConfirm();

  function downloadBackup() {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'focus-den-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Backup downloaded ✓');
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = store.importJSON(String(reader.result));
      setMsg(ok ? 'Den restored ✓' : 'Import failed — not a valid Focus Den backup.');
    };
    reader.onerror = () => setMsg('Could not read that file.');
    reader.readAsText(file);
  }

  function resetAll() {
    fireReset(() => {
      store.resetAll();
      setMsg('Everything reset — fresh den.');
    });
  }

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="card">
        <div className="card-head"><h2>Theme</h2></div>
        <div className="setting-row">
          <span className="equip-label">Color theme</span>
          <div className="equip-options">
            {THEMES.map((t) => {
              const locked = t.needs ? !perks[t.needs] : false;
              const on = settings.theme === t.id;
              return (
                <button
                  key={t.id}
                  className={`btn btn-sm chip-toggle ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  disabled={locked}
                  title={locked ? 'Unlock in the shop' : undefined}
                  onClick={() => store.setTheme(t.id)}
                >
                  {t.label}{locked ? ' 🔒' : ''}
                </button>
              );
            })}
          </div>
        </div>
        <div className="setting-row">
          <span className="equip-label">Appearance (Cozy)</span>
          <div className="equip-options">
            {APPEARANCES.map((a) => (
              <button
                key={a.id}
                className={`btn btn-sm chip-toggle ${settings.appearance === a.id ? 'is-on' : ''}`}
                aria-pressed={settings.appearance === a.id}
                disabled={settings.theme !== 'cozy'}
                onClick={() => store.setAppearance(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">
          Every preference here — theme, sounds, volume — is remembered on this device.
        </p>
      </section>

      <section className="card">
        <div className="card-head"><h2>Today page</h2></div>
        <div className="setting-row">
          <span className="equip-label">Focus timer</span>
          <div className="equip-options">
            <button
              className={`btn btn-sm chip-toggle ${settings.focusTimer === 'dock' ? 'is-on' : ''}`}
              aria-pressed={settings.focusTimer === 'dock'}
              onClick={() => store.setFocusTimer('dock')}
            >
              Corner dock
            </button>
            <button
              className={`btn btn-sm chip-toggle ${settings.focusTimer === 'card' ? 'is-on' : ''}`}
              aria-pressed={settings.focusTimer === 'card'}
              onClick={() => store.setFocusTimer('card')}
            >
              Compact card
            </button>
          </div>
        </div>
        <p className="muted">
          Corner dock keeps the timer as a small collapsible pill in the bottom-left of the
          Today page; Compact card keeps it in the layout as a smaller card.
        </p>
      </section>

      <section className="card">
        <div className="card-head"><h2>Soundscape</h2></div>
        <div className="setting-row">
          <span className="equip-label">Ambience</span>
          <div className="equip-options">
            {SOUNDSCAPE_IDS.map((id) => (
              <button
                key={id}
                className={`btn btn-sm chip-toggle ${settings.soundscape === id ? 'is-on' : ''}`}
                aria-pressed={settings.soundscape === id}
                onClick={() => store.setSoundscape(id)}
              >
                {SOUNDSCAPE_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span className="equip-label">Volume</span>
          <div className="volume-row">
            <span aria-hidden="true">🔈</span>
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.soundscapeVolume * 100)}
              onChange={(e) => store.setSoundscapeVolume(Number(e.target.value) / 100)}
              aria-label="Soundscape volume"
            />
            <span aria-hidden="true">🔊</span>
            <span className="volume-value mono">{Math.round(settings.soundscapeVolume * 100)}%</span>
          </div>
        </div>
        <button
          className={`btn btn-sm ${settings.soundscapeOn ? 'btn-primary' : ''}`}
          onClick={() => store.setSoundscapeOn(!settings.soundscapeOn)}
        >
          {settings.soundscapeOn ? 'Turn off' : 'Turn on'}
        </button>
      </section>

      <section className="card">
        <div className="card-head"><h2>Your data</h2></div>
        <p className="muted">Everything lives in this browser. Back it up or move it as a file.</p>
        <div className="manage-row">
          <button className="btn btn-sm" onClick={downloadBackup}>Export JSON</button>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className="btn btn-sm" onClick={() => store.replayOnboarding()}>Replay intro</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onImportFile}
          />
        </div>
        {msg && <p className="muted setting-msg">{msg}</p>}
      </section>

      <DesktopUpdate />

      <section className="card manage-danger">
        <div className="card-head"><h2>Danger zone</h2></div>
        <p className="muted">
          Wipe all saved data — points, items, today, the streak, the whole journal — and start
          completely fresh. This cannot be undone.
        </p>
        <button
          className={`btn btn-danger btn-block ${resetArmed ? 'is-armed' : ''}`}
          onClick={resetAll}
        >
          {resetArmed ? 'Really reset everything? This cannot be undone.' : 'Reset everything'}
        </button>
      </section>

      <p className="app-version settings-version">Focus Den {__APP_VERSION__}</p>
    </div>
  );
}

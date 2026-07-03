/**
 * Settings — themes & appearance, soundscape, deep work, data export/import,
 * onboarding replay, reset, and (clearly labeled) testing tools.
 */

import { useEffect, useRef, useState } from 'react';
import { SOUNDSCAPE_IDS, SOUNDSCAPE_LABELS, type Appearance, type State, type ThemeId } from '../core';
import { store, type SessionInfo } from '../state/store';
import type { RevisionMeta } from '../state/api';

export interface SettingsProps {
  state: State;
  session: SessionInfo;
}

const THEMES: { id: ThemeId; label: string; needs?: keyof State['perks'] }[] = [
  { id: 'cozy', label: 'Cozy' },
  { id: 'midnight', label: 'Midnight', needs: 'themeMidnight' },
  { id: 'sunrise', label: 'Sunrise', needs: 'themeSunrise' },
];

const APPEARANCES: { id: Appearance; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function Settings({ state, session }: SettingsProps) {
  const { settings, perks } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [backups, setBackups] = useState<RevisionMeta[] | null>(null);
  const [backupsMsg, setBackupsMsg] = useState<string | null>(null);

  async function loadBackups() {
    setBackupsMsg('Loading…');
    try {
      const list = await store.listBackups();
      setBackups(list);
      setBackupsMsg(list.length ? null : 'No backups yet — they appear after your first synced change.');
    } catch {
      setBackupsMsg('Can’t reach the server — backups need a connection.');
    }
  }

  async function restoreBackup(b: RevisionMeta) {
    const when = new Date(b.storedAt).toLocaleString();
    if (
      !window.confirm(
        `Restore the backup from ${when}? Your current progress will be replaced (on every device).`,
      )
    ) {
      return;
    }
    const ok = await store.restoreBackup(b.rev);
    setBackupsMsg(ok ? 'Backup restored ✓' : 'Restore failed — try again when online.');
    if (ok) void loadBackups();
  }

  // Show fresh account facts (email verified? changed elsewhere?) when opening.
  useEffect(() => {
    void store.refreshAccount();
  }, []);

  async function deleteProfile() {
    const password = window.prompt(
      `Delete the profile "${session.name}"? This permanently removes its den, points, history and all server backups.\n\nEnter the profile password to confirm:`,
    );
    if (!password) return;
    const result = await store.deleteCurrentAccount(password);
    if (!result.ok) setMsg(result.error ?? 'Delete failed.');
  }

  async function changePassword() {
    const current = window.prompt('Current password:');
    if (!current) return;
    const next = window.prompt('New password (at least 8 characters):');
    if (!next) return;
    const result = await store.changePassword(current, next);
    setMsg(result.ok ? 'Password changed ✓ — every other device was signed out.' : result.error ?? 'Failed.');
  }

  async function changeEmail() {
    const password = window.prompt('Your password:');
    if (!password) return;
    const email = window.prompt('New email address:');
    if (!email) return;
    const result = await store.changeEmail(password, email);
    setMsg(result.ok ? 'Email updated — check your inbox for the verification link.' : result.error ?? 'Failed.');
  }

  async function signOutEverywhere() {
    if (!window.confirm('Sign out on every device? (This one stays signed in.)')) return;
    const result = await store.signOutEverywhere();
    setMsg(result.ok ? 'All other sessions signed out ✓' : result.error ?? 'Failed.');
  }

  async function resendVerification() {
    const result = await store.resendVerification();
    setMsg(result.ok ? 'Verification email sent — check your inbox.' : result.error ?? 'Failed.');
  }

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
      setMsg(ok ? 'State imported ✓' : 'Import failed — not a valid Focus Den backup.');
    };
    reader.onerror = () => setMsg('Could not read that file.');
    reader.readAsText(file);
  }

  function resetAll() {
    if (
      window.confirm(
        'Reset everything? This wipes points, items, the current shift, the week streak, and all history. This cannot be undone.',
      )
    ) {
      store.resetAll();
      setMsg('Everything reset.');
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="card">
        <div className="card-head"><h2>Account</h2></div>

        <div className="account-rows">
          <div className="account-row">
            <span className="account-label">Signed in as</span>
            <span className="account-value">
              <strong>{session.name}</strong>
              {session.isAdmin && <span className="badge badge-ok">admin</span>}
            </span>
          </div>

          <div className="account-row">
            <span className="account-label">Email</span>
            <span className="account-value">
              {session.email ? (
                <>
                  <strong>{session.email}</strong>
                  {session.emailVerified ? (
                    <span className="badge badge-ok" title="Verified — password recovery is available">
                      ✓ verified
                    </span>
                  ) : (
                    <span className="badge badge-warn" title="Unverified — password recovery won’t work yet">
                      not verified
                    </span>
                  )}
                </>
              ) : (
                <em className="muted">none yet — needed for password recovery</em>
              )}
            </span>
            <span className="account-row-action">
              {session.email && !session.emailVerified && (
                <button className="btn btn-sm" onClick={() => void resendVerification()}>Resend link</button>
              )}
              {!session.email && (
                <button className="btn btn-sm" onClick={() => void changeEmail()}>Add email</button>
              )}
            </span>
          </div>
        </div>

        <div className="account-actions">
          <div className="manage-row">
            <button className="btn btn-sm" onClick={() => void changePassword()}>Change password</button>
            {session.email && (
              <button className="btn btn-sm" onClick={() => void changeEmail()}>Change email</button>
            )}
            <button className="btn btn-sm" onClick={() => void signOutEverywhere()}>Sign out everywhere</button>
          </div>
          <div className="manage-row">
            <button className="btn btn-sm" onClick={() => store.signOut()}>Sign out</button>
            <button className="btn btn-sm btn-danger" onClick={() => void deleteProfile()}>Delete profile</button>
          </div>
        </div>

        <p className="muted account-footnote">
          Changes save on this device instantly and sync to your server.
        </p>
      </section>

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
      </section>

      <section className="card">
        <div className="card-head"><h2>Soundscape</h2></div>
        {perks.soundscape ? (
          <>
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
          </>
        ) : (
          <p className="muted">Unlock the <strong>Soundscape Pack</strong> in the shop to play ambient audio.</p>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Data</h2></div>
        <p className="muted">Back up or move your progress between browsers.</p>
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

      <section className="card">
        <div className="card-head"><h2>Server backups</h2></div>
        <p className="muted">
          The server keeps your last 30 synced states. Restore one if something
          went wrong — it becomes the newest copy on every device.
        </p>
        <div className="manage-row">
          <button className="btn btn-sm" onClick={() => void loadBackups()}>
            {backups === null ? 'Show backups' : 'Refresh'}
          </button>
        </div>
        {backups !== null && backups.length > 0 && (
          <ul className="backup-list">
            {backups.slice(0, 10).map((b) => (
              <li key={b.rev} className="backup-row">
                <span className="mono muted">#{b.rev}</span>
                <span>{new Date(b.storedAt).toLocaleString()}</span>
                <button className="btn btn-sm" onClick={() => void restoreBackup(b)}>Restore</button>
              </li>
            ))}
          </ul>
        )}
        {backupsMsg && <p className="muted setting-msg">{backupsMsg}</p>}
      </section>

      {session.isAdmin && (
        <section className="card">
          <div className="card-head"><h2>Testing tools <span className="muted">(admin)</span></h2></div>
          <p className="muted">Helpers for trying things out — not part of the normal loop.</p>
          <div className="manage-row">
            <button className="btn btn-sm" onClick={() => store.devGrantPoints(100)}>+100 pts</button>
            <button className="btn btn-sm" onClick={() => store.devGrantPoints(500)}>+500 pts</button>
            <button className="btn btn-sm" onClick={() => store.buy('perk_streak_freeze')} title="Adds a streak freeze (costs points)">Buy freeze</button>
          </div>
        </section>
      )}

      {session.isAdmin && (
        <section className="card manage-danger">
          <div className="card-head"><h2>Danger zone <span className="muted">(admin)</span></h2></div>
          <p className="muted">Wipe all saved data and start completely fresh.</p>
          <button className="btn btn-danger btn-block" onClick={resetAll}>Reset everything</button>
        </section>
      )}
    </div>
  );
}

/**
 * The screen a password-reset email link lands on (/?reset=<token>). Setting a
 * new password signs this device in and revokes every other session.
 */

import { useState } from 'react';
import { completeReset } from '../state/auth';
import { store } from '../state/store';

export function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw1 !== pw2) {
      setError('Passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await completeReset(token, pw1);
    setBusy(false);
    if (result.ok && result.userId) {
      store.signIn(result.userId);
      onDone();
    } else {
      setError(result.error ?? 'Something went wrong.');
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Focus&nbsp;Den</span>
        </div>
        <h2 className="login-heading">Choose a new password</h2>
        <p className="muted login-tagline">
          Setting a new password signs you in here and signs out every other device.
        </p>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span className="login-label">New password</span>
            <div className="password-row">
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                data-sound="none"
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </label>
          <label className="login-field">
            <span className="login-label">Repeat new password</span>
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Same password again"
              autoComplete="new-password"
            />
          </label>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button
            className="btn btn-primary btn-block btn-xl"
            type="submit"
            disabled={busy || pw1.length === 0 || pw2.length === 0}
          >
            {busy ? 'Just a sec…' : 'Set new password'}
          </button>
          <button type="button" className="login-link" onClick={onDone} data-sound="none">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

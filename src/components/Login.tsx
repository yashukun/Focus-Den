/**
 * Sign-in / sign-up gate. Profiles are local to this device (see auth.ts).
 */

import { useState } from 'react';
import { login, listAccounts, signup } from '../state/auth';
import { store } from '../state/store';

type Mode = 'signin' | 'signup';

export function Login() {
  const [mode, setMode] = useState<Mode>(() => (listAccounts().length > 0 ? 'signin' : 'signup'));
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = mode === 'signup' ? await signup(name, password) : await login(name, password);
      if (result.ok && result.userId) {
        store.signIn(result.userId);
      } else {
        setError(result.error ?? 'Something went wrong.');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="login-screen">
      <div className="login-card card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Focus&nbsp;Den</span>
        </div>
        <p className="muted login-tagline">A cozy place to focus and grow your room.</p>

        <div className="login-tabs" role="tablist" aria-label="Sign in or create account">
          <button
            role="tab"
            aria-selected={mode === 'signin'}
            className={`login-tab ${mode === 'signin' ? 'is-active' : ''}`}
            onClick={() => switchMode('signin')}
            data-sound="none"
            type="button"
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === 'signup'}
            className={`login-tab ${mode === 'signup' ? 'is-active' : ''}`}
            onClick={() => switchMode('signup')}
            data-sound="none"
            type="button"
          >
            Create account
          </button>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span className="login-label">Name</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sam"
              autoComplete="username"
              maxLength={20}
              autoFocus
            />
          </label>
          <label className="login-field">
            <span className="login-label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button
            className="btn btn-primary btn-block btn-xl"
            type="submit"
            disabled={busy || !name.trim() || !password}
            data-sound={mode === 'signup' ? 'success' : 'start'}
          >
            {busy ? 'Just a sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="muted login-note">
          🔒 Your den syncs to your own server. Use a password you don’t use
          anywhere else.
        </p>
      </div>
    </div>
  );
}

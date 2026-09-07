'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem('loop_admin_token')) {
      router.replace('/');
    }
  }, [router]);

  const validateForm = () => {
    if (!identifier.trim()) return 'Email or mobile is required';
    if (identifier.trim().length < 3) return 'Email or mobile is too short';
    if (!password.trim()) return 'Password is required';
    if (password.trim().length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password: password.trim() }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || 'Invalid email/mobile or password');
      }

      const token = payload?.access_token;
      if (!token) {
        throw new Error('Authentication token was not returned by the server');
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('loop_admin_token', token);
        window.sessionStorage.setItem('loop_admin_last_activity', String(Date.now()));
        if (payload.user) {
          window.sessionStorage.setItem('loop_admin_user', JSON.stringify(payload.user));
        }
      }

      router.push('/');
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page-shell">
      <div className="login-visual" aria-hidden="true">
        <div className="login-visual-branding-inline">
          <img src="/loop-logo-white.png" alt="LOOP" className="login-visual-logo-inline" />
        </div>
        <div className="login-visual-copy only-text">
          <div className="login-visual-tag">MODERN MENSWEAR • DRESS LIFESTYLE</div>
          <p className="login-visual-lifestyle">
            Curated essentials for everyday confidence — refined menswear built for movement,
            comfort, and a sharper personal style.
          </p>
        </div>
      </div>

      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo" aria-label="Loop logo">
            <img src="/loop-logo-white.png" alt="Loop" className="login-logo-image" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-group">
            <span>Email Address</span>
            <input
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Enter your email"
              required
              aria-invalid={Boolean(error)}
            />
          </label>

          <label className="field-group">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              aria-invalid={Boolean(error)}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'SIGN IN'}
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </div>

      <div className="mobile-login-tagline">
        <div className="mobile-login-kicker">MODERN MENSWEAR • DRESS LIFESTYLE</div>
        <p>
          Curated essentials for everyday confidence — refined menswear built for movement,
          comfort, and a sharper personal style.
        </p>
      </div>
    </main>
  );
}

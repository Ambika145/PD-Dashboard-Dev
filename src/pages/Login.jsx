import React, { useMemo, useRef, useState } from 'react';
import Icon from '../components/Icons.jsx';
import { authenticate, ROLE_LABEL, ROLES } from '../lib/access.js';
import logoWhite from '../assets/purview-logo-white.svg';

export default function Login({ users, onLogin }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const pinRef = useRef(null);
  const activeUsers = useMemo(() => {
    const list = (users || []).filter((u) => u.active !== false);
    return [...list].sort((a, b) => {
      if (a.role === ROLES.SUPERADMIN && b.role !== ROLES.SUPERADMIN) return -1;
      if (b.role === ROLES.SUPERADMIN && a.role !== ROLES.SUPERADMIN) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [users]);

  const submit = (e) => {
    e.preventDefault();
    const res = authenticate(users, name, pin);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError('');
    onLogin(res.user);
  };

  const pick = (u) => {
    setName(u.name);
    setPin('');
    setError('');
    requestAnimationFrame(() => pinRef.current?.focus());
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <img src={logoWhite} alt="Purview Digital" />
          <div>
            <h1>Junk Analysis</h1>
            <p>Sign in to continue</p>
          </div>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="field">
            Team member
            <input
              className="input"
              list="team-users"
              autoComplete="username"
              placeholder="Select or type a name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <datalist id="team-users">
              {activeUsers.map((u) => <option key={u.id} value={u.name} />)}
            </datalist>
          </label>
          <label className="field">
            PIN
            <input
              ref={pinRef}
              className="input"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="4+ digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              minLength={4}
            />
          </label>
          {error && (
            <div className="callout crit" role="alert">
              <Icon name="alert" size={16} />
              <div>{error}</div>
            </div>
          )}
          <button className="btn lg" type="submit" style={{ width: '100%' }}>
            <Icon name="checkCircle" size={16} /> Sign in
          </button>
        </form>

        <div className="login-people">
          <span className="login-people-label">Quick pick</span>
          <div className="login-people-grid">
            {activeUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`login-person ${name === u.name ? 'on' : ''}`}
                onClick={() => pick(u)}
              >
                <span className={`login-avatar ${u.role === ROLES.SUPERADMIN ? 'super' : ''}`}>{u.name.slice(0, 1)}</span>
                <span>
                  <b>{u.name}</b>
                  <em>{ROLE_LABEL[u.role] || u.role}</em>
                </span>
              </button>
            ))}
          </div>
          <p className="login-hint">
            Default PIN is <b>1234</b>. Super Admin manages the team and programme assignments.
          </p>
        </div>
      </div>
    </div>
  );
}

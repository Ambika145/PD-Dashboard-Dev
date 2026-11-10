import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

/** Shows what went wrong instead of an empty page if a screen crashes. */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 640, margin: '12vh auto', padding: '28px 32px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }}>
        <h1 style={{ fontFamily: 'var(--f-display)', fontSize: 20, marginBottom: 8 }}>Something went wrong on this screen</h1>
        <p style={{ marginBottom: 12 }}>Your saved weeks are safe. Reload the page to continue; if it happens again, send this message to the developer:</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--sunken)', padding: 10, borderRadius: 4, color: 'var(--crit)' }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button className="btn" type="button" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

try {
  createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
  clearTimeout(window.__junkBootTimer);
} catch (e) {
  window.__junkBootFail?.();
}

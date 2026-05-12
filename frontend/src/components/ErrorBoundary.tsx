import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: 'var(--text-2)', maxWidth: 600 }}>
          <h1 style={{ fontSize: 18, marginBottom: 12, color: 'var(--text)' }}>
            Erreur dans l'interface
          </h1>
          <p style={{ fontSize: 13, marginBottom: 12 }}>{this.state.error.message}</p>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

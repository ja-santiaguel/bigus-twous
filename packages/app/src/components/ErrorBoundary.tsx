import { Component, type ReactNode } from 'react';

/**
 * The last line of defence.
 *
 * Without this a single thrown render error unmounts the whole tree and leaves
 * a blank felt-green page with nothing to click — which, to a player, is the
 * game freezing for good. What they need is a way back, and reloading is a
 * good one: a game played alone is saved after every turn, and a shared table
 * holds the seat for the tab that comes back.
 *
 * Only ever visible when something has already gone wrong; it changes nothing
 * about a game that is working.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('Big Two hit an error it could not recover from.', error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen">
        <div className="panel" role="alert">
          <h2>Something went wrong</h2>
          <p className="field__hint field__hint--lead">
            The game hit an error it could not recover from. Reloading brings you back — a game played alone is
            saved, and a shared table holds your seat.
          </p>
          <button className="btn btn--primary btn--wide" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

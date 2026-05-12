import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

/**
 * Default workspace layout — sidebar + main area.
 * The manuscript editor uses a different (3-pane) layout, so it skips this one.
 */
export function WorkspaceLayout() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

interface TopbarProps {
  crumbs: Array<{ label: string; to?: string }>;
  children?: React.ReactNode; // right-side actions
}

export function Topbar({ crumbs, children }: TopbarProps) {
  return (
    <header className="topbar">
      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span className="sep">/</span>}
            {c.to ? (
              <a href={c.to}>{c.label}</a>
            ) : (
              <span className={i === crumbs.length - 1 ? 'current' : ''}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="topbar-actions">{children}</div>
    </header>
  );
}

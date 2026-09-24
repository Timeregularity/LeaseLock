import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { useTheme } from './theme';

function formatTimer(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'success', title) => {
    const id = crypto.randomUUID();
    setToasts((items) => [
      ...items,
      {
        id,
        message,
        type,
        title:
          title ||
          (type === 'error'
            ? 'Couldn’t complete request'
            : type === 'warning'
              ? 'Please note'
              : 'Done'),
      },
    ]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container position-fixed top-0 end-0 p-3">
        {toasts.map((toast) => (
          <div
            className={`toast show toast-${toast.type}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            key={toast.id}
          >
            <div className="toast-body d-flex align-items-start gap-3">
              <span className="toast-icon">
                {toast.type === 'error' ? '!' : toast.type === 'warning' ? '◷' : '✓'}
              </span>
              <div className="flex-grow-1">
                <strong className="d-block">{toast.title}</strong>
                <span>{toast.message}</span>
              </div>
              <button
                className="btn-close"
                aria-label="Close"
                onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Layout({ children, admin = false, bare = false }) {
  if (bare) return <>{children}</>;
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Navbar admin={admin} />
      {children}
      <Footer />
    </>
  );
}

function Navbar({ admin }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, activeHoldSeconds } = useTheme();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const links = admin
    ? [
        ['/admin', 'Dashboard'],
        ['/admin/events', 'Events'],
        ['/admin/seats', 'Seat status'],
        ['/admin/concurrency-demo', 'Concurrency demo'],
      ]
    : user
      ? [
          ['/events', 'Events'],
          ['/reservations', 'My bookings'],
          ['/waitlist', 'Waitlist'],
          ['/profile', 'Profile'],
        ]
      : [['/events', 'Events']];

  async function signOut() {
    setBusy(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const button = document.querySelector('.app-navbar .navbar-toggler');
    const menu = document.getElementById('appNav');
    if (!button || !menu) return;
    button.removeAttribute('data-bs-toggle');
    button.removeAttribute('data-bs-target');
    const toggle = () => {
      setOpen((value) => {
        const next = !value;
        menu.classList.toggle('show', next);
        button.setAttribute('aria-expanded', String(next));
        return next;
      });
    };
    button.addEventListener('click', toggle);
    return () => button.removeEventListener('click', toggle);
  }, []);

  return (
    <nav className="navbar navbar-expand-lg app-navbar" aria-label="Primary navigation">
      <div className="container">
        <div className="d-flex align-items-center gap-3">
          <Link className="navbar-brand" to={admin ? '/admin' : '/events'}>
            <span className="brand-mark">L</span>LeaseLock
          </Link>
          
          {/* Real-time telemetry badges from design prompt */}
          <div className="nav-telemetry d-none d-md-flex align-items-center gap-2">
            <span className="ws-status-badge" title="Real-time WebSocket / SSE connection stream">
              <span className="ws-pulse-dot" />
              Connected • 4ms
            </span>
            {activeHoldSeconds > 0 && (
              <span className="nav-hold-timer-badge" title="Active seat hold reservation window">
                <span className="hold-timer-icon">⏱️</span>
                <span className="hold-timer-text font-monospace">{formatTimer(activeHoldSeconds)} remaining</span>
              </span>
            )}
          </div>
        </div>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#appNav"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>
        <div className="collapse navbar-collapse" id="appNav">
          <ul className="navbar-nav ms-auto align-items-lg-center gap-lg-1">
            {links.map(([to, label]) => (
              <li className="nav-item" key={to}>
                <NavLink
                  end={to === '/admin'}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  to={to}
                >
                  {label}
                </NavLink>
              </li>
            ))}
            {user?.role === 'ADMIN' && !admin && (
              <li className="nav-item">
                <Link className="nav-link" to="/admin">
                  Admin
                </Link>
              </li>
            )}
            {user ? (
              <>
                <li className="nav-item nav-user" aria-label={`Signed in as ${user.fullName}`}>
                  {user.fullName}
                </li>
                <li className="nav-item ms-lg-2">
                  <button
                    className="btn btn-sm btn-outline-secondary nav-logout"
                    onClick={signOut}
                    disabled={busy}
                  >
                    {busy ? 'Logging out…' : 'Log out'}
                  </button>
                </li>
              </>
            ) : (
              <>
                <li className="nav-item">
                  <Link className="nav-link" to="/login">
                    Sign in
                  </Link>
                </li>
                <li className="nav-item ms-lg-2">
                  <Link className="btn btn-sm btn-emerald" to="/register">
                    Create account
                  </Link>
                </li>
              </>
            )}
            {/* Theme Toggle Button */}
            <li className="nav-item ms-lg-2">
              <button
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <span className="theme-toggle-icon" title="Switch to Light mode">☀️</span>
                ) : (
                  <span className="theme-toggle-icon" title="Switch to Dark mode">🌙</span>
                )}
              </button>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6.1c.98 0 1.94.13 2.85.38 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.27c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"
      />
    </svg>
  );
}
function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V8.98h3.42v1.57h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.29ZM5.32 7.41a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13Zm1.78 13.04H3.54V8.98H7.1v11.47Z"
      />
    </svg>
  );
}
function Footer() {
  return (
    <footer className="app-footer">
      <div className="container d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
        <span>
          © 2026 Timeregularity. Built as a full-stack systems engineering portfolio project.
        </span>
        <nav className="footer-socials" aria-label="Developer profiles">
          <a
            href="https://github.com/Timeregularity"
            target="_blank"
            rel="noreferrer"
            aria-label="Visit Timeregularity on GitHub"
          >
            <GitHubMark />
            <span>GitHub</span>
          </a>
          <a
            href="https://www.linkedin.com/in/kshitij-develops/"
            target="_blank"
            rel="noreferrer"
            aria-label="Visit Kshitij on LinkedIn"
          >
            <LinkedInMark />
            <span>LinkedIn</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function PageHeader({ eyebrow, heading, description, action }) {
  return (
    <div className="page-heading d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-3">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{heading}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && (
        <Link to={action.to} className="btn btn-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function StatusBadge({ status }) {
  const raw = String(status || '');
  const normalized = raw.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  const label =
    raw === 'PAYMENT_IN_PROGRESS'
      ? 'Under payment'
      : raw === 'HELD_OTHER'
        ? 'Held by other'
        : raw === 'HELD_SELF'
          ? 'Your hold'
          : raw.replace('_', ' ');
  return <span className={`badge status-badge status-${normalized}`}>{label}</span>;
}
export function Spinner({ label }) {
  return (
    <>
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      {label}
    </>
  );
}

export function NotFound() {
  return (
    <Layout>
      <main id="main-content" className="error-shell">
        <div className="error-code">404</div>
        <span className="eyebrow">Page not found</span>
        <h1>This page could not be found.</h1>
        <p>The page may have moved, or the address may be incorrect.</p>
        <Link to="/events" className="btn btn-primary">
          Back to events
        </Link>
      </main>
    </Layout>
  );
}

export function Empty({
  icon = '⌕',
  title = 'No results found',
  text = 'Try adjusting your search or filter.',
  action,
}) {
  return (
    <div className="empty-state text-center py-5 px-3">
      <div className="empty-icon mb-3" style={{ fontSize: '2.5rem', opacity: 0.6 }}>
        {icon}
      </div>
      <h3 className="h5 mb-2">{title}</h3>
      <p className="text-muted mb-4">{text}</p>
      {action && (
        <Link to={action.to} className="btn btn-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

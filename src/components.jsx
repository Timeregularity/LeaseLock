import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const showToast = useCallback((message, type = 'success', title) => {
    const id = crypto.randomUUID()
    setToasts(items => [...items, { id, message, type, title:title || (type === 'error' ? 'Couldn’t complete request' : type === 'warning' ? 'Please note' : 'Done') }])
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 4500)
  }, [])
  return <ToastContext.Provider value={showToast}>{children}<div className="toast-container position-fixed top-0 end-0 p-3">{toasts.map(toast => <div className={`toast show toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} key={toast.id}><div className="toast-body d-flex align-items-start gap-3"><span className="toast-icon">{toast.type === 'error' ? '!' : toast.type === 'warning' ? '◷' : '✓'}</span><div className="flex-grow-1"><strong className="d-block">{toast.title}</strong><span>{toast.message}</span></div><button className="btn-close" aria-label="Close" onClick={() => setToasts(items => items.filter(item => item.id !== toast.id))}/></div></div>)}</div></ToastContext.Provider>
}

export function Layout({ children, admin = false, bare = false }) {
  if (bare) return <>{children}</>
  return <><a className="skip-link" href="#main-content">Skip to main content</a><Navbar admin={admin}/>{children}<Footer/></>
}

function Navbar({ admin }) {
  const {user,logout}=useAuth(); const navigate=useNavigate(); const [busy,setBusy]=useState(false)
  const links = admin ? [['/admin','Dashboard'],['/admin/events','Events'],['/admin/seats','Seat status'],['/admin/concurrency-demo','Concurrency demo']] : user ? [['/events','Events'],['/reservations','My bookings'],['/waitlist','Waitlist'],['/profile','Profile']] : [['/events','Events']]
  async function signOut(){setBusy(true);try{await logout();navigate('/login',{replace:true})}finally{setBusy(false)}}
  return <nav className="navbar navbar-expand-lg app-navbar" aria-label="Primary navigation"><div className="container"><Link className="navbar-brand" to={admin ? '/admin' : '/events'}><span className="brand-mark">L</span>LeaseLock</Link><button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#appNav" aria-label="Toggle navigation"><span className="navbar-toggler-icon"/></button><div className="collapse navbar-collapse" id="appNav"><ul className="navbar-nav ms-auto align-items-lg-center gap-lg-1">{links.map(([to,label]) => <li className="nav-item" key={to}><NavLink end={to === '/admin'} className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} to={to}>{label}</NavLink></li>)}{user?.role==='ADMIN'&&!admin&&<li className="nav-item"><Link className="nav-link" to="/admin">Admin</Link></li>}{user?<><li className="nav-item nav-user" aria-label={`Signed in as ${user.fullName}`}>{user.fullName}</li><li className="nav-item ms-lg-2"><button className="btn btn-sm btn-outline-secondary nav-logout" onClick={signOut} disabled={busy}>{busy?'Logging out…':'Log out'}</button></li></>:<><li className="nav-item"><Link className="nav-link" to="/login">Sign in</Link></li><li className="nav-item ms-lg-2"><Link className="btn btn-sm btn-primary" to="/register">Create account</Link></li></>}</ul></div></div></nav>
}

function Footer() { return <footer className="app-footer"><div className="container d-flex flex-column flex-sm-row justify-content-between gap-2"><span>© 2026 LeaseLock</span><span>Backend-authoritative reservations, clearly presented.</span></div></footer> }

export function PageHeader({ eyebrow, heading, description, action }) {
  return <div className="page-heading d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-3"><div><span className="eyebrow">{eyebrow}</span><h1>{heading}</h1>{description && <p>{description}</p>}</div>{action && <Link to={action.to} className="btn btn-primary">{action.label}</Link>}</div>
}

export function StatusBadge({ status }) { return <span className={`badge status-badge status-${status.toLowerCase().replaceAll(' ','-')}`}>{status}</span> }
export function Spinner({ label }) { return <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"/>{label}</> }

export function NotFound() {
  return <Layout><main id="main-content" className="error-shell"><div className="error-code">404</div><span className="eyebrow">Page not found</span><h1>This page could not be found.</h1><p>The page may have moved, or the address may be incorrect.</p><Link to="/events" className="btn btn-primary">Back to events</Link></main></Layout>
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0,0), [pathname])
  return null
}

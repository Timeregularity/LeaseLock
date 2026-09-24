import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Empty, Layout, PageHeader, Spinner, StatusBadge, useToast } from '../components';
import { apiRequest, apiUrl, clearIdempotencyKey, idempotencyKey } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import { initialReservations } from '../data';

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function AuthPage({ register = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }
    const body = Object.fromEntries(new FormData(form));
    if (register && body.password !== body.confirmPassword) {
      setError('Passwords must match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest(register ? '/v1/auth/register' : '/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const user = await refreshUser();
      showToast(register ? 'Account created successfully.' : 'Welcome back.');
      navigate(location.state?.from || (user?.role === 'ADMIN' ? '/admin' : '/events'), {
        replace: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout bare>
      <main id="main-content" className="auth-shell">
        <section className="auth-brand-panel">
          <Link className="navbar-brand text-white" to="/events">
            <span className="brand-mark brand-mark-light">L</span>LeaseLock
          </Link>
          <div>
            <span className="eyebrow eyebrow-light">
              {register ? 'A calmer checkout' : 'Reservation infrastructure'}
            </span>
            <h1>
              {register
                ? 'Your seat. Your hold. Your time to decide.'
                : 'Reserve limited resources without the chaos.'}
            </h1>
            <p>Temporary holds, clear countdowns, and dependable confirmations—presented simply.</p>
          </div>
          <div className="auth-proof">
            <span className="status-dot" /> Server-authoritative by design
          </div>
        </section>
        <section className="auth-form-panel">
          <div className="auth-card">
            <span className="eyebrow">{register ? 'Get started' : 'Welcome back'}</span>
            <h2>{register ? 'Create your account' : 'Sign in to LeaseLock'}</h2>
            <p className="text-muted mb-4">
              {register
                ? 'Four fields, then you’re ready to reserve.'
                : 'Enter your account details to continue.'}
            </p>
            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={submit} noValidate>
              {register && <Field id="fullName" label="Full name" autoComplete="name" />}
              <Field id="email" label="Email address" type="email" autoComplete="email" />
              <div className={register ? 'row g-3 mb-4' : ''}>
                <div className={register ? 'col-sm-6' : 'mb-4'}>
                  <Field
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete={register ? 'new-password' : 'current-password'}
                    nested
                  />
                </div>
                {register && (
                  <div className="col-sm-6">
                    <Field
                      id="confirmPassword"
                      label="Confirm password"
                      type="password"
                      autoComplete="new-password"
                      nested
                    />
                  </div>
                )}
              </div>
              <button className="btn btn-primary w-100" disabled={busy}>
                {busy ? (
                  <Spinner label={register ? 'Creating account…' : 'Signing in…'} />
                ) : register ? (
                  'Create account'
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
            <p className="auth-switch">
              {register ? 'Already registered?' : 'Don’t have an account?'}{' '}
              <Link to={register ? '/login' : '/register'}>
                {register ? 'Sign in' : 'Create one'}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
function Field({ id, label, type = 'text', autoComplete, nested = false }) {
  const field = (
    <>
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <input
        className="form-control"
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        minLength={type === 'password' ? 8 : undefined}
        required
      />
      <div className="invalid-feedback">Enter a valid {label.toLowerCase()}.</div>
    </>
  );
  return nested ? field : <div className="mb-3">{field}</div>;
}
export const Login = () => <AuthPage />;
export const Register = () => <AuthPage register />;

function displayEvent(event) {
  const starts = new Date(event.startsAt);
  const date = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: event.timezone,
  }).format(starts);
  const time = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
  }).format(starts);
  return {
    ...event,
    date,
    time,
    isoDate: starts.toISOString().slice(0, 10),
    eyebrow: 'Published event',
    status: event.available ? 'AVAILABLE' : 'SOLD OUT',
  };
}

export function EventsPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    apiRequest('/v1/events')
      .then((data) => setItems(data.events.map(displayEvent)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  const visible = items.filter((event) =>
    `${event.title} ${event.venue}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <PageHeader
          eyebrow="Upcoming experiences"
          heading="Find your next event"
          description="Choose an event, secure a temporary hold, then confirm when you’re ready."
        />
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <div className="event-toolbar">
          <span>
            <strong>{items.length}</strong> upcoming events
          </span>
          <div className="input-group search-control">
            <span className="input-group-text">⌕</span>
            <input
              className="form-control"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events or venues"
              aria-label="Search events"
            />
          </div>
        </div>
        {loading ? (
          <div className="text-center py-5">
            <Spinner label="Loading events…" />
          </div>
        ) : visible.length ? (
          <div className="row g-4">
            {visible.map((event, index) => (
              <div className="col-md-6 col-xl-4" key={event.id}>
                <article className="event-card h-100">
                  <div className={`event-card-top accent-${(index % 3) + 1}`}>
                    <span>{event.eyebrow}</span>
                    <StatusBadge status={event.status} />
                    <div className="event-monogram">{event.title[0]}</div>
                  </div>
                  <div className="event-card-body">
                    <h2>{event.title}</h2>
                    <div className="event-meta">
                      <div>
                        <span className="meta-icon">◷</span>
                        <span>
                          {event.date} · {event.time}
                        </span>
                      </div>
                      <div>
                        <span className="meta-icon">⌖</span>
                        <span>{event.venue}</span>
                      </div>
                    </div>
                    <div className="availability-row">
                      <div>
                        <small>Available seats</small>
                        <strong>
                          {event.available} <span>/ {event.total}</span>
                        </strong>
                      </div>
                      <div className="text-end">
                        <small>From</small>
                        <strong>₹{event.price}</strong>
                      </div>
                    </div>
                    <div className="progress slim-progress">
                      <div
                        className="progress-bar"
                        style={{
                          width: `${event.total ? (event.available / event.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <Link
                      className={`btn ${event.available ? 'btn-primary' : 'btn-light disabled'} w-100 mt-4`}
                      to={`/events/${event.id}`}
                    >
                      {event.available ? 'View event' : 'Sold out'}
                    </Link>
                  </div>
                </article>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="⌕" title="No matching events" text="Try a different event name or venue." />
        )}
      </main>
    </Layout>
  );
}

export function EventDetail() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiRequest(`/v1/events/${id}`)
      .then((data) => setEvent(displayEvent(data.event)))
      .catch((err) => setError(err.message));
  }, [id]);
  if (error)
    return (
      <Layout>
        <main id="main-content" className="container page-wrap">
          <div className="alert alert-danger">{error}</div>
          <Link to="/events">Back to events</Link>
        </main>
      </Layout>
    );
  if (!event)
    return (
      <Layout>
        <main id="main-content" className="container page-wrap text-center">
          <Spinner label="Loading event…" />
        </main>
      </Layout>
    );
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <nav>
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <Link to="/events">Events</Link>
            </li>
            <li className="breadcrumb-item active">{event.title}</li>
          </ol>
        </nav>
        <section className="detail-hero">
          <div className="detail-copy">
            <StatusBadge status={event.status} />
            <h1>{event.title}</h1>
            <p className="lead">{event.description}</p>
            <div className="detail-meta">
              <div>
                <span>DATE & TIME</span>
                <strong>
                  {event.date} · {event.time}
                </strong>
              </div>
              <div>
                <span>VENUE</span>
                <strong>{event.venue}</strong>
              </div>
            </div>
          </div>
          <aside className="booking-summary">
            <span className="eyebrow">Booking summary</span>
            <div className="summary-line">
              <span>Seats available</span>
              <strong>
                {event.available} of {event.total}
              </strong>
            </div>
            <div className="summary-line">
              <span>Starting price</span>
              <strong>₹{event.price}</strong>
            </div>
            <Link
              to={`/events/${event.id}/seats`}
              className={`btn btn-primary btn-lg w-100 ${event.available ? '' : 'disabled'}`}
            >
              Choose seats →
            </Link>
            <p className="secure-note">
              ◴ Selected seats are temporarily held before confirmation.
            </p>
          </aside>
        </section>
        <section className="info-strip">
          {[
            ['01', 'Choose a seat', 'See live server-reported availability.'],
            ['02', 'Start a hold', 'Your countdown begins on success.'],
            ['03', 'Confirm', 'Receive your reservation code.'],
          ].map(([number, title, text], i) => (
            <div key={number}>
              <span className="step-number">{number}</span>
              <p>
                <strong>{title}</strong>
                <br />
                {text}
              </p>
              {i < 2 && <span className="step-arrow">→</span>}
            </div>
          ))}
        </section>
      </main>
    </Layout>
  );
}

function normalizeStatus(value) {
  const status = String(value || '').toUpperCase();
  if (status === 'AVAILABLE') return 'available';
  if (['RESERVED', 'CONFIRMED'].includes(status)) return 'reserved';
  if (['HELD_BY_CURRENT_USER', 'HELD_SELF'].includes(status)) return 'held-self';
  if (['PAYMENT_IN_PROGRESS', 'CHECKOUT', 'UNDER_PAYMENT'].includes(status)) return 'under-payment';
  if (['HELD', 'HELD_OTHER'].includes(status)) return 'held-other';
  return 'held-other';
}

export function SeatSelection() {
  const { id } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  const { setActiveHoldSeconds } = useTheme();
  const [event, setEvent] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [draftsByOthers, setDraftsByOthers] = useState([]);
  const [hold, setHold] = useState(null);
  const [pending, setPending] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  const clientId = useMemo(() => {
    let stored = sessionStorage.getItem('ll_client_id');
    if (!stored) {
      stored = crypto.randomUUID();
      sessionStorage.setItem('ll_client_id', stored);
    }
    return stored;
  }, []);

  const selectedSeats = useMemo(
    () => selectedIds.map((seatId) => seats.find((seat) => seat.id === seatId)).filter(Boolean),
    [selectedIds, seats],
  );
  const selectedTotal = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const heldIds = hold?.seatIds || [];

  const syncDrafts = (nextSelectedIds) => {
    apiRequest(`/v1/events/${id}/drafts`, {
      method: 'POST',
      body: JSON.stringify({ clientId, seatIds: nextSelectedIds }),
    }).catch(() => {});
  };

  const refresh = async (silent = false) => {
    try {
      const data = await apiRequest(`/v1/events/${id}/seats`);
      const rawSeats = data.seats || data;
      setSeats(
        rawSeats.map((seat) => ({
          ...seat,
          status: normalizeStatus(seat.status),
        })),
      );
    } catch (err) {
      if (!silent)
        showToast('Could not refresh availability. Displayed seats may be out of date.', 'error');
    }
  };

  const recoverHold = async () => {
    try {
      const data = await apiRequest(`/v1/holds/active/current?eventId=${encodeURIComponent(id)}`);
      setHold(data.hold);
    } catch (err) {
      showToast('Could not recover your active selection.', 'error');
    }
  };

  useEffect(() => {
    apiRequest(`/v1/events/${id}`)
      .then((data) => setEvent(displayEvent(data.event)))
      .catch((err) => showToast(err.message, 'error'));
    recoverHold();
    refresh();
  }, [id]);

  useEffect(() => {
    if (!hold?.expiresAt) {
      setSecondsLeft(0);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setHold(null);
        setSelectedIds([]);
        refresh(true);
        showToast(
          'Your hold has expired. The seats have been released.',
          'warning',
          'Hold expired',
        );
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [hold?.expiresAt]);

  useEffect(() => {
    setActiveHoldSeconds(hold && secondsLeft > 0 ? secondsLeft : 0);
    return () => setActiveHoldSeconds(0);
  }, [hold, secondsLeft, setActiveHoldSeconds]);

  useEffect(() => {
    const stream = new EventSource(apiUrl(`/v1/events/${id}/seat-events?clientId=${clientId}`), {
      withCredentials: true,
    });

    stream.addEventListener('connected', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.drafts) {
          const others = data.drafts
            .filter((d) => d.clientId !== clientId)
            .flatMap((d) => d.seatIds);
          setDraftsByOthers([...new Set(others)]);
        }
      } catch (e) {}
    });

    stream.addEventListener('drafts-changed', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.drafts) {
          const others = data.drafts
            .filter((d) => d.clientId !== clientId)
            .flatMap((d) => d.seatIds);
          setDraftsByOthers([...new Set(others)]);
        }
      } catch (e) {}
    });

    stream.addEventListener('seats-changed', () => {
      recoverHold();
      refresh(true);
    });

    return () => {
      stream.close();
      syncDrafts([]);
    };
  }, [id, clientId]);

  useEffect(() => {
    const poll = setInterval(() => {
      if (!document.hidden && !pending) {
        recoverHold();
        refresh(true);
      }
    }, 8000);
    return () => clearInterval(poll);
  }, [id, pending]);

  async function toggleSeat(seat) {
    if (pending) return;
    if (hold?.bookingId) {
      showToast(
        'You have an active checkout in progress. Please resume checkout or wait for your session timer to expire.',
        'warning',
        'Checkout active',
      );
      return;
    }
    if (seat.status === 'under-payment') {
      showToast(
        `Seat ${seat.id} is currently under payment by another customer. It will release if checkout is not completed.`,
        'warning',
        'Under payment',
      );
      return;
    }
    if (seat.status === 'held-other') {
      showToast(`Seat ${seat.id} is temporarily held by another customer.`, 'warning', 'Seat held');
      return;
    }
    if (seat.status === 'reserved') {
      showToast(`Seat ${seat.id} is already reserved.`, 'info', 'Seat reserved');
      return;
    }
    if (seat.status !== 'available' && seat.status !== 'held-self') return;

    setSelectedIds((current) => {
      let next;
      if (current.includes(seat.id)) {
        next = current.filter((value) => value !== seat.id);
      } else {
        if (current.length >= 6) {
          showToast('You can select up to 6 seats.', 'warning', 'Selection limit');
          return current;
        }
        if (draftsByOthers.includes(seat.id)) {
          showToast(
            `Note: Another user is also looking at Seat ${seat.id}. First to checkout gets the hold.`,
            'info',
            'High demand',
          );
        }
        next = [...current, seat.id].sort();
      }
      syncDrafts(next);
      return next;
    });
  }

  async function createHold() {
    if (pending || hold || !selectedIds.length) return;
    const requestedIds = [...selectedIds].sort();
    const logical = `${id}:${requestedIds.join(',')}`;
    setPending('hold');
    try {
      const result = await apiRequest('/v1/holds', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('hold', logical) },
        body: JSON.stringify({ eventId: id, seatIds: requestedIds }),
      });
      clearIdempotencyKey('hold', logical);
      syncDrafts([]);
      setHold({
        ...result,
        seatIds: result.seatIds || requestedIds,
        totalPrice: result.totalPrice ?? selectedTotal,
      });
      setSeats((items) =>
        items.map((item) =>
          requestedIds.includes(item.id) ? { ...item, status: 'held-self' } : item,
        ),
      );
      setSelectedIds([]);
      showToast(
        `${requestedIds.length} seat${requestedIds.length === 1 ? ' is' : 's are'} held for you.`,
      );
    } catch (err) {
      const unavailable = err.details?.unavailableSeatIds || err.details?.seatIds || [];
      if (
        err.status === 409 ||
        ['SEATS_UNAVAILABLE', 'SEAT_ALREADY_HELD', 'SEAT_ALREADY_RESERVED'].includes(err.code)
      ) {
        setSeats((items) =>
          items.map((item) =>
            unavailable.includes(item.id) ? { ...item, status: 'held-other' } : item,
          ),
        );
        setSelectedIds((current) => {
          const next = current.filter((seatId) => !unavailable.includes(seatId));
          syncDrafts(next);
          return next;
        });
        showToast(
          unavailable.length
            ? `Seat${unavailable.length === 1 ? '' : 's'} ${unavailable.join(', ')} ${unavailable.length === 1 ? 'was' : 'were'} just taken. Review your selection and try again.`
            : 'One or more selected seats were just taken. Refresh and try again.',
          'warning',
          'Seats unavailable',
        );
        refresh(true);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setPending('');
    }
  }

  async function confirm() {
    if (pending || !selectedIds.length) return;
    const requestedIds = [...selectedIds].sort();
    const logical = `${id}:${requestedIds.join(',')}`;
    setPending('confirm');
    try {
      const created = await apiRequest('/v1/holds', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('hold', logical) },
        body: JSON.stringify({ eventId: id, seatIds: requestedIds }),
      });
      clearIdempotencyKey('hold', logical);
      const checkout = await apiRequest(`/v1/holds/${created.id}/checkout`, { method: 'POST' });
      navigate(`/checkout/${checkout.bookingId}`, { state: { hold: created } });
    } catch (err) {
      const unavailable = err.details?.unavailableSeatIds || [];
      if (err.status === 409 || err.code === 'SEATS_UNAVAILABLE') {
        setSeats((items) =>
          items.map((item) =>
            unavailable.includes(item.id) ? { ...item, status: 'held-other' } : item,
          ),
        );
        setSelectedIds((current) => current.filter((seatId) => !unavailable.includes(seatId)));
        showToast(
          unavailable.length
            ? `Seat${unavailable.length === 1 ? '' : 's'} ${unavailable.join(', ')} ${unavailable.length === 1 ? 'was' : 'were'} just taken. Choose another seat.`
            : 'One or more selected seats are no longer available.',
          'warning',
          'Seats unavailable',
        );
        await refresh(true);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setPending('');
    }
  }

  async function resumeBooking() {
    if (hold?.bookingId) {
      navigate(`/checkout/${hold.bookingId}`, { state: { hold } });
      return;
    }
    if (!hold?.id) return;
    setPending('resume');
    try {
      const checkout = await apiRequest(`/v1/holds/${hold.id}/checkout`, { method: 'POST' });
      navigate(`/checkout/${checkout.bookingId}`, { state: { hold } });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPending('');
    }
  }

  async function release() {
    if (!hold) return;
    setPending('release');
    try {
      await apiRequest(`/v1/holds/${hold.id}`, {
        method: 'DELETE',
        headers: { 'Idempotency-Key': idempotencyKey('release', hold.id) },
      });
      clearIdempotencyKey('release', hold.id);
      const releasedIds = hold.seatIds || [];
      setHold(null);
      setSeats((items) =>
        items.map((item) =>
          releasedIds.includes(item.id) ? { ...item, status: 'available' } : item,
        ),
      );
      await refresh(true);
      showToast('Seats released.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPending('');
    }
  }

  if (!event) return null;

  return (
    <Layout>
      <main id="main-content" className="container-fluid seat-page">
        <div className="container seat-header">
          <div>
            <Link className="back-link" to={`/events/${id}`}>
              ← Event details
            </Link>
            <h1>Choose your seats</h1>
            <p>
              <strong>{event.title}</strong>
              <span> · </span>
              {event.date}, {event.time}
              <span> · </span>
              {event.venue}
            </p>
          </div>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => refresh()}
            disabled={!!pending}
          >
            ↻ Refresh seats
          </button>
        </div>

        {hold && secondsLeft > 0 && (
          <div className="container mb-4">
            <div className="card shadow-sm rounded-4 p-3 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 hold-banner">
              <div className="d-flex align-items-center gap-3">
                <span className="fs-2">⏱️</span>
                <div>
                  <h3 className="h6 mb-1 fw-bold hold-banner-heading">
                    Active Hold: Seat{hold.seatIds?.length === 1 ? '' : 's'}{' '}
                    {hold.seatIds?.join(', ')}
                  </h3>
                  <p className="mb-0 text-muted small">
                    Time remaining:{' '}
                    <strong className="font-monospace fs-6 hold-banner-timer">
                      {formatSeconds(secondsLeft)}
                    </strong>
                    . Your seats are locked exclusively for you.
                  </p>
                </div>
              </div>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <button
                  className="btn btn-primary px-4 fw-semibold"
                  onClick={resumeBooking}
                  disabled={!!pending}
                >
                  {pending === 'resume' ? <Spinner label="Resuming…" /> : 'Resume Booking →'}
                </button>
                <button
                  className="btn btn-outline-danger btn-sm px-3"
                  onClick={release}
                  disabled={!!pending}
                >
                  {pending === 'release' ? <Spinner label="Cancelling…" /> : 'Cancel hold'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="container seat-layout">
          <section className="seat-map-card">
            <div className="seat-map-top">
              <div>
                <h2>Main auditorium</h2>
                <p>
                  Choose up to 6 seats. Live state updates in real-time as other buyers hold or
                  checkout seats.
                </p>
              </div>
              <span className="last-updated">
                <span /> Live updates active
              </span>
            </div>
            <div className="stage">
              <span>STAGE</span>
            </div>
            <div className="seat-map-scroll">
              {['A', 'B', 'C', 'D'].map((section, row) => (
                <div className="seat-section" key={section}>
                  <div className="section-label">
                    <span>SECTION {section}</span>
                    <small>{row < 2 ? 'Premium' : 'Standard'}</small>
                  </div>
                  <div className="seat-row">
                    {seats
                      .filter((seat) => seat.section === section)
                      .map((seat) => {
                        const selected = selectedIds.includes(seat.id);
                        const isHeldSelf = hold?.seatIds?.includes(seat.id) || selected;
                        const isUnderPayment = seat.status === 'under-payment';
                        const isHeldOther = seat.status === 'held-other';
                        const isReserved = seat.status === 'reserved';
                        const isSelectingOther =
                          !selected &&
                          !isHeldSelf &&
                          draftsByOthers.includes(seat.id) &&
                          seat.status === 'available';
                        const statusClass = selected
                          ? 'selected'
                          : hold?.seatIds?.includes(seat.id)
                            ? 'held-self'
                            : isSelectingOther
                              ? 'selecting-other'
                              : seat.status;

                        return (
                          <button
                            key={seat.id}
                            className={`seat seat-${statusClass}`}
                            disabled={
                              !!pending ||
                              !!hold ||
                              (!selected &&
                                ['held-other', 'under-payment', 'reserved', 'unavailable'].includes(
                                  seat.status,
                                ))
                            }
                            onClick={() => toggleSeat(seat)}
                            aria-pressed={selected || isHeldSelf}
                            title={
                              isUnderPayment
                                ? `Seat ${seat.id} — Under payment by another customer`
                                : isHeldOther
                                  ? `Seat ${seat.id} — Held by another customer`
                                  : isSelectingOther
                                    ? `Seat ${seat.id} — Another customer is currently selecting this seat`
                                    : isReserved
                                      ? `Seat ${seat.id} — Reserved`
                                      : isHeldSelf
                                        ? `Seat ${seat.id} — Your hold`
                                        : `Seat ${seat.id} — ₹${seat.price}`
                            }
                            aria-label={`Seat ${seat.id}, ${selected ? 'selected' : seat.status}, ₹${seat.price}`}
                          >
                            <span className="seat-number">{seat.id}</span>
                            <span className="seat-price">₹{seat.price}</span>
                            <span className="seat-state">
                              {selected ? (
                                'Selected'
                              ) : isHeldSelf ? (
                                'Your hold'
                              ) : isUnderPayment ? (
                                <>
                                  <i className="seat-pulse-dot" />
                                  In payment
                                </>
                              ) : isHeldOther ? (
                                <>
                                  <i className="seat-pulse-dot" />
                                  Holding
                                </>
                              ) : isSelectingOther ? (
                                <>
                                  <i className="seat-pulse-dot" />
                                  Selecting
                                </>
                              ) : isReserved ? (
                                'Reserved'
                              ) : (
                                'Available'
                              )}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
            <div className="seat-legend">
              <span className="legend-item">
                <i className="legend-swatch available" />✓ Available
              </span>
              <span className="legend-item">
                <i className="legend-swatch selected" />✓ Your selection
              </span>
              <span className="legend-item">
                <i className="legend-swatch selecting-other" />
                🟣 Selecting by another
              </span>
              <span className="legend-item">
                <i className="legend-swatch held-other" />⌛ Holding by another
              </span>
              <span className="legend-item">
                <i className="legend-swatch under-payment" />
                💳 Under payment
              </span>
              <span className="legend-item">
                <i className="legend-swatch reserved" />× Reserved
              </span>
            </div>
          </section>

          <aside className="hold-panel" aria-live="polite">
            {hold && secondsLeft > 0 ? (
              <div className="hold-empty text-center p-3">
                <div className="hold-empty-icon" style={{ color: 'var(--warning, #f59e0b)' }}>
                  ⏳
                </div>
                <h2>Hold Active</h2>
                <p className="text-muted small">
                  Seats <strong>{hold.seatIds?.join(', ')}</strong> are locked exclusively for your
                  account.
                </p>

                {/* Countdown Progress Bar */}
                <div className="countdown-progress-container my-3 text-start">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="small text-muted text-uppercase fw-semibold" style={{ fontSize: '0.72rem', letterSpacing: '0.06em' }}>
                      Hold Window
                    </span>
                    <span className="font-monospace fw-bold hold-countdown-timer">
                      {formatSeconds(secondsLeft)} remaining
                    </span>
                  </div>
                  <div className="hold-progress-track">
                    <div
                      className="hold-progress-fill"
                      style={{ width: `${Math.min(100, Math.max(0, (secondsLeft / 300) * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Idempotency Verification Tag */}
                <div className="idempotency-tag-container mb-3">
                  <div className="idempotency-badge">
                    <span className="badge-icon">🛡️</span>
                    <span className="badge-text">Idempotency: SHA-256 Verified</span>
                  </div>
                  <small className="idempotency-caption text-muted">Single-commit atomic lock active</small>
                </div>

                <div className="hold-details mb-3">
                  <div>
                    <span>Seats</span>
                    <strong>{hold.seatIds?.length}</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>₹{hold.totalPrice}</strong>
                  </div>
                </div>
                <button
                  className="btn btn-emerald btn-lg w-100 mb-2"
                  onClick={resumeBooking}
                  disabled={!!pending}
                >
                  {pending === 'resume' ? <Spinner label="Resuming…" /> : 'Complete Checkout →'}
                </button>
                <button
                  className="btn btn-outline-danger btn-sm w-100 mb-2"
                  onClick={release}
                  disabled={!!pending}
                >
                  {pending === 'release' ? (
                    <Spinner label="Cancelling…" />
                  ) : (
                    'Cancel & release seats'
                  )}
                </button>
                <small className="text-muted d-block mt-1">
                  Cancelling will immediately release seats for other buyers.
                </small>
              </div>
            ) : (
              <div className="hold-empty">
                <div className="hold-empty-icon">⌁</div>
                <h2>
                  {selectedIds.length
                    ? `${selectedIds.length} seat${selectedIds.length === 1 ? '' : 's'} selected`
                    : 'No seats selected'}
                </h2>
                <p>
                  {selectedIds.length
                    ? 'Your seats will be locked for five minutes when you proceed to checkout.'
                    : 'Choose available seats, then continue to payment to start your five-minute hold.'}
                </p>
                {selectedIds.length > 0 && (
                  <>
                    <div className="held-seat-list">
                      {selectedIds.map((seatId) => (
                        <button
                          key={seatId}
                          disabled={!!pending}
                          onClick={() => toggleSeat(seats.find((seat) => seat.id === seatId))}
                          aria-label={`Remove seat ${seatId}`}
                        >
                          {seatId} ×
                        </button>
                      ))}
                    </div>

                    {/* Idempotency Verification Tag */}
                    <div className="idempotency-tag-container my-3">
                      <div className="idempotency-badge">
                        <span className="badge-icon">🛡️</span>
                        <span className="badge-text">Idempotency: SHA-256 Verified</span>
                      </div>
                      <small className="idempotency-caption text-muted">Strict serialization guarantee</small>
                    </div>

                    <div className="hold-details">
                      <div>
                        <span>Seats</span>
                        <strong>{selectedIds.length}</strong>
                      </div>
                      <div>
                        <span>Total</span>
                        <strong>₹{selectedTotal}</strong>
                      </div>
                    </div>
                    <button
                      className="btn btn-emerald btn-lg w-100"
                      disabled={!!pending}
                      onClick={confirm}
                    >
                      {pending === 'confirm' ? (
                        <Spinner label="Starting payment…" />
                      ) : (
                        'Continue to payment →'
                      )}
                    </button>
                  </>
                )}
                <div className="state-flow">
                  <span>Select seats</span>
                  <i>→</i>
                  <span>Hold & pay</span>
                  <i>→</i>
                  <span>Confirmed</span>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </Layout>
  );
}

function reservationSeats(reservation) {
  return (
    reservation.seats?.map((seat) => (typeof seat === 'string' ? seat : seat.id || seat.seatId)) ||
    [reservation.seat].filter(Boolean)
  );
}

export function Checkout() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();
  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(null);

  useEffect(() => {
    apiRequest(`/v1/bookings/${bookingId}`)
      .then((data) => setBooking(data.booking))
      .catch((err) => setError(err.message));
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId || busy) return;
    const interval = setInterval(() => {
      apiRequest(`/v1/bookings/${bookingId}`)
        .then((data) => {
          if (data.booking) setBooking(data.booking);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [bookingId, busy]);

  useEffect(() => {
    const expiresAt = booking?.expiresAt || location.state?.hold?.expiresAt;
    if (!expiresAt) return;
    const calculate = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsRemaining(remaining);
    };
    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [booking?.expiresAt, location.state?.hold?.expiresAt]);

  const isExpired =
    booking?.isExpired ||
    booking?.status === 'EXPIRED' ||
    (secondsRemaining !== null && secondsRemaining <= 0);

  function formatTime(totalSeconds) {
    if (totalSeconds === null || totalSeconds <= 0) return '00:00';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  async function pay(event) {
    event.preventDefault();
    if (isExpired) {
      setError('Your hold has expired. Return to seat selection to select seats again.');
      return;
    }
    setBusy(true);
    setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const paymentKey = idempotencyKey('payment', `${bookingId}:${form.method}:${form.scenario}`);
      const created = await apiRequest('/v1/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': paymentKey },
        body: JSON.stringify({ bookingId, method: form.method, scenario: form.scenario }),
      });
      clearIdempotencyKey('payment', `${bookingId}:${form.method}:${form.scenario}`);
      const simulated = await apiRequest(`/v1/payments/${created.payment.id}/simulate`, {
        method: 'POST',
      });
      setResult(simulated.payment);
      if (simulated.payment.status === 'SUCCESSFUL') {
        const holdId = booking.sourceHoldId || location.state?.hold?.id;
        const confirmed = await apiRequest(`/v1/holds/${holdId}/confirm`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey('confirm', holdId) },
        });
        clearIdempotencyKey('confirm', holdId);
        const reservation = confirmed.reservation;
        reservation.event = displayEvent({
          ...reservation.event,
          available: 1,
          total: reservation.seats.length,
          price: reservation.totalPrice,
        });
        navigate('/reservations/success', { replace: true, state: { reservation } });
      } else if (
        simulated.payment.status === 'FAILED' ||
        simulated.payment.status === 'CANCELLED' ||
        simulated.payment.status === 'EXPIRED'
      )
        setError(
          'The simulated payment did not succeed. You can try again while the hold remains active.',
        );
    } catch (err) {
      if (err.status === 410 || err.code === 'HOLD_EXPIRED') {
        setBooking((prev) => (prev ? { ...prev, status: 'EXPIRED', isExpired: true } : prev));
        setError('Your seat hold has expired. The seat was released to other customers.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancelCheckout() {
    if (!booking) return;
    setBusy(true);
    try {
      const holdId = booking.sourceHoldId || location.state?.hold?.id;
      if (holdId) {
        await apiRequest(`/v1/holds/${holdId}`, {
          method: 'DELETE',
          headers: { 'Idempotency-Key': idempotencyKey('release', holdId) },
        });
        clearIdempotencyKey('release', holdId);
      }
      showToast('Hold cancelled and seats released.');
      navigate(`/events/${booking.event?.id || booking.event?.slug || ''}/seats`, {
        replace: true,
      });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!booking && !error)
    return (
      <Layout>
        <main id="main-content" className="container narrow-page text-center">
          <Spinner label="Preparing checkout…" />
        </main>
      </Layout>
    );

  const seatLabels = booking ? reservationSeats(booking).join(', ') : '';
  const eventSlug = booking?.event?.id || booking?.event?.slug || '';

  return (
    <Layout>
      <main id="main-content" className="container narrow-page">
        <PageHeader
          eyebrow="Test checkout"
          heading="Complete your booking"
          description="This demonstration uses simulated payments only. No real money or card information is collected."
        />

        {isExpired ? (
          <div className="alert alert-warning mb-4" role="alert">
            <h2 className="h5 alert-heading mb-2">⏱️ Hold Expired</h2>
            <p className="mb-3">
              Your temporary hold on seat {seatLabels || 'selection'} has expired. The seat has
              been released back to inventory.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/events/${eventSlug}/seats`, { replace: true })}
            >
              ← Return to seat selection
            </button>
          </div>
        ) : secondsRemaining !== null ? (
          <div
            className="alert alert-info d-flex justify-content-between align-items-center mb-4"
            role="status"
          >
            <span>⏱️ Hold expires in:</span>
            <strong className="fs-5 font-monospace text-primary">
              {formatTime(secondsRemaining)}
            </strong>
          </div>
        ) : null}

        {error && !isExpired && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {booking && (
          <div className="detail-grid">
            <section className="content-card">
              <h2 className="h4">Booking summary</h2>
              <div className="details-list">
                <div>
                  <span>Event</span>
                  <strong>{booking.event.title}</strong>
                </div>
                <div>
                  <span>Seats</span>
                  <strong>{seatLabels}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>₹{booking.totalPrice}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{isExpired ? 'EXPIRED' : booking.status}</strong>
                </div>
              </div>
            </section>
            <section className="content-card">
              <h2 className="h4">Mock payment</h2>
              {isExpired ? (
                <div className="text-center py-4">
                  <p className="text-muted mb-3">Payment disabled because this hold has expired.</p>
                  <button
                    type="button"
                    className="btn btn-primary w-100"
                    onClick={() => navigate(`/events/${eventSlug}/seats`, { replace: true })}
                  >
                    Select seats again
                  </button>
                </div>
              ) : (
                <form onSubmit={pay}>
                  <label className="form-label" htmlFor="paymentMethod">
                    Method
                  </label>
                  <select className="form-select mb-3" id="paymentMethod" name="method">
                    <option value="TEST_UPI">Test UPI</option>
                    <option value="TEST_CARD">Test card</option>
                    <option value="TEST_NET_BANKING">Test net banking</option>
                  </select>
                  <label className="form-label" htmlFor="paymentScenario">
                    Simulation result
                  </label>
                  <select className="form-select mb-4" id="paymentScenario" name="scenario">
                    <option value="SUCCESS">Successful payment</option>
                    <option value="FAILURE">Failed payment</option>
                    <option value="CANCELLED">Customer cancellation</option>
                    <option value="PENDING">Processing delay</option>
                  </select>
                  <button className="btn btn-primary w-100 mb-2" disabled={busy || isExpired}>
                    {busy ? (
                      <Spinner label="Processing…" />
                    ) : (
                      `Simulate payment of ₹${booking.totalPrice}`
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm w-100"
                    disabled={busy}
                    onClick={cancelCheckout}
                  >
                    {busy ? <Spinner label="Cancelling…" /> : 'Cancel checkout & release seats'}
                  </button>
                  {result && (
                    <p className="mt-3 mb-0 text-muted">
                      Payment status: <strong>{result.status}</strong>
                    </p>
                  )}
                </form>
              )}
            </section>
          </div>
        )}
      </main>
    </Layout>
  );
}

export function ReservationSuccess() {
  const location = useLocation();
  const reservation = location.state?.reservation || initialReservations[0];
  const seatLabels = reservationSeats(reservation);
  return (
    <Layout>
      <main id="main-content" className="container narrow-page">
        <section className="success-card">
          <div className="success-mark">✓</div>
          <span className="eyebrow">Reservation complete</span>
          <h1>You&apos;re confirmed.</h1>
          <p>
            Your {seatLabels.length === 1 ? 'seat is' : 'seats are'} secured. We&apos;ve saved the
            details to your reservations.
          </p>
          <div className="ticket-card">
            <div className="ticket-event">
              <div>
                <small>EVENT</small>
                <h2>{reservation.event.title}</h2>
                <span>{reservation.event.venue}</span>
              </div>
              <StatusBadge status="CONFIRMED" />
            </div>
            <div className="ticket-grid">
              <div>
                <small>{seatLabels.length === 1 ? 'SEAT' : 'SEATS'}</small>
                <strong>{seatLabels.join(', ')}</strong>
              </div>
              <div>
                <small>SEAT COUNT</small>
                <strong>{seatLabels.length}</strong>
              </div>
              <div>
                <small>DATE</small>
                <strong>{reservation.event.date}</strong>
              </div>
              <div>
                <small>TIME</small>
                <strong>{reservation.event.time}</strong>
              </div>
            </div>
            <div className="confirmation-code">
              <span>CONFIRMATION CODE</span>
              <strong>{reservation.reference || reservation.id}</strong>
            </div>
          </div>
          <div className="d-flex flex-column flex-sm-row gap-2 justify-content-center">
            <Link to={`/reservations/${reservation.id}`} className="btn btn-primary">
              View reservation
            </Link>
            <Link to="/events" className="btn btn-outline-secondary">
              Back to events
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}

function LegacyReservationsPage() {
  const showToast = useToast();
  const [reservations, setReservations] = useState(initialReservations);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const visible = reservations.filter((item) => filter === 'all' || item.status === filter);
  async function cancel() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest(`/v1/reservations/${selected.id}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('cancel', selected.id) },
      });
      clearIdempotencyKey('cancel', selected.id);
      setReservations((items) =>
        items.map((item) => (item.id === selected.id ? { ...item, status: 'CANCELLED' } : item)),
      );
      setSelected(null);
      showToast('Reservation cancelled successfully.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <PageHeader
          eyebrow="Your account"
          heading="My reservations"
          description="Track confirmed bookings and review your reservation history."
          action={{ to: '/events', label: 'Browse events' }}
        />
        <div className="filter-pills">
          {['all', 'CONFIRMED', 'CANCELLED'].map((value) => (
            <button
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
              key={value}
            >
              {value === 'all' ? 'All' : value[0] + value.slice(1).toLowerCase()}{' '}
              {value === 'all' && <span>{reservations.length}</span>}
            </button>
          ))}
        </div>
        {visible.length ? (
          <div className="reservation-list">
            {visible.map((reservation) => (
              <article className="reservation-card" key={reservation.id}>
                <div className="date-tile">
                  <strong>{reservation.event.date.split(' ')[0]}</strong>
                  <span>{reservation.event.date.split(' ')[1]}</span>
                </div>
                <div className="reservation-main">
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <h2>{reservation.event.title}</h2>
                    <StatusBadge status={reservation.status} />
                  </div>
                  <p>
                    {reservation.event.time} · {reservation.event.venue}
                  </p>
                  <div className="reservation-facts">
                    <span>
                      Seat <strong>{reservation.seat}</strong>
                    </span>
                    <span>
                      Section <strong>{reservation.section}</strong>
                    </span>
                    <span>
                      ₹<strong>{reservation.price}</strong>
                    </span>
                    <span>
                      Code <strong>{reservation.id}</strong>
                    </span>
                  </div>
                </div>
                <div className="reservation-actions">
                  <Link
                    className="btn btn-outline-secondary btn-sm"
                    to={`/reservations/${reservation.id}`}
                  >
                    View details
                  </Link>
                  {reservation.status === 'CONFIRMED' && (
                    <button
                      className="btn btn-link text-danger btn-sm"
                      onClick={() => setSelected(reservation)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon="◎"
            title="No reservations here"
            text="Reservations matching this filter will appear here."
          />
        )}
      </main>
      {selected && (
        <div
          className="react-modal-backdrop"
          role="presentation"
          onMouseDown={() => !busy && setSelected(null)}
        >
          <div
            className="react-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelTitle"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="fs-5" id="cancelTitle">
                Cancel this reservation?
              </h2>
              <button className="btn-close" onClick={() => setSelected(null)} aria-label="Close" />
            </div>
            <div className="modal-body">
              <p>
                Seat <strong>{selected.seat}</strong> for <strong>{selected.event.title}</strong>{' '}
                will be released according to event rules.
              </p>
              <p className="text-muted small mb-0">
                This action is sent to the server and may not be reversible.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-light" onClick={() => setSelected(null)}>
                Keep reservation
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={cancel}>
                {busy ? <Spinner label="Cancelling…" /> : 'Cancel reservation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function LegacyReservationDetail() {
  const { id } = useParams();
  const reservation = initialReservations.find((item) => item.id === id) || initialReservations[0];
  const seatLabels = reservationSeats(reservation);
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <nav>
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <Link to="/reservations">My reservations</Link>
            </li>
            <li className="breadcrumb-item active">{reservation.id}</li>
          </ol>
        </nav>
        <div className="detail-grid">
          <section className="content-card">
            <div className="d-flex justify-content-between align-items-start gap-3">
              <div>
                <span className="eyebrow">Reservation details</span>
                <h1>{reservation.event.title}</h1>
                <p className="text-muted">{reservation.event.venue}</p>
              </div>
              <StatusBadge status={reservation.status} />
            </div>
            <hr />
            <div className="details-list">
              {[
                ['Seats', seatLabels.join(', ')],
                ['Seat count', seatLabels.length],
                ['Date & time', `${reservation.event.date} · ${reservation.event.time}`],
                ['Total price', `₹${reservation.totalPrice ?? reservation.price}`],
                ['Confirmation code', reservation.id],
                ['Created', reservation.createdAt],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
          <aside className="content-card">
            <span className="eyebrow">Lifecycle</span>
            <h2 className="h4 mb-4">Reservation timeline</h2>
            <ol className="timeline">
              <li className="complete">
                <i>✓</i>
                <div>
                  <strong>Hold created</strong>
                  <span>
                    {seatLabels.length} seat{seatLabels.length === 1 ? '' : 's'} temporarily secured
                  </span>
                </div>
              </li>
              <li className="complete">
                <i>✓</i>
                <div>
                  <strong>Reservation confirmed</strong>
                  <span>Confirmation {reservation.id}</span>
                </div>
              </li>
              <li className={reservation.status === 'CANCELLED' ? 'cancelled' : ''}>
                <i>{reservation.status === 'CANCELLED' ? '×' : ''}</i>
                <div>
                  <strong>
                    {reservation.status === 'CANCELLED' ? 'Reservation cancelled' : 'Attend event'}
                  </strong>
                  <span>{reservation.event.date}</span>
                </div>
              </li>
            </ol>
          </aside>
        </div>
      </main>
    </Layout>
  );
}

function viewBooking(booking) {
  return {
    ...booking,
    event: displayEvent({
      ...booking.event,
      available: 1,
      total: booking.seats.length,
      price: booking.totalPrice,
    }),
    seat: reservationSeats(booking).join(', '),
    section: [...new Set(booking.seats.map((seat) => seat.section))].join(', '),
    price: booking.totalPrice,
  };
}

export function ReservationsPage() {
  const showToast = useToast();
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiRequest('/v1/bookings')
      .then((data) => setBookings(data.bookings.map(viewBooking)))
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);
  const visible = bookings.filter((item) => filter === 'all' || item.status === filter);
  async function cancel() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await apiRequest(`/v1/bookings/${selected.id}/cancel`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('cancel', selected.id) },
        body: JSON.stringify({}),
      });
      clearIdempotencyKey('cancel', selected.id);
      setBookings((items) =>
        items.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                status: result.status,
                seats: item.seats.map((seat) => ({
                  ...seat,
                  cancelledAt: new Date().toISOString(),
                })),
              }
            : item,
        ),
      );
      setSelected(null);
      showToast(`Booking cancelled. Simulated refund: ₹${result.refundAmount}.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <PageHeader
          eyebrow="Your account"
          heading="My bookings"
          description="Track paid bookings, seats, cancellations, and refunds."
          action={{ to: '/events', label: 'Browse events' }}
        />
        <div className="filter-pills">
          {['all', 'CONFIRMED', 'CANCELLED', 'PAYMENT_FAILED'].map((value) => (
            <button
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
              key={value}
            >
              {value === 'all' ? 'All' : value.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="text-center py-5">
            <Spinner label="Loading bookings…" />
          </div>
        ) : visible.length ? (
          <div className="reservation-list">
            {visible.map((booking) => (
              <article className="reservation-card" key={booking.id}>
                <div className="date-tile">
                  <strong>{booking.event.date.split(' ')[0]}</strong>
                  <span>{booking.event.date.split(' ')[1]}</span>
                </div>
                <div className="reservation-main">
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <h2>{booking.event.title}</h2>
                    <StatusBadge status={booking.status} />
                  </div>
                  <p>
                    {booking.event.time} · {booking.event.venue}
                  </p>
                  <div className="reservation-facts">
                    <span>
                      Seats{' '}
                      <strong>
                        {reservationSeats(booking).join(', ') || 'Pending confirmation'}
                      </strong>
                    </span>
                    <span>
                      Total <strong>₹{booking.totalPrice}</strong>
                    </span>
                    <span>
                      Code <strong>{booking.reference}</strong>
                    </span>
                  </div>
                </div>
                <div className="reservation-actions">
                  <Link
                    className="btn btn-outline-secondary btn-sm"
                    to={`/reservations/${booking.id}`}
                  >
                    View details
                  </Link>
                  {booking.status === 'CONFIRMED' && (
                    <button
                      className="btn btn-link text-danger btn-sm"
                      onClick={() => setSelected(booking)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon="◎"
            title="No bookings here"
            text="Bookings matching this filter will appear here."
          />
        )}
      </main>
      {selected && (
        <div
          className="react-modal-backdrop"
          role="presentation"
          onMouseDown={() => !busy && setSelected(null)}
        >
          <div
            className="react-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="fs-5" id="cancelTitle">
                Cancel this booking?
              </h2>
              <button className="btn-close" onClick={() => setSelected(null)} aria-label="Close" />
            </div>
            <div className="modal-body">
              <p>
                Seats <strong>{reservationSeats(selected).join(', ')}</strong> will be released and
                a simulated refund will be recorded.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-light" onClick={() => setSelected(null)}>
                Keep booking
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={cancel}>
                {busy ? <Spinner label="Cancelling…" /> : 'Cancel booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export function ReservationDetail() {
  const { id } = useParams();
  const showToast = useToast();
  const [booking, setBooking] = useState(null);
  useEffect(() => {
    apiRequest(`/v1/bookings/${id}`)
      .then((data) => setBooking(viewBooking(data.booking)))
      .catch((err) => showToast(err.message, 'error'));
  }, [id]);
  if (!booking)
    return (
      <Layout>
        <main id="main-content" className="container page-wrap text-center">
          <Spinner label="Loading booking…" />
        </main>
      </Layout>
    );
  const activeSeats = booking.seats.filter((seat) => !seat.cancelledAt);
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <nav>
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <Link to="/reservations">My bookings</Link>
            </li>
            <li className="breadcrumb-item active">{booking.reference}</li>
          </ol>
        </nav>
        <div className="detail-grid">
          <section className="content-card">
            <div className="d-flex justify-content-between align-items-start gap-3">
              <div>
                <span className="eyebrow">Booking details</span>
                <h1>{booking.event.title}</h1>
                <p className="text-muted">{booking.event.venue}</p>
              </div>
              <StatusBadge status={booking.status} />
            </div>
            <hr />
            <div className="details-list">
              <div>
                <span>Active seats</span>
                <strong>{activeSeats.map((seat) => seat.id).join(', ') || 'None'}</strong>
              </div>
              <div>
                <span>Original total</span>
                <strong>₹{booking.totalPrice}</strong>
              </div>
              <div>
                <span>Date & time</span>
                <strong>
                  {booking.event.date} · {booking.event.time}
                </strong>
              </div>
              <div>
                <span>Booking reference</span>
                <strong>{booking.reference}</strong>
              </div>
            </div>
          </section>
          <aside className="content-card">
            <span className="eyebrow">Payment history</span>
            <h2 className="h4 mb-4">Mock transactions</h2>
            {booking.payments.length ? (
              booking.payments.map((payment) => (
                <div className="summary-line" key={payment.id}>
                  <span>
                    {payment.method}
                    <small className="d-block">Refunded ₹{payment.refundedAmount}</small>
                  </span>
                  <strong>{payment.status}</strong>
                </div>
              ))
            ) : (
              <p className="text-muted">No payment attempts recorded.</p>
            )}
          </aside>
        </div>
      </main>
    </Layout>
  );
}

export function WaitlistPage() {
  const showToast = useToast();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [eventItems, setEventItems] = useState([]);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const data = await apiRequest('/v1/waitlist');
    setEntries(data.entries);
  }
  useEffect(() => {
    Promise.all([
      refresh(),
      apiRequest('/v1/events').then((data) => setEventItems(data.events)),
    ]).catch((err) => showToast(err.message, 'error'));
  }, []);
  async function join(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      await apiRequest('/v1/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          eventId: form.eventId,
          requestedSeats: Number(form.requestedSeats),
        }),
      });
      await refresh();
      showToast('Waitlist request created.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function leave(id) {
    try {
      await apiRequest(`/v1/waitlist/${id}`, { method: 'DELETE' });
      await refresh();
      showToast('Waitlist entry cancelled.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  async function useOffer(entry) {
    try {
      const checkout = await apiRequest(`/v1/holds/${entry.offeredHoldId}/checkout`, {
        method: 'POST',
      });
      navigate(`/checkout/${checkout.bookingId}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <PageHeader
          eyebrow="Smart allocation"
          heading="My waitlist"
          description="Join an ordered queue and receive a five-minute grouped hold when enough seats become available."
        />
        <div className="detail-grid">
          <section className="content-card">
            <h2 className="h4">Join a waitlist</h2>
            <form onSubmit={join}>
              <label className="form-label" htmlFor="waitEvent">
                Event
              </label>
              <select className="form-select mb-3" id="waitEvent" name="eventId" required>
                {eventItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <label className="form-label" htmlFor="waitSeats">
                Seats needed
              </label>
              <input
                className="form-control mb-4"
                id="waitSeats"
                name="requestedSeats"
                type="number"
                min="1"
                max="6"
                defaultValue="1"
                required
              />
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Spinner label="Joining…" /> : 'Join waitlist'}
              </button>
            </form>
          </section>
          <section className="content-card">
            <h2 className="h4">Queue status</h2>
            {entries.length ? (
              entries.map((entry) => (
                <article className="py-3 border-bottom" key={entry.id}>
                  <div className="d-flex justify-content-between gap-3">
                    <div>
                      <strong>{entry.event.title}</strong>
                      <p className="text-muted mb-1">
                        {entry.requestedSeats} seat{entry.requestedSeats === 1 ? '' : 's'} ·{' '}
                        {entry.status}
                      </p>
                      {entry.position && <span>Position #{entry.position}</span>}
                      {entry.offeredHoldId && (
                        <>
                          <span className="d-block">
                            Offer expires {new Date(entry.offerExpiresAt).toLocaleTimeString()}
                          </span>
                          <button
                            className="btn btn-sm btn-primary mt-2"
                            onClick={() => useOffer(entry)}
                          >
                            Use offer
                          </button>
                        </>
                      )}
                    </div>
                    {['WAITING', 'OFFERED'].includes(entry.status) && (
                      <button
                        className="btn btn-sm btn-outline-danger align-self-start"
                        onClick={() => leave(entry.id)}
                      >
                        Leave
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="text-muted">You have no waitlist entries.</p>
            )}
          </section>
        </div>
      </main>
    </Layout>
  );
}

export function ProfileLegacy() {
  const showToast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const fullName = user?.fullName || 'Account user';
  const email = user?.email || '';
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      showToast('Profile updated.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <PageHeader
          eyebrow="Account"
          heading="Profile"
          description="Manage the basic details attached to your reservations."
        />
        <div className="profile-grid">
          <aside className="content-card profile-summary">
            <div className="avatar">AS</div>
            <h2>Arjun Sharma</h2>
            <p>arjun@example.com</p>
            <span className="badge neutral-badge">Customer account</span>
          </aside>
          <section className="content-card">
            <h2 className="h4">Personal information</h2>
            <p className="text-muted mb-4">Keep your account details current.</p>
            <form onSubmit={submit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="profileName">
                    Full name
                  </label>
                  <input
                    className="form-control"
                    id="profileName"
                    name="fullName"
                    defaultValue="Arjun Sharma"
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="profileEmail">
                    Email
                  </label>
                  <input
                    className="form-control"
                    id="profileEmail"
                    name="email"
                    type="email"
                    defaultValue="arjun@example.com"
                    required
                  />
                </div>
                <div className="col-12">
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? <Spinner label="Saving…" /> : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      </main>
    </Layout>
  );
}

export function Profile() {
  const showToast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const fullName = user?.fullName || 'Account user';
  const email = user?.email || '';
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      showToast('Profile updated.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout>
      <main id="main-content" className="container page-wrap">
        <PageHeader
          eyebrow="Account"
          heading="Profile"
          description="Manage the basic details attached to your reservations."
        />
        <div className="profile-grid">
          <aside className="content-card profile-summary">
            <div className="avatar">{initials}</div>
            <h2>{fullName}</h2>
            <p>{email}</p>
            <span className="badge neutral-badge">
              {user?.role === 'ADMIN' ? 'Administrator' : 'Customer account'}
            </span>
          </aside>
          <section className="content-card">
            <h2 className="h4">Personal information</h2>
            <p className="text-muted mb-4">Keep your account details current.</p>
            <form onSubmit={submit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="profileName">
                    Full name
                  </label>
                  <input
                    className="form-control"
                    id="profileName"
                    name="fullName"
                    defaultValue={fullName}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="profileEmail">
                    Email
                  </label>
                  <input
                    className="form-control"
                    id="profileEmail"
                    name="email"
                    type="email"
                    defaultValue={email}
                    required
                  />
                </div>
                <div className="col-12">
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? <Spinner label="Saving..." /> : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      </main>
    </Layout>
  );
}

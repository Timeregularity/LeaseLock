import { Router } from 'express';
import { pool } from '../db/pool.js';
import { eventSelect, toEvent } from '../events/queries.js';
import { subscribeToSeatEvents, updateClientDraft } from '../realtime/seat-events.js';
import { optionalAuth } from '../middleware/auth.js';
import { expireHolds } from '../holds/service.js';

export const eventsRouter = Router();

eventsRouter.get('/', async (request, response, next) => {
  try {
    const result = await pool.query(`${eventSelect}
      WHERE e.status='PUBLISHED'
      GROUP BY e.id ORDER BY e.starts_at ASC`);
    response.json({ events: result.rows.map(toEvent) });
  } catch (error) {
    next(error);
  }
});

eventsRouter.get('/:identifier/seat-events', async (request, response, next) => {
  try {
    const event = await pool.query(
      "SELECT slug FROM events WHERE (id::text=$1 OR slug=$1) AND status='PUBLISHED'",
      [request.params.identifier],
    );
    if (!event.rowCount)
      return response
        .status(404)
        .json({ code: 'EVENT_NOT_FOUND', message: 'The event could not be found.' });
    response
      .status(200)
      .set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
    response.flushHeaders();
    const clientId = String(request.query.clientId || '');
    const unsubscribe = subscribeToSeatEvents(event.rows[0].slug, response, clientId);
    const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 20_000);
    heartbeat.unref();
    request.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    next(error);
  }
});

eventsRouter.post('/:identifier/drafts', async (request, response, next) => {
  try {
    const { clientId, seatIds = [] } = request.body || {};
    if (!clientId) return response.status(400).json({ code: 'CLIENT_ID_REQUIRED' });
    const event = await pool.query(
      "SELECT slug FROM events WHERE (id::text=$1 OR slug=$1) AND status='PUBLISHED'",
      [request.params.identifier],
    );
    if (!event.rowCount) return response.status(404).json({ code: 'EVENT_NOT_FOUND' });
    updateClientDraft(event.rows[0].slug, String(clientId), Array.isArray(seatIds) ? seatIds : []);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

eventsRouter.get('/:identifier', async (request, response, next) => {
  try {
    const result = await pool.query(
      `${eventSelect}
      WHERE (e.id::text=$1 OR e.slug=$1) AND e.status='PUBLISHED'
      GROUP BY e.id`,
      [request.params.identifier],
    );
    if (!result.rowCount)
      return response
        .status(404)
        .json({ code: 'EVENT_NOT_FOUND', message: 'The event could not be found.' });
    response.json({ event: toEvent(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

eventsRouter.get('/:identifier/seats', optionalAuth, async (request, response, next) => {
  try {
    await expireHolds(pool);
    const event = await pool.query(
      "SELECT id, slug FROM events WHERE (id::text=$1 OR slug=$1) AND status='PUBLISHED'",
      [request.params.identifier],
    );
    if (!event.rowCount)
      return response
        .status(404)
        .json({ code: 'EVENT_NOT_FOUND', message: 'The event could not be found.' });
    const result = await pool.query(
      `
      SELECT es.id, es.seat_label, es.section, es.row_label, es.seat_number, es.price_paise, es.is_enabled,
        CASE WHEN NOT es.is_enabled THEN 'UNAVAILABLE'
             WHEN bs.event_seat_id IS NOT NULL THEN 'RESERVED'
             WHEN sc.event_seat_id IS NOT NULL THEN
               CASE WHEN $2::uuid IS NOT NULL AND h.user_id = $2::uuid THEN 'HELD_SELF'
                    WHEN b.id IS NOT NULL THEN 'PAYMENT_IN_PROGRESS'
                    ELSE 'HELD_OTHER' END
             ELSE 'AVAILABLE' END AS status
      FROM event_seats es
      LEFT JOIN seat_claims sc ON sc.event_seat_id=es.id AND sc.expires_at > now()
      LEFT JOIN holds h ON h.id=sc.hold_id
      LEFT JOIN bookings b ON b.source_hold_id=h.id AND b.status='PENDING_PAYMENT'
      LEFT JOIN booking_seats bs ON bs.event_seat_id=es.id AND bs.cancelled_at IS NULL
      WHERE es.event_id=$1 ORDER BY es.section, es.row_label, es.seat_number, es.seat_label
    `,
      [event.rows[0].id, request.user?.id || null],
    );
    response.json({
      eventId: event.rows[0].slug,
      seats: result.rows.map((row) => ({
        id: row.seat_label,
        databaseId: row.id,
        section: row.section,
        row: row.row_label,
        number: row.seat_number,
        price: Number(row.price_paise) / 100,
        status: row.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

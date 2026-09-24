import { randomBytes } from 'node:crypto';

export function bookingReference() {
  return `LL-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function getBooking(client, id, userId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT b.*,
            h.status AS hold_status,
            h.expires_at AS hold_expires_at,
            e.slug,
            e.name AS event_name,
            e.venue,
            e.starts_at,
            e.timezone,
            coalesce(
              json_agg(
                json_build_object(
                  'id', es.seat_label,
                  'section', bs.section,
                  'price', bs.price_paise::numeric / 100,
                  'passengerName', bs.passenger_name,
                  'cancelledAt', bs.cancelled_at
                ) ORDER BY es.seat_label
              ) FILTER (WHERE bs.event_seat_id IS NOT NULL),
              '[]'
            ) AS seats
     FROM bookings b
     JOIN events e ON e.id = b.event_id
     LEFT JOIN holds h ON h.id = b.source_hold_id
     LEFT JOIN booking_seats bs ON bs.booking_id = b.id
     LEFT JOIN event_seats es ON es.id = bs.event_seat_id
     WHERE (b.id::text = $1 OR b.reference = $1)
       AND b.user_id = $2
     GROUP BY b.id, e.id, h.id`,
    [id, userId],
  );
  return result.rows[0] || null;
}

export function toBooking(row) {
  const isHoldExpired =
    row.hold_status === 'EXPIRED' ||
    (row.hold_expires_at && new Date(row.hold_expires_at) <= new Date());
  const effectiveStatus =
    row.status !== 'CONFIRMED' && isHoldExpired ? 'EXPIRED' : row.status;

  return {
    id: row.id,
    reference: row.reference,
    status: effectiveStatus,
    sourceHoldId: row.source_hold_id,
    holdStatus: row.hold_status,
    expiresAt: row.hold_expires_at,
    isExpired: row.status !== 'CONFIRMED' && Boolean(isHoldExpired),
    subtotal: Number(row.subtotal_paise) / 100,
    fees: Number(row.fees_paise) / 100,
    totalPrice: Number(row.total_paise) / 100,
    currency: row.currency.trim(),
    createdAt: row.created_at,
    event: {
      id: row.slug,
      title: row.event_name,
      venue: row.venue,
      startsAt: row.starts_at,
      timezone: row.timezone,
    },
    seats: row.seats || [],
  };
}

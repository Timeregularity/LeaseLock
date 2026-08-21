import { pool } from '../server/db/pool.js'

const duplicateBookings = await pool.query(`
  SELECT event_seat_id
  FROM booking_seats
  WHERE cancelled_at IS NULL
  GROUP BY event_seat_id
  HAVING count(*) > 1
`)
const claims = await pool.query(`
  SELECT count(*)::int AS live_claims, count(DISTINCT event_seat_id)::int AS distinct_seats
  FROM seat_claims
  WHERE expires_at > now()
`)
console.log(JSON.stringify({
  duplicateLiveBookingSeats: duplicateBookings.rowCount,
  ...claims.rows[0],
  claimUniquenessPassed: claims.rows[0].live_claims === claims.rows[0].distinct_seats
}, null, 2))
await pool.end()

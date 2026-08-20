import { withTransaction } from '../db/pool.js'
import { expireHolds } from '../holds/service.js'
import { pool } from '../db/pool.js'
import { broadcastSeatChange } from '../realtime/seat-events.js'

export async function runHoldExpiry(){
  const events=await pool.query("SELECT DISTINCT e.slug FROM holds h JOIN events e ON e.id=h.event_id WHERE h.status='ACTIVE' AND h.expires_at<=now()")
  const count=await withTransaction(expireHolds)
  for(const event of events.rows)broadcastSeatChange(event.slug,'hold-expired')
  return count
}

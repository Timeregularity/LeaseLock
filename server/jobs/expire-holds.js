import { withTransaction } from '../db/pool.js'
import { expireHolds } from '../holds/service.js'
import { pool } from '../db/pool.js'
import { broadcastSeatChange } from '../realtime/seat-events.js'

export async function runHoldExpiry(){
  const {count,eventIds}=await withTransaction(async client=>{const expiring=await client.query("SELECT h.id,e.slug FROM holds h JOIN events e ON e.id=h.event_id WHERE h.status='ACTIVE' AND h.expires_at<=now() FOR UPDATE OF h");const eventIds=[...new Set(expiring.rows.map(row=>row.slug))];const count=await expireHolds(client);return{count,eventIds}})
  for(const eventId of eventIds)broadcastSeatChange(eventId,'hold-expired')
  return count
}

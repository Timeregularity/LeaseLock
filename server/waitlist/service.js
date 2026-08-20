import { createGroupedHold,expireHolds } from '../holds/service.js'

export async function promoteWaitlist(client) {
  await expireHolds(client)
  await client.query(`UPDATE waitlist_entries w SET status='EXPIRED',updated_at=now()
    FROM holds h WHERE w.offered_hold_id=h.id AND w.status='OFFERED' AND h.status IN('EXPIRED','RELEASED')`)
  const entries=await client.query(`SELECT w.*,e.slug FROM waitlist_entries w JOIN events e ON e.id=w.event_id
    WHERE w.status='WAITING' AND e.status='PUBLISHED' AND e.starts_at>now()
    ORDER BY w.position LIMIT 100 FOR UPDATE OF w SKIP LOCKED`)
  const blockedEvents=new Set();let promoted=0
  for(const entry of entries.rows){if(blockedEvents.has(entry.event_id))continue
    const active=await client.query("SELECT 1 FROM holds WHERE user_id=$1 AND status='ACTIVE'",[entry.user_id]);if(active.rowCount)continue
    const available=await client.query(`SELECT es.seat_label FROM event_seats es
      WHERE es.event_id=$1 AND es.is_enabled AND NOT EXISTS(SELECT 1 FROM seat_claims sc WHERE sc.event_seat_id=es.id AND sc.expires_at>now())
      AND NOT EXISTS(SELECT 1 FROM booking_seats bs WHERE bs.event_seat_id=es.id AND bs.cancelled_at IS NULL)
      ORDER BY es.section,es.row_label,es.seat_number,es.seat_label LIMIT $2`,[entry.event_id,entry.requested_seats])
    if(available.rowCount<entry.requested_seats){blockedEvents.add(entry.event_id);continue}
    try{const hold=await createGroupedHold(client,{userId:entry.user_id,eventIdentifier:entry.slug,seatLabels:available.rows.map(row=>row.seat_label),idempotencyKey:`waitlist-offer-${entry.id}`});await client.query("UPDATE waitlist_entries SET status='OFFERED',offered_hold_id=$1,offered_at=now(),updated_at=now() WHERE id=$2",[hold.id,entry.id]);promoted++}catch(error){if(!['ACTIVE_HOLD_EXISTS','SEATS_UNAVAILABLE'].includes(error.code))throw error}
  }
  return promoted
}

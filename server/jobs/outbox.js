import { pool } from '../db/pool.js'
import { broadcastSeatChange } from '../realtime/seat-events.js'

export async function runOutboxDelivery() {
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    const pending=await client.query("SELECT * FROM event_outbox WHERE published_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED")
    for(const event of pending.rows){
      try {
        if(event.topic==='seats-changed')broadcastSeatChange(event.aggregate_id,event.payload.reason)
        await client.query('UPDATE event_outbox SET published_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1',[event.id])
      } catch(error) {
        await client.query('UPDATE event_outbox SET attempts=attempts+1,last_error=$2 WHERE id=$1',[event.id,String(error.message).slice(0,1000)])
      }
    }
    await client.query('COMMIT')
    return pending.rowCount
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{})
    throw error
  } finally { client.release() }
}

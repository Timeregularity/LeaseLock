import { Router } from 'express'
import { pool, withTransaction } from '../db/pool.js'
import { eventSelect, findEvent, toEvent } from '../events/queries.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { randomUUID } from 'node:crypto'
import { createGroupedHold } from '../holds/service.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireRole('ADMIN'))

adminRouter.get('/dashboard',async(request,response,next)=>{try{const result=await pool.query(`SELECT
  (SELECT count(*)::int FROM events WHERE status='PUBLISHED' AND starts_at>now()) active_events,
  (SELECT count(*)::int FROM bookings WHERE status='CONFIRMED') confirmed_bookings,
  (SELECT count(*)::int FROM holds WHERE status='ACTIVE' AND expires_at>now()) active_holds,
  (SELECT count(*)::int FROM holds WHERE status='EXPIRED' AND updated_at>now()-interval '30 days') expired_holds,
  (SELECT count(*)::int FROM waitlist_entries WHERE status='WAITING') waiting_customers`);const audits=await pool.query('SELECT action,resource_type,resource_id,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10');response.json({metrics:result.rows[0],recentActivity:audits.rows})}catch(error){next(error)}})

adminRouter.post('/concurrency-demo',async(request,response,next)=>{const requests=Math.min(50,Math.max(2,Number(request.body?.concurrentRequests)||20));const eventId=String(request.body?.eventId||'techfest-live');const seatId=String(request.body?.seatId||'A1').toUpperCase();const users=[];let holdIds=[];try{const event=await findEvent(pool,eventId);if(!event)return response.status(404).json({code:'EVENT_NOT_FOUND',message:'The event could not be found.'});const seat=await pool.query('SELECT id FROM event_seats WHERE event_id=$1 AND seat_label=$2',[event.id,seatId]);if(!seat.rowCount)return response.status(404).json({code:'SEAT_NOT_FOUND',message:'Choose an existing seat.'});const occupied=await pool.query('SELECT 1 FROM seat_claims WHERE event_seat_id=$1 AND expires_at>now() UNION SELECT 1 FROM booking_seats WHERE event_seat_id=$1 AND cancelled_at IS NULL',[seat.rows[0].id]);if(occupied.rowCount)return response.status(409).json({code:'SEAT_UNAVAILABLE',message:'Choose an available seat for the demonstration.'});for(let i=0;i<requests;i++){const inserted=await pool.query("INSERT INTO users(email,password_hash,full_name) VALUES($1,'demo-not-login-capable','Concurrency Demo') RETURNING id",[`demo-${randomUUID()}@invalid.local`]);users.push(inserted.rows[0].id)}const results=await Promise.all(users.map((userId,index)=>withTransaction(client=>createGroupedHold(client,{userId,eventIdentifier:eventId,seatLabels:[seatId],idempotencyKey:`concurrency-${randomUUID()}-${index}`})).then(value=>({ok:true,value})).catch(error=>({ok:false,error}))));holdIds=results.filter(result=>result.ok).map(result=>result.value.id);const successfulHolds=holdIds.length;const active=await pool.query('SELECT count(*)::int count FROM seat_claims WHERE event_seat_id=$1',[seat.rows[0].id]);response.json({requests,successfulHolds,conflicts:requests-successfulHolds,activeHolds:active.rows[0].count,invariantPassed:successfulHolds===1&&active.rows[0].count===1})}catch(error){next(error)}finally{if(holdIds.length)await pool.query('DELETE FROM seat_claims WHERE hold_id=ANY($1::uuid[])',[holdIds]).catch(()=>{});if(users.length){await pool.query('DELETE FROM holds WHERE user_id=ANY($1::uuid[])',[users]).catch(()=>{});await pool.query('DELETE FROM idempotency_records WHERE user_id=ANY($1::uuid[])',[users]).catch(()=>{});await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]).catch(()=>{})}}})

adminRouter.get('/events', async (request,response,next)=>{
  try { const result=await pool.query(`${eventSelect} GROUP BY e.id ORDER BY e.starts_at DESC`);response.json({events:result.rows.map(toEvent)}) }
  catch(error){next(error)}
})

adminRouter.post('/events', async (request,response,next)=>{
  try {
    const {name,description='',venue,date,time,status='DRAFT',timezone='Asia/Kolkata'}=request.body||{}
    if(!name||!venue||!date||!time)return response.status(400).json({code:'VALIDATION_ERROR',message:'Name, venue, date, and time are required.'})
    const slug=String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)
    const startsAt=new Date(`${date}T${time}:00+05:30`)
    if(Number.isNaN(startsAt.getTime()))return response.status(400).json({code:'VALIDATION_ERROR',message:'Enter a valid event date and time.'})
    const result=await pool.query(`INSERT INTO events(slug,name,description,venue,starts_at,timezone,status,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[slug,name.trim(),description,venue.trim(),startsAt,timezone,status,request.user.id])
    response.status(201).json({event:{id:result.rows[0].slug,databaseId:result.rows[0].id,title:result.rows[0].name,status:result.rows[0].status}})
  } catch(error){if(error.code==='23505')return response.status(409).json({code:'EVENT_SLUG_EXISTS',message:'An event with a similar name already exists.'});next(error)}
})

adminRouter.patch('/events/:identifier', async (request,response,next)=>{
  try {
    const event=await findEvent(pool,request.params.identifier)
    if(!event)return response.status(404).json({code:'EVENT_NOT_FOUND',message:'The event could not be found.'})
    const name=String(request.body.name??event.name).trim(), venue=String(request.body.venue??event.venue).trim()
    const description=String(request.body.description??event.description), status=request.body.status??event.status
    let startsAt=event.starts_at
    if(request.body.date||request.body.time){const date=request.body.date||new Date(event.starts_at).toISOString().slice(0,10);const time=request.body.time||new Date(event.starts_at).toISOString().slice(11,16);startsAt=new Date(`${date}T${time}:00+05:30`)}
    const result=await pool.query('UPDATE events SET name=$1,venue=$2,description=$3,status=$4,starts_at=$5,updated_at=now() WHERE id=$6 RETURNING *',[name,venue,description,status,startsAt,event.id])
    response.json({event:{id:result.rows[0].slug,databaseId:result.rows[0].id,title:result.rows[0].name,status:result.rows[0].status}})
  }catch(error){next(error)}
})

adminRouter.get('/seats', async(request,response,next)=>{
  try {
    const identifier=request.query.eventId||'techfest-live';const event=await findEvent(pool,identifier)
    if(!event)return response.status(404).json({code:'EVENT_NOT_FOUND',message:'The event could not be found.'})
    const result=await pool.query(`SELECT es.seat_label AS id,es.section,es.price_paise,
      CASE WHEN NOT es.is_enabled THEN 'UNAVAILABLE' WHEN bs.event_seat_id IS NOT NULL THEN 'RESERVED' WHEN sc.event_seat_id IS NOT NULL THEN 'HELD' ELSE 'AVAILABLE' END status,
      sc.expires_at FROM event_seats es LEFT JOIN seat_claims sc ON sc.event_seat_id=es.id AND sc.expires_at>now()
      LEFT JOIN booking_seats bs ON bs.event_seat_id=es.id AND bs.cancelled_at IS NULL WHERE es.event_id=$1 ORDER BY es.section,es.seat_number`,[event.id])
    response.json({eventId:event.slug,seats:result.rows.map(row=>({...row,price:Number(row.price_paise)/100,price_paise:undefined}))})
  }catch(error){next(error)}
})

adminRouter.put('/events/:identifier/seats', async(request,response,next)=>{
  try {
    const seats=request.body?.seats
    if(!Array.isArray(seats)||!seats.length||seats.length>1000)return response.status(400).json({code:'VALIDATION_ERROR',message:'Provide between 1 and 1000 seats.'})
    const count=await withTransaction(async client=>{const event=await findEvent(client,request.params.identifier,{lock:true});if(!event)return null
      for(const seat of seats){const label=String(seat.id||seat.seatLabel||'').trim().toUpperCase();const pricePaise=Math.round(Number(seat.price)*100);if(!label||!Number.isSafeInteger(pricePaise)||pricePaise<0){const error=new Error('Every seat requires a label and valid price.');error.status=400;error.code='VALIDATION_ERROR';throw error}
        await client.query(`INSERT INTO event_seats(event_id,seat_label,section,row_label,seat_number,price_paise,is_enabled) VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(event_id,seat_label) DO UPDATE SET section=excluded.section,row_label=excluded.row_label,seat_number=excluded.seat_number,price_paise=excluded.price_paise,is_enabled=excluded.is_enabled`,[event.id,label,seat.section||'GENERAL',seat.row||seat.section||null,seat.number||null,pricePaise,seat.isEnabled!==false])}
      return seats.length})
    if(count===null)return response.status(404).json({code:'EVENT_NOT_FOUND',message:'The event could not be found.'})
    response.json({updated:count})
  }catch(error){next(error)}
})

adminRouter.patch('/events/:identifier/seats/:seatLabel',async(request,response,next)=>{
  try{const event=await findEvent(pool,request.params.identifier);if(!event)return response.status(404).json({code:'EVENT_NOT_FOUND',message:'The event could not be found.'});const result=await pool.query('UPDATE event_seats SET is_enabled=$1 WHERE event_id=$2 AND seat_label=$3 RETURNING seat_label,is_enabled',[Boolean(request.body.isEnabled),event.id,request.params.seatLabel.toUpperCase()]);if(!result.rowCount)return response.status(404).json({code:'SEAT_NOT_FOUND',message:'The seat could not be found.'});response.json({seat:{id:result.rows[0].seat_label,isEnabled:result.rows[0].is_enabled}})}catch(error){next(error)}
})

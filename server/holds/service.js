import { createHash } from 'node:crypto'
import { findEvent } from '../events/queries.js'

export function requestHash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

export async function expireHolds(client) {
  const claims=await client.query('DELETE FROM seat_claims WHERE expires_at<=now() RETURNING hold_id')
  const expired=await client.query("UPDATE holds SET status='EXPIRED',updated_at=now() WHERE status='ACTIVE' AND expires_at<=now() RETURNING id")
  const ids=[...new Set([...claims.rows,...expired.rows].map(row=>row.hold_id||row.id))]
  if(ids.length){
    await client.query("UPDATE payments p SET status='REFUNDED',refunded_paise=p.amount_paise,updated_at=now() FROM bookings b WHERE p.booking_id=b.id AND b.source_hold_id=ANY($1::uuid[]) AND p.status='SUCCESSFUL'",[ids])
    await client.query("UPDATE payments p SET status='EXPIRED',updated_at=now() FROM bookings b WHERE p.booking_id=b.id AND b.source_hold_id=ANY($1::uuid[]) AND p.status IN('CREATED','PROCESSING')",[ids])
    await client.query("UPDATE bookings SET status='PAYMENT_FAILED',updated_at=now() WHERE source_hold_id=ANY($1::uuid[]) AND status='PENDING_PAYMENT'",[ids])
  }
  return ids.length
}

export async function createGroupedHold(client,{userId,eventIdentifier,seatLabels,idempotencyKey}) {
  await expireHolds(client)
  const normalized=[...new Set(seatLabels.map(value=>String(value).trim().toUpperCase()))].sort()
  const hash=requestHash({eventIdentifier,seatLabels:normalized})
  const previous=await client.query("SELECT request_hash,response_status,response_body FROM idempotency_records WHERE user_id=$1 AND operation='CREATE_HOLD' AND key=$2 FOR UPDATE",[userId,idempotencyKey])
  if(previous.rowCount){const row=previous.rows[0];if(row.request_hash!==hash){const error=new Error('This idempotency key was already used for a different request.');error.status=409;error.code='IDEMPOTENCY_KEY_REUSED';throw error}if(row.response_body)return row.response_body}
  else await client.query("INSERT INTO idempotency_records(user_id,operation,key,request_hash,expires_at) VALUES($1,'CREATE_HOLD',$2,$3,now()+interval '24 hours')",[userId,idempotencyKey,hash])

  const event=await findEvent(client,eventIdentifier,{shared:true})
  if(!event){const error=new Error('The event could not be found.');error.status=404;error.code='EVENT_NOT_FOUND';throw error}
  if(event.status!=='PUBLISHED'||new Date(event.starts_at)<=new Date()||(event.booking_opens_at&&new Date(event.booking_opens_at)>new Date())||(event.booking_closes_at&&new Date(event.booking_closes_at)<=new Date())){const error=new Error('This event is not accepting bookings.');error.status=409;error.code='BOOKING_CLOSED';throw error}

  const active=await client.query("SELECT id FROM holds WHERE user_id=$1 AND status='ACTIVE' FOR UPDATE",[userId])
  if(active.rowCount){const error=new Error('You already have an active seat hold.');error.status=409;error.code='ACTIVE_HOLD_EXISTS';throw error}
  const seats=await client.query(`SELECT id,seat_label,section,price_paise,is_enabled FROM event_seats
    WHERE event_id=$1 AND seat_label=ANY($2::text[]) ORDER BY id FOR UPDATE`,[event.id,normalized])
  const found=new Set(seats.rows.map(row=>row.seat_label));const unavailable=normalized.filter(label=>!found.has(label))
  unavailable.push(...seats.rows.filter(row=>!row.is_enabled).map(row=>row.seat_label))
  if(!unavailable.length){const ids=seats.rows.map(row=>row.id);const occupied=await client.query(`SELECT event_seat_id FROM seat_claims WHERE event_seat_id=ANY($1::uuid[])
      UNION SELECT event_seat_id FROM booking_seats WHERE event_seat_id=ANY($1::uuid[]) AND cancelled_at IS NULL`,[ids]);const occupiedIds=new Set(occupied.rows.map(row=>row.event_seat_id));unavailable.push(...seats.rows.filter(row=>occupiedIds.has(row.id)).map(row=>row.seat_label))}
  if(unavailable.length){const error=new Error('One or more selected seats are unavailable.');error.status=409;error.code='SEATS_UNAVAILABLE';error.details={unavailableSeatIds:[...new Set(unavailable)].sort()};throw error}

  const holdResult=await client.query("INSERT INTO holds(user_id,event_id,expires_at) VALUES($1,$2,now()+interval '5 minutes') RETURNING id,expires_at",[userId,event.id])
  const hold=holdResult.rows[0]
  for(const seat of seats.rows){await client.query('INSERT INTO hold_seats(hold_id,event_seat_id,price_paise) VALUES($1,$2,$3)',[hold.id,seat.id,seat.price_paise]);await client.query('INSERT INTO seat_claims(event_seat_id,hold_id,expires_at) VALUES($1,$2,$3)',[seat.id,hold.id,hold.expires_at])}
  const body={id:hold.id,eventId:event.slug,seatIds:normalized,status:'ACTIVE',totalPrice:seats.rows.reduce((sum,row)=>sum+Number(row.price_paise),0)/100,expiresAt:hold.expires_at}
  await client.query("UPDATE idempotency_records SET response_status=201,response_body=$1 WHERE user_id=$2 AND operation='CREATE_HOLD' AND key=$3",[body,userId,idempotencyKey])
  return body
}

export async function updateGroupedHold(client,{holdId,userId,seatLabels}) {
  await expireHolds(client)
  const normalized=[...new Set(seatLabels.map(value=>String(value).trim().toUpperCase()))].sort()
  const holdResult=await client.query(`SELECT h.*,e.slug FROM holds h JOIN events e ON e.id=h.event_id
    WHERE h.id=$1 AND h.user_id=$2 FOR UPDATE OF h`,[holdId,userId])
  if(!holdResult.rowCount){const error=new Error('The hold could not be found.');error.status=404;error.code='HOLD_NOT_FOUND';throw error}
  const hold=holdResult.rows[0]
  if(hold.status!=='ACTIVE'||new Date(hold.expires_at)<=new Date()){const error=new Error('This hold has expired.');error.status=410;error.code='HOLD_EXPIRED';throw error}
  const checkout=await client.query('SELECT 1 FROM bookings WHERE source_hold_id=$1',[hold.id])
  if(checkout.rowCount){const error=new Error('Seats cannot be changed after checkout has started.');error.status=409;error.code='CHECKOUT_STARTED';throw error}

  if(!normalized.length){
    await client.query('DELETE FROM seat_claims WHERE hold_id=$1',[hold.id])
    await client.query('DELETE FROM hold_seats WHERE hold_id=$1',[hold.id])
    await client.query("UPDATE holds SET status='RELEASED',updated_at=now() WHERE id=$1",[hold.id])
    return{id:hold.id,eventId:hold.slug,seatIds:[],status:'RELEASED',totalPrice:0,expiresAt:hold.expires_at}
  }

  const seats=await client.query(`SELECT id,seat_label,price_paise,is_enabled FROM event_seats
    WHERE event_id=$1 AND seat_label=ANY($2::text[]) ORDER BY id FOR UPDATE`,[hold.event_id,normalized])
  const found=new Set(seats.rows.map(row=>row.seat_label));const unavailable=normalized.filter(label=>!found.has(label))
  unavailable.push(...seats.rows.filter(row=>!row.is_enabled).map(row=>row.seat_label))
  if(!unavailable.length){
    const ids=seats.rows.map(row=>row.id)
    const occupied=await client.query(`SELECT event_seat_id FROM seat_claims WHERE event_seat_id=ANY($1::uuid[]) AND hold_id<>$2
      UNION SELECT event_seat_id FROM booking_seats WHERE event_seat_id=ANY($1::uuid[]) AND cancelled_at IS NULL`,[ids,hold.id])
    const occupiedIds=new Set(occupied.rows.map(row=>row.event_seat_id));unavailable.push(...seats.rows.filter(row=>occupiedIds.has(row.id)).map(row=>row.seat_label))
  }
  if(unavailable.length){const error=new Error('One or more selected seats are unavailable.');error.status=409;error.code='SEATS_UNAVAILABLE';error.details={unavailableSeatIds:[...new Set(unavailable)].sort()};throw error}

  const ids=seats.rows.map(row=>row.id)
  await client.query('DELETE FROM seat_claims WHERE hold_id=$1 AND NOT(event_seat_id=ANY($2::uuid[]))',[hold.id,ids])
  await client.query('DELETE FROM hold_seats WHERE hold_id=$1 AND NOT(event_seat_id=ANY($2::uuid[]))',[hold.id,ids])
  for(const seat of seats.rows){
    await client.query('INSERT INTO hold_seats(hold_id,event_seat_id,price_paise) VALUES($1,$2,$3) ON CONFLICT(hold_id,event_seat_id) DO NOTHING',[hold.id,seat.id,seat.price_paise])
    await client.query('INSERT INTO seat_claims(event_seat_id,hold_id,expires_at) VALUES($1,$2,$3) ON CONFLICT(event_seat_id) DO NOTHING',[seat.id,hold.id,hold.expires_at])
  }
  return{id:hold.id,eventId:hold.slug,seatIds:normalized,status:'ACTIVE',totalPrice:seats.rows.reduce((sum,row)=>sum+Number(row.price_paise),0)/100,expiresAt:hold.expires_at}
}

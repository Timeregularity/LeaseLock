import { Router } from 'express'
import { pool, withTransaction } from '../db/pool.js'
import { expireHolds, createGroupedHold, updateGroupedHold } from '../holds/service.js'
import { requireAuth } from '../middleware/auth.js'
import { bookingReference,getBooking,toBooking } from '../bookings/queries.js'
import { requestHash } from '../holds/service.js'
import { broadcastSeatChange } from '../realtime/seat-events.js'

export const holdsRouter=Router()
holdsRouter.use(requireAuth)

holdsRouter.post('/',async(request,response,next)=>{
  try{
    const {eventId,seatIds}=request.body||{};const key=String(request.get('Idempotency-Key')||'').trim()
    if(!eventId||!Array.isArray(seatIds)||seatIds.length<1||seatIds.length>6)return response.status(400).json({code:'VALIDATION_ERROR',message:'Select between 1 and 6 seats.'})
    if(new Set(seatIds.map(value=>String(value).trim().toUpperCase())).size!==seatIds.length)return response.status(400).json({code:'DUPLICATE_SEATS',message:'Each selected seat must be unique.'})
    if(key.length<8||key.length>200)return response.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'A valid Idempotency-Key header is required.'})
    const hold=await withTransaction(client=>createGroupedHold(client,{userId:request.user.id,eventIdentifier:String(eventId),seatLabels:seatIds,idempotencyKey:key}))
    broadcastSeatChange(hold.eventId,'hold-created');response.status(201).json(hold)
  }catch(error){if(error.code==='23505'&&error.constraint==='one_active_hold_per_user_idx'){error.status=409;error.code='ACTIVE_HOLD_EXISTS';error.message='You already have an active seat hold.'}next(error)}
})

holdsRouter.put('/:id/seats',async(request,response,next)=>{
  try{
    const {seatIds}=request.body||{}
    if(!Array.isArray(seatIds)||seatIds.length>6)return response.status(400).json({code:'VALIDATION_ERROR',message:'Select up to 6 seats.'})
    if(new Set(seatIds.map(value=>String(value).trim().toUpperCase())).size!==seatIds.length)return response.status(400).json({code:'DUPLICATE_SEATS',message:'Each selected seat must be unique.'})
    const hold=await withTransaction(client=>updateGroupedHold(client,{holdId:request.params.id,userId:request.user.id,seatLabels:seatIds}))
    broadcastSeatChange(hold.eventId,hold.status==='RELEASED'?'hold-released':'hold-updated');response.json(hold)
  }catch(error){next(error)}
})

holdsRouter.post('/:id/checkout',async(request,response,next)=>{
  try{const result=await withTransaction(async client=>{await expireHolds(client);await client.query('SELECT id FROM holds WHERE id=$1 AND user_id=$2 FOR UPDATE',[request.params.id,request.user.id]);const hold=await client.query(`SELECT h.*,e.slug,coalesce(sum(hs.price_paise),0) subtotal_paise,
      array_agg(es.seat_label ORDER BY es.seat_label) seat_ids FROM holds h JOIN events e ON e.id=h.event_id JOIN hold_seats hs ON hs.hold_id=h.id JOIN event_seats es ON es.id=hs.event_seat_id
      WHERE h.id=$1 AND h.user_id=$2 GROUP BY h.id,e.slug`,[request.params.id,request.user.id]);if(!hold.rowCount)return null;const row=hold.rows[0];if(row.status!=='ACTIVE'){const existing=await client.query('SELECT id FROM bookings WHERE source_hold_id=$1',[row.id]);if(existing.rowCount)return{bookingId:existing.rows[0].id,holdId:row.id,seatIds:row.seat_ids,totalPrice:Number(row.subtotal_paise)/100};const error=new Error('This hold is no longer active.');error.status=409;error.code='HOLD_NOT_ACTIVE';throw error}const existing=await client.query('SELECT id FROM bookings WHERE source_hold_id=$1',[row.id]);if(existing.rowCount)return{bookingId:existing.rows[0].id,holdId:row.id,seatIds:row.seat_ids,totalPrice:Number(row.subtotal_paise)/100};const inserted=await client.query(`INSERT INTO bookings(reference,user_id,event_id,source_hold_id,status,subtotal_paise,total_paise)
        VALUES($1,$2,$3,$4,'PENDING_PAYMENT',$5,$5) RETURNING id`,[bookingReference(),request.user.id,row.event_id,row.id,row.subtotal_paise]);return{bookingId:inserted.rows[0].id,holdId:row.id,seatIds:row.seat_ids,totalPrice:Number(row.subtotal_paise)/100,expiresAt:row.expires_at,status:'PENDING_PAYMENT'}})
    if(!result)return response.status(404).json({code:'HOLD_NOT_FOUND',message:'The hold could not be found.'});response.status(201).json(result)}catch(error){next(error)}})

holdsRouter.post('/:id/confirm',async(request,response,next)=>{
  try{const key=String(request.get('Idempotency-Key')||'').trim();if(key.length<8)return response.status(400).json({code:'IDEMPOTENCY_KEY_REQUIRED',message:'A valid Idempotency-Key header is required.'});const hash=requestHash({holdId:request.params.id})
    const result=await withTransaction(async client=>{const prior=await client.query("SELECT request_hash,response_body FROM idempotency_records WHERE user_id=$1 AND operation='CONFIRM_HOLD' AND key=$2 FOR UPDATE",[request.user.id,key]);if(prior.rowCount){if(prior.rows[0].request_hash!==hash){const error=new Error('This idempotency key was used for another confirmation.');error.status=409;error.code='IDEMPOTENCY_KEY_REUSED';throw error}if(prior.rows[0].response_body)return prior.rows[0].response_body}else await client.query("INSERT INTO idempotency_records(user_id,operation,key,request_hash,expires_at) VALUES($1,'CONFIRM_HOLD',$2,$3,now()+interval '24 hours')",[request.user.id,key,hash])
      await expireHolds(client);const hold=await client.query('SELECT * FROM holds WHERE id=$1 AND user_id=$2 FOR UPDATE',[request.params.id,request.user.id]);if(!hold.rowCount)return null;const bookingResult=await client.query('SELECT * FROM bookings WHERE source_hold_id=$1 AND user_id=$2 FOR UPDATE',[request.params.id,request.user.id]);if(!bookingResult.rowCount){const error=new Error('Start checkout before confirming this hold.');error.status=409;error.code='CHECKOUT_REQUIRED';throw error}const booking=bookingResult.rows[0];if(booking.status==='CONFIRMED'){const current=toBooking(await getBooking(client,booking.id,request.user.id));return{reservation:current}}
      if(hold.rows[0].status!=='ACTIVE'){const error=new Error('This hold has expired.');error.status=410;error.code='HOLD_EXPIRED';throw error}const payment=await client.query("SELECT id FROM payments WHERE booking_id=$1 AND status='SUCCESSFUL' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[booking.id]);if(!payment.rowCount){const error=new Error('A successful payment is required before confirmation.');error.status=409;error.code='PAYMENT_REQUIRED';throw error}
      await client.query(`INSERT INTO booking_seats(booking_id,event_seat_id,seat_label,section,price_paise)
        SELECT $1,es.id,es.seat_label,es.section,hs.price_paise FROM hold_seats hs JOIN event_seats es ON es.id=hs.event_seat_id WHERE hs.hold_id=$2
        ON CONFLICT(booking_id,event_seat_id) DO NOTHING`,[booking.id,request.params.id]);await client.query("UPDATE bookings SET status='CONFIRMED',updated_at=now() WHERE id=$1",[booking.id]);await client.query("UPDATE holds SET status='CONFIRMED',updated_at=now() WHERE id=$1",[request.params.id]);await client.query('DELETE FROM seat_claims WHERE hold_id=$1',[request.params.id]);const confirmed=toBooking(await getBooking(client,booking.id,request.user.id));const body={reservation:confirmed};await client.query("UPDATE idempotency_records SET response_status=200,response_body=$1 WHERE user_id=$2 AND operation='CONFIRM_HOLD' AND key=$3",[body,request.user.id,key]);return body})
    if(!result)return response.status(404).json({code:'HOLD_NOT_FOUND',message:'The hold could not be found.'});broadcastSeatChange(result.reservation.event.id,'booking-confirmed');response.json(result)}catch(error){next(error)}})

holdsRouter.get('/active/current',async(request,response,next)=>{
  try{
    const eventId=String(request.query.eventId||'')
    const hold=await withTransaction(async client=>{await expireHolds(client);const result=await client.query(`SELECT h.id,h.status,h.expires_at,e.slug,
      coalesce(sum(hs.price_paise),0) total_paise,array_agg(es.seat_label ORDER BY es.seat_label) seat_ids
      FROM holds h JOIN events e ON e.id=h.event_id JOIN hold_seats hs ON hs.hold_id=h.id JOIN event_seats es ON es.id=hs.event_seat_id
      WHERE h.user_id=$1 AND h.status='ACTIVE' AND h.expires_at>now() AND ($2='' OR e.slug=$2 OR e.id::text=$2)
      GROUP BY h.id,e.slug ORDER BY h.created_at DESC LIMIT 1`,[request.user.id,eventId]);return result.rows[0]||null})
    response.json({hold:hold?{id:hold.id,eventId:hold.slug,seatIds:hold.seat_ids,status:hold.status,totalPrice:Number(hold.total_paise)/100,expiresAt:hold.expires_at}:null})
  }catch(error){next(error)}
})

holdsRouter.get('/:id',async(request,response,next)=>{
  try{const hold=await withTransaction(async client=>{await expireHolds(client);const result=await client.query(`SELECT h.id,h.status,h.expires_at,e.slug,
      coalesce(json_agg(json_build_object('id',es.seat_label,'section',es.section,'price',hs.price_paise::numeric/100) ORDER BY es.seat_label) FILTER(WHERE es.id IS NOT NULL),'[]') seats
      FROM holds h JOIN events e ON e.id=h.event_id LEFT JOIN hold_seats hs ON hs.hold_id=h.id LEFT JOIN event_seats es ON es.id=hs.event_seat_id
      WHERE h.id=$1 AND h.user_id=$2 GROUP BY h.id,e.slug`,[request.params.id,request.user.id]);return result.rows[0]||null})
    if(!hold)return response.status(404).json({code:'HOLD_NOT_FOUND',message:'The hold could not be found.'});response.json({id:hold.id,eventId:hold.slug,status:hold.status,expiresAt:hold.expires_at,seats:hold.seats})
  }catch(error){next(error)}
})

holdsRouter.delete('/:id',async(request,response,next)=>{
  try{const released=await withTransaction(async client=>{await expireHolds(client);const result=await client.query("SELECT h.id,h.status,e.slug FROM holds h JOIN events e ON e.id=h.event_id WHERE h.id=$1 AND h.user_id=$2 FOR UPDATE OF h",[request.params.id,request.user.id]);if(!result.rowCount)return null;if(result.rows[0].status==='ACTIVE'){await client.query('DELETE FROM seat_claims WHERE hold_id=$1',[request.params.id]);await client.query("UPDATE holds SET status='RELEASED',updated_at=now() WHERE id=$1",[request.params.id])}return{eventId:result.rows[0].slug,changed:result.rows[0].status==='ACTIVE'}})
    if(!released)return response.status(404).json({code:'HOLD_NOT_FOUND',message:'The hold could not be found.'});if(released.changed)broadcastSeatChange(released.eventId,'hold-released');response.status(204).end()
  }catch(error){next(error)}
})

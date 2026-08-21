import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after,before,test } from 'node:test'
import { createApp } from '../app.js'
import { pool } from '../db/pool.js'

let server,baseUrl,cookie,userId,hold,bookingId,successfulPayment
const email=`booking-${Date.now()}@example.com`
const jsonHeaders=()=>({Cookie:cookie,'Content-Type':'application/json'})

before(async()=>{server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`;const response=await fetch(`${baseUrl}/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:'Booking Test',email,password:'correct-horse-123'})});const body=await response.json();userId=body.user.id;cookie=response.headers.get('set-cookie').split(';')[0]})

after(async()=>{if(userId){await pool.query('DELETE FROM payments WHERE booking_id IN(SELECT id FROM bookings WHERE user_id=$1)',[userId]);await pool.query('DELETE FROM bookings WHERE user_id=$1',[userId]);await pool.query('DELETE FROM seat_claims WHERE hold_id IN(SELECT id FROM holds WHERE user_id=$1)',[userId]);await pool.query('DELETE FROM holds WHERE user_id=$1',[userId]);await pool.query('DELETE FROM users WHERE id=$1',[userId])}await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end()})

test('customer creates a grouped hold and pending checkout',async()=>{const held=await fetch(`${baseUrl}/v1/holds`,{method:'POST',headers:{...jsonHeaders(),'Idempotency-Key':randomUUID()},body:JSON.stringify({eventId:'techfest-live',seatIds:['C5','C6']})});hold=await held.json();assert.equal(held.status,201)
  const checkout=await fetch(`${baseUrl}/v1/holds/${hold.id}/checkout`,{method:'POST',headers:jsonHeaders()});const body=await checkout.json();assert.equal(checkout.status,201);assert.equal(body.totalPrice,700);bookingId=body.bookingId})

test('failed mock payment can be retried successfully',async()=>{const create=async(scenario,key=randomUUID())=>{const response=await fetch(`${baseUrl}/v1/payments`,{method:'POST',headers:{...jsonHeaders(),'Idempotency-Key':key},body:JSON.stringify({bookingId,method:'TEST_UPI',scenario})});return{response,body:await response.json()}}
  const failed=await create('FAILURE');assert.equal(failed.response.status,201);const failureResult=await fetch(`${baseUrl}/v1/payments/${failed.body.payment.id}/simulate`,{method:'POST',headers:jsonHeaders()});assert.equal((await failureResult.json()).payment.status,'FAILED')
  const retry=await create('SUCCESS');assert.equal(retry.response.status,201);successfulPayment=retry.body.payment.id;const successResult=await fetch(`${baseUrl}/v1/payments/${successfulPayment}/simulate`,{method:'POST',headers:jsonHeaders()});assert.equal((await successResult.json()).payment.status,'SUCCESSFUL')})

test('paid hold confirms exactly one multi-seat booking',async()=>{const key=randomUUID();const confirm=()=>fetch(`${baseUrl}/v1/holds/${hold.id}/confirm`,{method:'POST',headers:{...jsonHeaders(),'Idempotency-Key':key}});const first=await confirm();const firstBody=await first.json();const repeated=await confirm();const repeatedBody=await repeated.json();assert.equal(first.status,200);assert.equal(firstBody.reservation.status,'CONFIRMED');assert.equal(firstBody.reservation.seats.length,2);assert.equal(repeated.status,200);assert.equal(repeatedBody.reservation.id,firstBody.reservation.id)})

test('booking list and details enforce customer ownership',async()=>{const list=await fetch(`${baseUrl}/v1/bookings`,{headers:{Cookie:cookie}});const listBody=await list.json();assert.ok(listBody.bookings.some(booking=>booking.id===bookingId));const detail=await fetch(`${baseUrl}/v1/bookings/${bookingId}`,{headers:{Cookie:cookie}});const detailBody=await detail.json();assert.equal(detail.status,200);assert.equal(detailBody.booking.totalPrice,700)})

test('cancellation rejects mixed valid and invalid seats atomically',async()=>{const response=await fetch(`${baseUrl}/v1/bookings/${bookingId}/cancel`,{method:'POST',headers:{...jsonHeaders(),'Idempotency-Key':randomUUID()},body:JSON.stringify({seatIds:['C5','UNKNOWN']})});const body=await response.json();assert.equal(response.status,409);assert.equal(body.code,'SEATS_NOT_CANCELLABLE');assert.deepEqual(body.details.unmatchedSeatIds,['UNKNOWN']);const seats=await pool.query('SELECT count(*)::int count FROM booking_seats WHERE booking_id=$1 AND cancelled_at IS NULL',[bookingId]);assert.equal(seats.rows[0].count,2)})

test('selected-seat then full cancellation records simulated refunds',async()=>{const cancel=async(seatIds,key)=>{const response=await fetch(`${baseUrl}/v1/bookings/${bookingId}/cancel`,{method:'POST',headers:{...jsonHeaders(),'Idempotency-Key':key},body:JSON.stringify({seatIds})});return{response,body:await response.json()}}
  const partial=await cancel(['C5'],randomUUID());assert.equal(partial.response.status,200);assert.equal(partial.body.status,'CONFIRMED');assert.equal(partial.body.refundAmount,350);const final=await cancel(['C6'],randomUUID());assert.equal(final.response.status,200);assert.equal(final.body.status,'CANCELLED');assert.equal(final.body.refundAmount,350)
  const payment=await fetch(`${baseUrl}/v1/payments/${successfulPayment}`,{headers:{Cookie:cookie}});const paymentBody=await payment.json();assert.equal(paymentBody.payment.status,'REFUNDED');assert.equal(paymentBody.payment.refundedAmount,700)})

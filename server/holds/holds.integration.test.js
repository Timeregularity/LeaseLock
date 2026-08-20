import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createApp } from '../app.js'
import { pool } from '../db/pool.js'

let server,baseUrl
const emails=[`hold-a-${Date.now()}@example.com`,`hold-b-${Date.now()}@example.com`]
const cookies=[]
const createdUsers=[]
let winningHold

async function register(email) {
  const response=await fetch(`${baseUrl}/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:'Hold Test',email,password:'correct-horse-123'})})
  const body=await response.json();createdUsers.push(body.user.id);return response.headers.get('set-cookie').split(';')[0]
}

before(async()=>{server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`;cookies.push(await register(emails[0]),await register(emails[1]))})

after(async()=>{
  if(createdUsers.length){await pool.query('DELETE FROM seat_claims WHERE hold_id IN(SELECT id FROM holds WHERE user_id=ANY($1::uuid[]))',[createdUsers]);await pool.query('DELETE FROM holds WHERE user_id=ANY($1::uuid[])',[createdUsers]);await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[createdUsers])}
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end()
})

test('public event and seat inventory comes from PostgreSQL',async()=>{
  const events=await fetch(`${baseUrl}/v1/events`);const eventBody=await events.json()
  const seats=await fetch(`${baseUrl}/v1/events/techfest-live/seats`);const seatBody=await seats.json()
  assert.equal(events.status,200);assert.ok(eventBody.events.some(event=>event.id==='techfest-live'))
  assert.equal(seats.status,200);assert.equal(seatBody.seats.length,40)
})

test('overlapping grouped holds produce exactly one winner',async()=>{
  const request=(cookie,seatIds)=>fetch(`${baseUrl}/v1/holds`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({eventId:'techfest-live',seatIds})})
  const responses=await Promise.all([request(cookies[0],['D7','D8']),request(cookies[1],['D8','D9'])])
  const bodies=await Promise.all(responses.map(response=>response.json()))
  assert.deepEqual(responses.map(response=>response.status).sort(),[201,409])
  const winner=responses.findIndex(response=>response.status===201);const loser=1-winner
  winningHold={...bodies[winner],cookie:cookies[winner]}
  assert.equal(bodies[loser].code,'SEATS_UNAVAILABLE')
  assert.deepEqual(bodies[loser].details.unavailableSeatIds,['D8'])
})

test('hold is readable, idempotently releasable, and returns seats to inventory',async()=>{
  const active=await fetch(`${baseUrl}/v1/holds/active/current?eventId=techfest-live`,{headers:{Cookie:winningHold.cookie}});const activeBody=await active.json()
  assert.equal(active.status,200);assert.equal(activeBody.hold.id,winningHold.id);assert.deepEqual(activeBody.hold.seatIds,winningHold.seatIds)
  const read=await fetch(`${baseUrl}/v1/holds/${winningHold.id}`,{headers:{Cookie:winningHold.cookie}});const body=await read.json()
  assert.equal(read.status,200);assert.equal(body.status,'ACTIVE');assert.equal(body.seats.length,2)
  const expandedIds=[...winningHold.seatIds,'D10'].sort()
  const expanded=await fetch(`${baseUrl}/v1/holds/${winningHold.id}/seats`,{method:'PUT',headers:{Cookie:winningHold.cookie,'Content-Type':'application/json'},body:JSON.stringify({seatIds:expandedIds})});const expandedBody=await expanded.json()
  assert.equal(expanded.status,200);assert.deepEqual(expandedBody.seatIds,expandedIds);assert.equal(expandedBody.expiresAt,winningHold.expiresAt)
  const otherView=await fetch(`${baseUrl}/v1/events/techfest-live/seats`,{headers:{Cookie:cookies.find(cookie=>cookie!==winningHold.cookie)}});const otherBody=await otherView.json()
  assert.equal(otherBody.seats.find(seat=>seat.id==='D10').status,'HELD')
  const reducedIds=expandedIds.filter(id=>id!==winningHold.seatIds[0])
  const reduced=await fetch(`${baseUrl}/v1/holds/${winningHold.id}/seats`,{method:'PUT',headers:{Cookie:winningHold.cookie,'Content-Type':'application/json'},body:JSON.stringify({seatIds:reducedIds})});const reducedBody=await reduced.json()
  assert.equal(reduced.status,200);assert.deepEqual(reducedBody.seatIds,reducedIds)
  const release=await fetch(`${baseUrl}/v1/holds/${winningHold.id}`,{method:'DELETE',headers:{Cookie:winningHold.cookie}})
  const releaseAgain=await fetch(`${baseUrl}/v1/holds/${winningHold.id}`,{method:'DELETE',headers:{Cookie:winningHold.cookie}})
  assert.equal(release.status,204);assert.equal(releaseAgain.status,204)
  const noActive=await fetch(`${baseUrl}/v1/holds/active/current?eventId=techfest-live`,{headers:{Cookie:winningHold.cookie}});const noActiveBody=await noActive.json()
  assert.equal(noActive.status,200);assert.equal(noActiveBody.hold,null)
})

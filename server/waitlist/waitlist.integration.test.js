import assert from 'node:assert/strict'
import { after,before,test } from 'node:test'
import { createApp } from '../app.js'
import { pool } from '../db/pool.js'

let server,baseUrl,cookie,userId,entryId
const email=`waitlist-${Date.now()}@example.com`

before(async()=>{server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`;const response=await fetch(`${baseUrl}/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:'Waitlist Test',email,password:'correct-horse-123'})});const body=await response.json();userId=body.user.id;cookie=response.headers.get('set-cookie').split(';')[0]})
after(async()=>{if(userId){await pool.query('DELETE FROM waitlist_entries WHERE user_id=$1',[userId]);await pool.query('DELETE FROM seat_claims WHERE hold_id IN(SELECT id FROM holds WHERE user_id=$1)',[userId]);await pool.query('DELETE FROM holds WHERE user_id=$1',[userId]);await pool.query('DELETE FROM users WHERE id=$1',[userId])}await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end()})

test('ordered waitlist promotes an eligible customer to a hold offer',async()=>{const joined=await fetch(`${baseUrl}/v1/waitlist`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({eventId:'techfest-live',requestedSeats:1})});const joinedBody=await joined.json();assert.equal(joined.status,201);entryId=joinedBody.entry.id;const status=await fetch(`${baseUrl}/v1/waitlist`,{headers:{Cookie:cookie}});const body=await status.json();const entry=body.entries.find(item=>item.id===entryId);assert.equal(entry.status,'OFFERED');assert.ok(entry.offeredHoldId);assert.ok(entry.offerExpiresAt)})
test('leaving an offered waitlist releases its hold',async()=>{const response=await fetch(`${baseUrl}/v1/waitlist/${entryId}`,{method:'DELETE',headers:{Cookie:cookie}});assert.equal(response.status,204);const result=await pool.query("SELECT w.status,h.status hold_status FROM waitlist_entries w LEFT JOIN holds h ON h.id=w.offered_hold_id WHERE w.id=$1",[entryId]);assert.equal(result.rows[0].status,'CANCELLED');assert.equal(result.rows[0].hold_status,'RELEASED')})

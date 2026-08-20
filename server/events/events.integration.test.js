import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../app.js'
import { pool } from '../db/pool.js'

let server,baseUrl,adminCookie,customerCookie,eventSlug

async function login(email,password){const response=await fetch(`${baseUrl}/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0]}

before(async()=>{server=createApp().listen(0);await new Promise(resolve=>server.once('listening',resolve));baseUrl=`http://127.0.0.1:${server.address().port}`;adminCookie=await login(process.env.SEED_ADMIN_EMAIL||'admin@leaselock.local',process.env.SEED_ADMIN_PASSWORD||'Admin123!');customerCookie=await login(process.env.SEED_CUSTOMER_EMAIL||'customer@leaselock.local',process.env.SEED_CUSTOMER_PASSWORD||'Customer123!')})

after(async()=>{if(eventSlug)await pool.query('DELETE FROM events WHERE slug=$1',[eventSlug]);await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end()})

test('customer is forbidden from admin event inventory',async()=>{const response=await fetch(`${baseUrl}/v1/admin/events`,{headers:{Cookie:customerCookie}});assert.equal(response.status,403)})

test('admin creates and edits an event',async()=>{const name=`API Test Event ${Date.now()}`;const created=await fetch(`${baseUrl}/v1/admin/events`,{method:'POST',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({name,venue:'Test Hall',date:'2027-01-10',time:'18:30',status:'DRAFT'})});const body=await created.json();assert.equal(created.status,201);eventSlug=body.event.id
  const updated=await fetch(`${baseUrl}/v1/admin/events/${eventSlug}`,{method:'PATCH',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({description:'Updated through the protected API.',status:'PUBLISHED'})});const updatedBody=await updated.json();assert.equal(updated.status,200);assert.equal(updatedBody.event.status,'PUBLISHED')})

test('admin upserts and disables seat inventory',async()=>{const upsert=await fetch(`${baseUrl}/v1/admin/events/${eventSlug}/seats`,{method:'PUT',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({seats:[{id:'A1',section:'A',row:'A',number:1,price:500},{id:'A2',section:'A',row:'A',number:2,price:500}]})});const body=await upsert.json();assert.equal(upsert.status,200);assert.equal(body.updated,2)
  const disabled=await fetch(`${baseUrl}/v1/admin/events/${eventSlug}/seats/A2`,{method:'PATCH',headers:{Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({isEnabled:false})});const disabledBody=await disabled.json();assert.equal(disabled.status,200);assert.equal(disabledBody.seat.isEnabled,false)})

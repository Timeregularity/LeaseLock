import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../app.js'
import { pool } from '../db/pool.js'

let server
let baseUrl
let cookie
const email = `auth-test-${Date.now()}@example.com`

before(async () => {
  server = createApp().listen(0)
  await new Promise(resolve=>server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [email])
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  await pool.end()
})

test('register creates a customer and secure session cookie', async () => {
  const response = await fetch(`${baseUrl}/v1/auth/register`, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ fullName:'Auth Test', email, password:'correct-horse-123' })
  })
  const body = await response.json()
  cookie = response.headers.get('set-cookie').split(';')[0]

  assert.equal(response.status, 201)
  assert.equal(body.user.email, email)
  assert.equal(body.user.role, 'CUSTOMER')
  assert.match(cookie, /^ll_session=/)
})

test('session cookie authenticates the current user', async () => {
  const response = await fetch(`${baseUrl}/v1/auth/me`, { headers:{ Cookie:cookie } })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.user.email, email)
})

test('logout revokes the session', async () => {
  const logout = await fetch(`${baseUrl}/v1/auth/logout`, { method:'POST', headers:{ Cookie:cookie } })
  const afterLogout = await fetch(`${baseUrl}/v1/auth/me`, { headers:{ Cookie:cookie } })
  const body = await afterLogout.json()

  assert.equal(logout.status, 204)
  assert.equal(afterLogout.status, 401)
  assert.equal(body.code, 'SESSION_INVALID')
})

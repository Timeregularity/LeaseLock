import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from './app.js'

let server
let baseUrl

before(async () => {
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('GET /v1/health reports a healthy API', async () => {
  const response = await fetch(`${baseUrl}/v1/health`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.status, 'ok')
  assert.equal(body.service, 'leaselock-api')
  assert.ok(body.timestamp)
})

test('unknown API routes return a consistent JSON error', async () => {
  const response = await fetch(`${baseUrl}/v1/unknown`)
  const body = await response.json()

  assert.equal(response.status, 404)
  assert.equal(body.code, 'ROUTE_NOT_FOUND')
})

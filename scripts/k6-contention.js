import http from 'k6/http'
import { check } from 'k6'

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080'
const adminEmail = __ENV.ADMIN_EMAIL || 'admin@leaselock.local'
const adminPassword = __ENV.ADMIN_PASSWORD || 'Admin123!'
const requests = Math.min(50, Math.max(2, Number(__ENV.CONTENDERS || 50)))
const seatIds = (__ENV.SEAT_IDS || __ENV.SEAT_ID || 'A1').split(',').map(value => value.trim().toUpperCase()).filter(Boolean)
const runs = Math.max(1, Number(__ENV.RUNS || 1))
export const options = { scenarios: { contention: { executor: 'per-vu-iterations', vus: 1, iterations: runs, maxDuration: '30m' } }, thresholds: { checks: ['rate==1'] } }

export function setup () {
  const login = http.post(`${baseUrl}/v1/auth/login`, JSON.stringify({ email: adminEmail, password: adminPassword }), { headers: { 'Content-Type': 'application/json' } })
  check(login, { 'admin login succeeds': response => response.status === 200 })
  if (login.status !== 200) throw new Error(`Admin login failed with ${login.status}`)
  const cookie = login.cookies.ll_session?.[0]?.value
  if (!cookie) throw new Error('Login response did not contain a session cookie')
  return { cookie }
}

export default function (data) {
  const seatId = seatIds[__ITER % seatIds.length]
  const response = http.post(`${baseUrl}/v1/admin/concurrency-demo`, JSON.stringify({ concurrentRequests: requests, eventId: 'techfest-live', seatId }), { headers: { 'Content-Type': 'application/json', Cookie: `ll_session=${data.cookie}` } })
  if (response.status !== 200) console.log(`contention failed: HTTP ${response.status} ${response.body}`)
  const body = response.json()
  check(response, { 'contention endpoint succeeds': value => value.status === 200, 'exactly one winner': value => value.status === 200 && body.invariantPassed === true && body.successfulHolds === 1, 'all losing requests conflict': value => value.status === 200 && body.conflicts === requests - 1 })
}

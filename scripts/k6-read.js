import http from 'k6/http'
import { check, sleep } from 'k6'

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080'
export const options = { scenarios: { read_traffic: { executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 500, stages: [{ target: 25, duration: '30s' }, { target: 100, duration: '60s' }, { target: 250, duration: '60s' }, { target: 0, duration: '30s' }] } }, thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500', 'p(99)<1000'], checks: ['rate>0.99'] } }

export default function () {
  const path = Math.random() < 0.5 ? '/v1/health' : '/v1/events'
  const response = http.get(`${baseUrl}${path}`, { tags: { endpoint: path } })
  check(response, { [`${path} returns 2xx`]: value => value.status >= 200 && value.status < 300 })
  sleep(0.1)
}

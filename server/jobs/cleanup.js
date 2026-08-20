import { pool } from '../db/pool.js'

export async function runCleanup(){const [sessions,idempotency]=await Promise.all([
  pool.query("DELETE FROM sessions WHERE expires_at<now()-interval '7 days' OR revoked_at<now()-interval '7 days'"),
  pool.query('DELETE FROM idempotency_records WHERE expires_at<now()')
]);return{sessions:sessions.rowCount,idempotency:idempotency.rowCount}}

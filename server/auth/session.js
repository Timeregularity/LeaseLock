import { createHash, randomBytes } from 'node:crypto'
import { pool } from '../db/pool.js'

export const sessionCookieName = 'll_session'
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId, client = pool) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionLifetimeMs)
  await client.query(
    'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(token), expiresAt]
  )
  return { token, expiresAt }
}

export function sessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  }
}

export async function revokeSession(token) {
  if (!token) return
  await pool.query(
    'UPDATE sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1',
    [hashToken(token)]
  )
}

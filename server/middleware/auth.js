import { pool } from '../db/pool.js'
import { hashToken, sessionCookieName } from '../auth/session.js'

export async function requireAuth(request, response, next) {
  try {
    const token = request.cookies?.[sessionCookieName]
    if (!token) return response.status(401).json({ code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue.' })

    const result = await pool.query(`
      SELECT u.id, u.email, u.full_name, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active = true
    `, [hashToken(token)])

    if (!result.rowCount) {
      response.clearCookie(sessionCookieName, { path: '/' })
      return response.status(401).json({ code: 'SESSION_INVALID', message: 'Your session has expired. Please sign in again.' })
    }

    const user = result.rows[0]
    request.user = { id:user.id, email:user.email, fullName:user.full_name, role:user.role }
    next()
  } catch (error) {
    next(error)
  }
}

export function requireRole(...roles) {
  return (request, response, next) => roles.includes(request.user?.role)
    ? next()
    : response.status(403).json({ code:'FORBIDDEN', message:'You do not have permission to do that.' })
}

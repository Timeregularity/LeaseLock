import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { createSession, revokeSession, sessionCookieName, sessionCookieOptions } from '../auth/session.js'
import { withTransaction } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (request, response) => response.status(429).json({ code:'AUTH_RATE_LIMITED', message:'Too many authentication attempts. Please wait and try again.' })
})

function normalizeEmail(value) { return String(value||'').trim().toLowerCase() }
function publicUser(row) { return { id:row.id, email:row.email, fullName:row.full_name, role:row.role } }

authRouter.post('/register', authLimiter, async (request, response, next) => {
  try {
    const fullName = String(request.body?.fullName||'').trim()
    const email = normalizeEmail(request.body?.email)
    const password = String(request.body?.password||'')
    const fields = {}
    if (fullName.length < 2 || fullName.length > 100) fields.fullName = 'Enter a name between 2 and 100 characters.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fields.email = 'Enter a valid email address.'
    if (password.length < 8 || password.length > 128) fields.password = 'Use a password between 8 and 128 characters.'
    if (Object.keys(fields).length) return response.status(400).json({ code:'VALIDATION_ERROR', message:'Check the information and try again.', details:{ fields } })

    const passwordHash = await bcrypt.hash(password, 12)
    const result = await withTransaction(async client => {
      const inserted = await client.query(
        'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, role',
        [email, passwordHash, fullName]
      )
      const session = await createSession(inserted.rows[0].id, client)
      return { user:inserted.rows[0], session }
    })
    response.cookie(sessionCookieName, result.session.token, sessionCookieOptions(result.session.expiresAt))
    response.status(201).json({ user:publicUser(result.user) })
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_email_key') {
      return response.status(409).json({ code:'EMAIL_ALREADY_REGISTERED', message:'An account with this email already exists.' })
    }
    next(error)
  }
})

authRouter.post('/login', authLimiter, async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body?.email)
    const password = String(request.body?.password||'')
    const result = await withTransaction(async client => {
      const found = await client.query('SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1 AND is_active = true', [email])
      if (!found.rowCount || !await bcrypt.compare(password, found.rows[0].password_hash)) return null
      const session = await createSession(found.rows[0].id, client)
      return { user:found.rows[0], session }
    })
    if (!result) return response.status(401).json({ code:'INVALID_CREDENTIALS', message:'The email or password is incorrect.' })
    response.cookie(sessionCookieName, result.session.token, sessionCookieOptions(result.session.expiresAt))
    response.json({ user:publicUser(result.user) })
  } catch (error) { next(error) }
})

authRouter.post('/logout', async (request, response, next) => {
  try {
    await revokeSession(request.cookies?.[sessionCookieName])
    response.clearCookie(sessionCookieName, { path:'/' })
    response.status(204).end()
  } catch (error) { next(error) }
})

authRouter.get('/me', requireAuth, (request, response) => response.json({ user:request.user }))

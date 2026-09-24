import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function publicUser(row) {
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

profileRouter.get('/', (request, response) => {
  response.json({ user: request.user });
});

profileRouter.patch('/', async (request, response, next) => {
  try {
    const fullName = String(request.body?.fullName || '').trim();
    const email = normalizeEmail(request.body?.email);
    const fields = {};

    if (fullName && (fullName.length < 2 || fullName.length > 100)) {
      fields.fullName = 'Enter a name between 2 and 100 characters.';
    }
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
      fields.email = 'Enter a valid email address.';
    }
    if (Object.keys(fields).length) {
      return response.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Check the information and try again.',
        details: { fields },
      });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (fullName) {
      updates.push(`full_name = $${idx++}`);
      values.push(fullName);
    }
    if (email) {
      updates.push(`email = $${idx++}`);
      values.push(email);
    }

    if (!updates.length) {
      return response.json({ user: request.user });
    }

    updates.push(`updated_at = now()`);
    values.push(request.user.id);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')} 
      WHERE id = $${idx} 
      RETURNING id, email, full_name, role
    `;

    const result = await pool.query(query, values);
    if (!result.rowCount) {
      return response.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    response.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_email_key') {
      return response.status(409).json({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
      });
    }
    next(error);
  }
});

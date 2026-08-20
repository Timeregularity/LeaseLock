import { Router } from 'express'
import { pool } from '../db/pool.js'

export const healthRouter = Router()

healthRouter.get('/', (request, response) => {
  response.json({
    status: 'ok',
    service: 'leaselock-api',
    timestamp: new Date().toISOString()
  })
})

healthRouter.get('/ready', async (request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ready', service: 'leaselock-api', database: 'connected' })
  } catch (error) {
    error.status = 503
    error.code = 'DATABASE_UNAVAILABLE'
    error.message = 'The database is not available.'
    next(error)
  }
})

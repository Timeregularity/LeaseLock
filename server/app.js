import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { config } from './config.js'
import { healthRouter } from './routes/health.js'
import { authRouter } from './routes/auth.js'
import { eventsRouter } from './routes/events.js'
import { adminRouter } from './routes/admin.js'
import { holdsRouter } from './routes/holds.js'
import { paymentsRouter } from './routes/payments.js'
import { bookingsRouter } from './routes/bookings.js'
import { waitlistRouter } from './routes/waitlist.js'
import { auditSuccessfulMutations,csrfOriginCheck,requestContext } from './middleware/operations.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(requestContext)
  app.use(helmet())
  app.use(cors({ origin: config.clientOrigin, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(csrfOriginCheck)
  app.use(auditSuccessfulMutations)

  app.use('/v1/health', healthRouter)
  app.use('/v1/auth', authRouter)
  app.use('/v1/events', eventsRouter)
  app.use('/v1/admin', adminRouter)
  app.use('/v1/holds', holdsRouter)
  app.use('/v1/payments', paymentsRouter)
  app.use('/v1/bookings', bookingsRouter)
  app.use('/v1/waitlist', waitlistRouter)

  if(config.nodeEnv==='production'){
    const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist')
    app.use(express.static(dist,{index:false,maxAge:'1d'}))
    app.use((request,response,next)=>request.method==='GET'&&!request.path.startsWith('/v1/')?response.sendFile(path.join(dist,'index.html')):next())
  }

  app.use((request, response) => {
    response.status(404).json({
      code: 'ROUTE_NOT_FOUND',
      message: `No API route exists for ${request.method} ${request.path}.`
    })
  })

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error)

    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error(error)

    return response.status(status).json({
      code: error.code ?? 'INTERNAL_SERVER_ERROR',
      message: status >= 500 ? 'The server could not complete the request.' : error.message,
      ...(status < 500 && error.details ? { details:error.details } : {})
    })
  })

  return app
}

import { createApp } from './app.js'
import { config } from './config.js'
import { runHoldExpiry } from './jobs/expire-holds.js'
import { pool } from './db/pool.js'
import { runWaitlistPromotion } from './jobs/waitlist.js'
import { runCleanup } from './jobs/cleanup.js'
import { runOutboxDelivery } from './jobs/outbox.js'

const server = createApp().listen(config.port, () => {
  console.log(`LeaseLock API listening on http://localhost:${config.port}`)
})

const expiryTimer=setInterval(()=>runHoldExpiry().catch(error=>console.error('Hold expiry job failed',error)),15_000)
expiryTimer.unref()
const waitlistTimer=setInterval(()=>runWaitlistPromotion().catch(error=>console.error('Waitlist promotion failed',error)),15_000)
waitlistTimer.unref()
const cleanupTimer=setInterval(()=>runCleanup().catch(error=>console.error('Cleanup job failed',error)),60*60*1000)
cleanupTimer.unref()
const outboxTimer=setInterval(()=>runOutboxDelivery().catch(error=>console.error('Outbox delivery failed',error)),1_000)
outboxTimer.unref()

function shutdown(signal) {
  clearInterval(expiryTimer)
  clearInterval(waitlistTimer)
  clearInterval(cleanupTimer)
  clearInterval(outboxTimer)
  console.log(`${signal} received. Closing the API server...`)
  server.close(async (error) => {
    if (error) {
      console.error(error)
      process.exit(1)
    }
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

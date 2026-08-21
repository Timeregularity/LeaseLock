import pg from 'pg'
import { config } from '../config.js'
import { currentRequestStore } from '../middleware/request-store.js'

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'leaselock-api'
})

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error))

export async function withTransaction(work) {
  const client = await pool.connect()
  let transactionOpen = false
  let commitAttempted = false
  let destroyed = false
  try {
    await client.query('BEGIN')
    transactionOpen = true
    const result = await work(client)
    const store = currentRequestStore()
    const request = store?.request
    if (request && ['POST','PUT','PATCH','DELETE'].includes(request.method)) {
      const segments=request.path.split('/').filter(Boolean)
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,request_id,metadata)
        VALUES($1,$2,$3,$4,$5,$6)`,[request.user?.id||null,`${request.method} ${request.baseUrl||''}${request.route?.path||request.path}`,segments[0]||'api',request.params?.id||request.params?.identifier||null,request.id,{status:'COMMITTED'}])
      store.transactionAudited=true
    }
    commitAttempted = true
    await client.query('COMMIT')
    transactionOpen = false
    return result
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        error.rollbackError = rollbackError
        client.release(true)
        destroyed = true
        transactionOpen = false
      }
    }
    if (commitAttempted && !destroyed) {
      client.release(true)
      destroyed = true
    }
    throw error
  } finally {
    if (!destroyed) client.release()
  }
}

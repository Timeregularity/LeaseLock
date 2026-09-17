import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './pool.js'

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
const lockId = 73021491

export async function runMigrations() {
  console.log('Connecting to database for migrations...')
  const client = await pool.connect()
  try {
    await client.query('SET lock_timeout = 10000')
    await client.query('SELECT pg_advisory_lock($1)', [lockId])
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(row => row.name))
    for (const file of files) {
      if (applied.has(file)) continue
      await client.query('BEGIN')
      try {
        await client.query(await readFile(path.join(directory, file), 'utf8'))
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`Applied migration: ${file}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    console.log('Database migrations are up to date.')
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {})
    client.release()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async () => {
      await pool.end()
      process.exit(0)
    })
    .catch(async (error) => {
      console.error('Database migration failed:', error)
      await pool.end().catch(() => {})
      process.exit(1)
    })
}


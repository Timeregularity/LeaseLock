import bcrypt from 'bcryptjs'
import { pool, withTransaction } from './pool.js'

const accounts = [
  { email:process.env.SEED_ADMIN_EMAIL||'admin@leaselock.local', password:process.env.SEED_ADMIN_PASSWORD||'Admin123!', fullName:'LeaseLock Admin', role:'ADMIN' },
  { email:process.env.SEED_CUSTOMER_EMAIL||'customer@leaselock.local', password:process.env.SEED_CUSTOMER_PASSWORD||'Customer123!', fullName:'Demo Customer', role:'CUSTOMER' }
]

const events = [
  { slug:'techfest-live', name:'TechFest Live', description:'An evening of ambitious ideas, practical engineering stories, and live product demonstrations.', venue:'Main Auditorium', startsAt:'2026-08-25T13:30:00.000Z' },
  { slug:'systems-summit', name:'Systems Summit', description:'Deep dives into distributed systems, reliability, and resilient products.', venue:'Innovation Hall', startsAt:'2026-09-02T05:00:00.000Z' },
  { slug:'design-code', name:'Design × Code', description:'A focused conversation about bringing design craft and engineering discipline together.', venue:'Studio Theatre', startsAt:'2026-09-12T10:30:00.000Z' }
]

async function upsertAccount(client, account) {
  const passwordHash = await bcrypt.hash(account.password, 12)
  const result = await client.query(`
    INSERT INTO users (email, password_hash, full_name, role)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO UPDATE SET
      password_hash=excluded.password_hash, full_name=excluded.full_name,
      role=excluded.role, is_active=true, updated_at=now()
    RETURNING id
  `, [account.email.trim().toLowerCase(), passwordHash, account.fullName, account.role])
  return result.rows[0].id
}

async function seed() {
  await withTransaction(async client => {
    const adminId = await upsertAccount(client, accounts[0])
    await upsertAccount(client, accounts[1])

    for (const event of events) {
      const eventResult = await client.query(`
        INSERT INTO events (slug, name, description, venue, starts_at, timezone, status, booking_opens_at, booking_closes_at, created_by)
        VALUES ($1, $2, $3, $4, $5, 'Asia/Kolkata', 'PUBLISHED', now(), $5::timestamptz - interval '30 minutes', $6)
        ON CONFLICT (slug) DO UPDATE SET
          name=excluded.name, description=excluded.description, venue=excluded.venue,
          starts_at=excluded.starts_at, timezone=excluded.timezone, status=excluded.status,
          booking_closes_at=excluded.booking_closes_at, updated_at=now()
        RETURNING id
      `, [event.slug,event.name,event.description,event.venue,event.startsAt,adminId])
      const eventId = eventResult.rows[0].id

      for (const section of ['A','B','C','D']) {
        for (let number=1; number<=10; number++) {
          const pricePaise = ['A','B'].includes(section) ? 50_000 : 35_000
          await client.query(`
            INSERT INTO event_seats (event_id, seat_label, section, row_label, seat_number, price_paise)
            VALUES ($1, $2, $3, $3, $4, $5)
            ON CONFLICT (event_id, seat_label) DO UPDATE SET
              section=excluded.section, row_label=excluded.row_label,
              seat_number=excluded.seat_number, price_paise=excluded.price_paise, is_enabled=true
          `, [eventId,`${section}${number}`,section,number,pricePaise])
        }
      }
    }
  })
  console.log(`Seeded ${accounts.length} accounts, ${events.length} events, and ${events.length*40} seats.`)
  console.log(`Admin login: ${accounts[0].email}`)
  console.log(`Customer login: ${accounts[1].email}`)
}

seed().catch(error=>{console.error('Database seed failed',error);process.exitCode=1}).finally(()=>pool.end())

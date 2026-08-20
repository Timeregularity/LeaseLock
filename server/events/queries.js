export const eventSelect = `
  SELECT e.id, e.slug, e.name, e.description, e.venue, e.starts_at, e.timezone, e.status,
    count(es.id)::int AS total_seats,
    count(es.id) FILTER (WHERE es.is_enabled
      AND sc.event_seat_id IS NULL AND bs.event_seat_id IS NULL)::int AS available_seats,
    min(es.price_paise) FILTER (WHERE es.is_enabled) AS minimum_price_paise
  FROM events e
  LEFT JOIN event_seats es ON es.event_id=e.id
  LEFT JOIN seat_claims sc ON sc.event_seat_id=es.id AND sc.expires_at > now()
  LEFT JOIN booking_seats bs ON bs.event_seat_id=es.id AND bs.cancelled_at IS NULL
`

export function toEvent(row) {
  return {
    id:row.slug, databaseId:row.id, title:row.name, description:row.description,
    venue:row.venue, startsAt:row.starts_at, timezone:row.timezone, status:row.status,
    total:row.total_seats, available:row.available_seats,
    price:Number(row.minimum_price_paise||0)/100
  }
}

export async function findEvent(client, identifier, { lock=false, shared=false }={}) {
  const lockClause=lock?'FOR UPDATE':shared?'FOR SHARE':''
  const result = await client.query(`SELECT * FROM events WHERE id::text=$1 OR slug=$1 ${lockClause}`, [identifier])
  return result.rows[0]||null
}

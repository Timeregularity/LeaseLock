export async function enqueueSeatChange(client,eventId,reason) {
  await client.query("INSERT INTO event_outbox(topic,aggregate_id,payload) VALUES('seats-changed',$1,$2)",[eventId,{eventId,reason}])
}

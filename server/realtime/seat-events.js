const subscribers=new Map()

export function subscribeToSeatEvents(eventId,response){
  if(!subscribers.has(eventId))subscribers.set(eventId,new Set())
  const clients=subscribers.get(eventId);clients.add(response)
  response.write(`event: connected\ndata: ${JSON.stringify({eventId})}\n\n`)
  return()=>{clients.delete(response);if(!clients.size)subscribers.delete(eventId)}
}

export function broadcastSeatChange(eventId,reason='inventory-changed'){
  const message=`event: seats-changed\ndata: ${JSON.stringify({eventId,reason,at:new Date().toISOString()})}\n\n`
  for(const response of subscribers.get(eventId)||[]){if(!response.writableEnded)response.write(message)}
}

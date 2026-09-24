const subscribers = new Map();
const activeDrafts = new Map();

export function getActiveDrafts(eventId) {
  const drafts = activeDrafts.get(eventId);
  if (!drafts) return [];
  const list = [];
  for (const [clientId, seatSet] of drafts.entries()) {
    if (seatSet.size > 0) {
      list.push({ clientId, seatIds: Array.from(seatSet) });
    }
  }
  return list;
}

export function broadcastDrafts(eventId) {
  const drafts = getActiveDrafts(eventId);
  const message = `event: drafts-changed\ndata: ${JSON.stringify({ eventId, drafts })}\n\n`;
  for (const response of subscribers.get(eventId) || []) {
    if (!response.writableEnded) response.write(message);
  }
}

export function updateClientDraft(eventId, clientId, seatIds = []) {
  if (!activeDrafts.has(eventId)) activeDrafts.set(eventId, new Map());
  const drafts = activeDrafts.get(eventId);
  if (!seatIds || !seatIds.length) {
    drafts.delete(clientId);
  } else {
    drafts.set(clientId, new Set(seatIds.map(String)));
  }
  broadcastDrafts(eventId);
}

export function subscribeToSeatEvents(eventId, response, clientId) {
  if (!subscribers.has(eventId)) subscribers.set(eventId, new Set());
  const clients = subscribers.get(eventId);
  clients.add(response);

  const initialDrafts = getActiveDrafts(eventId);
  response.write(
    `event: connected\ndata: ${JSON.stringify({ eventId, drafts: initialDrafts })}\n\n`,
  );

  return () => {
    clients.delete(response);
    if (!clients.size) {
      subscribers.delete(eventId);
    }
    if (clientId && activeDrafts.has(eventId)) {
      activeDrafts.get(eventId).delete(clientId);
      broadcastDrafts(eventId);
    }
  };
}

export function broadcastSeatChange(eventId, reason = 'inventory-changed') {
  const message = `event: seats-changed\ndata: ${JSON.stringify({ eventId, reason, at: new Date().toISOString() })}\n\n`;
  for (const response of subscribers.get(eventId) || []) {
    if (!response.writableEnded) response.write(message);
  }
}

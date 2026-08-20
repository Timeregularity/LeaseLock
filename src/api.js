export class ApiError extends Error {
  constructor(message, status = 0, code = 'UNKNOWN_ERROR', details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const statusMessages = {
  400: 'Check the information and try again.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to do that.',
  404: 'The requested item is no longer available.',
  409: 'That resource changed before your request completed.',
  429: 'Too many requests. Please wait a moment.',
  500: 'The server could not complete the request.'
}

export async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  try {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers })
    const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
    if (!response.ok) {
      if (response.status === 401 && !url.endsWith('/auth/login')) window.dispatchEvent(new Event('leaselock:unauthorized'))
      throw new ApiError(payload?.message || statusMessages[response.status] || 'The request could not be completed.', response.status, payload?.code || `HTTP_${response.status}`, payload?.details)
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('We could not reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR')
  }
}

export function idempotencyKey(operation, resourceId) {
  const storageKey = `ll:idempotency:${operation}:${resourceId}`
  let key = sessionStorage.getItem(storageKey)
  if (!key) {
    key = crypto.randomUUID()
    sessionStorage.setItem(storageKey, key)
  }
  return key
}

export function clearIdempotencyKey(operation, resourceId) {
  sessionStorage.removeItem(`ll:idempotency:${operation}:${resourceId}`)
}

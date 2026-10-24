// Test doubles for the HTTP adapter: a recording fetch that answers from a handler, and an in-memory Storage.
export function createFakeFetch(handler) {
  const calls = []
  const fakeFetch = async (url, init = {}) => {
    const call = {
      url: String(url), method: init.method ?? 'GET', headers: { ...(init.headers ?? {}) },
      rawBody: init.body, body: init.body === undefined ? undefined : JSON.parse(init.body),
      signal: init.signal, credentials: init.credentials, cache: init.cache,
    }
    calls.push(call)
    const answer = await handler(call, calls.length - 1)
    if (answer instanceof Response) return answer
    const { status = 200, json, text, headers } = answer
    const body = status === 204 ? null : text !== undefined ? text : json === undefined ? '' : JSON.stringify(json)
    return new Response(body, { status, headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers } })
  }
  return { fetch: fakeFetch, calls }
}

export const reply = (status, json) => ({ status, json })

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => { map.set(key, String(value)) }, removeItem: (key) => { map.delete(key) } }
}

export const blockedStorage = () => ({
  getItem() { throw new DOMException('blocked', 'SecurityError') },
  setItem() { throw new DOMException('blocked', 'SecurityError') },
  removeItem() { throw new DOMException('blocked', 'SecurityError') },
})

export const TOKEN = 'T'.repeat(43)
export const session = (overrides = {}) => ({ token: TOKEN, expiresAt: '2026-10-25T08:00:00.123456Z', user: { id: 'u-1', username: 'maya_student', role: 'student' }, ...overrides })
export const errorBody = (code, message, extra = {}) => ({ code, message, ...extra })

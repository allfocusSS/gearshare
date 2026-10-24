import { createHttpClient, createTokenStore } from './httpClient.ts'
import type { SessionEnd, SessionListener, TokenStore } from './httpClient.ts'
import type { Asset, AssetFilters, AssetInput, Credentials, GearShareService, ServiceResult, User } from './types.ts'
import { parseArray, parseAsset, parseAvailability, parseBooking, parseCatalogue, parseSession, parseStaffDesk, parseUser } from './wire.ts'

/**
 * `GearShareService` over the versioned `/api/v1` HTTP contract (openapi.yml, `x-service-method`).
 *
 * Rules this adapter keeps (see _docs/api.md and _docs/architecture.md):
 * - it never falls back to mock data, never retries and never refreshes a version for the caller;
 * - only contract fields are sent: identity, role, ownership, state and version are never taken from input beyond
 *   the documented `expectedVersion` the caller read from its own snapshot;
 * - the bearer token is held in sessionStorage (memory when storage is blocked), cleared on any session-ending 401
 *   and on logout, and sent only to operations that need it.
 */
export interface HttpServiceOptions {
  baseUrl?: string
  fetch?: typeof fetch
  tokens?: TokenStore
  timeoutMs?: number
}

const encode = encodeURIComponent
const BOOKINGS = '/api/v1/bookings'
const STAFF = '/api/v1/staff'

export function createHttpService(options: HttpServiceOptions = {}) {
  const tokens = options.tokens ?? createTokenStore()
  const listeners = new Set<SessionListener>()
  const notify = (event: SessionEnd) => { for (const listener of [...listeners]) { try { listener(event) } catch { /* a listener must not break the adapter */ } } }
  const client = createHttpClient({ baseUrl: options.baseUrl, fetch: options.fetch, tokens, timeoutMs: options.timeoutMs, onSessionEnd: notify })
  const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data })

  const service: GearShareService = {
    async register(credentials: Credentials) {
      const result = await client.request({ method: 'POST', path: '/api/v1/auth/register', auth: 'none', body: { username: credentials.username, password: credentials.password }, parse: parseSession })
      if (!result.ok) return result
      tokens.set(result.data.token)
      return ok<User>(result.data.user)
    },
    async login(credentials: Credentials) {
      const result = await client.request({ method: 'POST', path: '/api/v1/auth/login', auth: 'none', body: { username: credentials.username, password: credentials.password }, parse: parseSession })
      if (!result.ok) return result
      tokens.set(result.data.token)
      return ok<User>(result.data.user)
    },
    async logout() {
      if (tokens.get() === null) return ok(null)
      const result = await client.request({ method: 'POST', path: '/api/v1/auth/logout', auth: 'bearer', keepSessionOn401: true })
      // Local credentials always go: the user asked to sign out. Only a server answer proves the session was revoked there.
      tokens.clear()
      if (result.ok || result.error.status === 401) return ok(null)
      const message = 'You are signed out on this device, but the server could not be reached, so it was not told to end the session. It stays valid on the server for up to 24 hours from sign-in.'
      notify({ reason: 'logout-unconfirmed', message })
      return { ok: false, error: { ...result.error, code: 'SERVICE_UNAVAILABLE', message } }
    },
    async currentUser() {
      if (tokens.get() === null) return ok(null)
      const result = await client.request({ method: 'GET', path: '/api/v1/auth/me', auth: 'bearer', parse: parseUser })
      if (result.ok) return result
      return result.error.status === 401 ? ok(null) : result
    },
    listAssets(filters: AssetFilters = {}) {
      return client.request({ method: 'GET', path: '/api/v1/assets', auth: 'none', parse: parseCatalogue, query: {
        search: filters.search || undefined, category: filters.category || undefined, startDate: filters.startDate || undefined, endDate: filters.endDate || undefined,
      } })
    },
    getAsset(id) {
      return client.request({ method: 'GET', path: `/api/v1/assets/${encode(id)}`, auth: 'none', parse: parseAsset })
    },
    getAssetAvailability(id) {
      return client.request({ method: 'GET', path: `/api/v1/assets/${encode(id)}/availability`, auth: 'none', parse: parseAvailability })
    },
    requestBooking(input) {
      return client.request({ method: 'POST', path: BOOKINGS, auth: 'bearer', parse: parseBooking, body: { assetId: input.assetId, startDate: input.startDate, endDate: input.endDate, purpose: input.purpose } })
    },
    listBookings() {
      return client.request({ method: 'GET', path: BOOKINGS, auth: 'bearer', parse: (json) => parseArray(json, parseBooking) })
    },
    getBooking(id) {
      return client.request({ method: 'GET', path: `${BOOKINGS}/${encode(id)}`, auth: 'bearer', parse: parseBooking })
    },
    cancelBooking(id, input) {
      return client.request({ method: 'POST', path: `${BOOKINGS}/${encode(id)}/cancel`, auth: 'bearer', parse: parseBooking, body: { expectedVersion: input?.expectedVersion } })
    },
    listStaffBookings() {
      return client.request({ method: 'GET', path: `${STAFF}/bookings`, auth: 'bearer', parse: parseStaffDesk })
    },
    approveBooking(id, input) {
      return client.request({ method: 'POST', path: `${STAFF}/bookings/${encode(id)}/approve`, auth: 'bearer', parse: parseBooking, body: { expectedVersion: input?.expectedVersion } })
    },
    rejectBooking(id, input) {
      return client.request({ method: 'POST', path: `${STAFF}/bookings/${encode(id)}/reject`, auth: 'bearer', parse: parseBooking, body: { expectedVersion: input?.expectedVersion, note: input?.note } })
    },
    checkoutBooking(id, input) {
      return client.request({ method: 'POST', path: `${STAFF}/bookings/${encode(id)}/checkout`, auth: 'bearer', parse: parseBooking, body: { expectedVersion: input?.expectedVersion, note: input?.note } })
    },
    returnBooking(id, input) {
      return client.request({ method: 'POST', path: `${STAFF}/bookings/${encode(id)}/return`, auth: 'bearer', parse: parseBooking, body: { expectedVersion: input?.expectedVersion, note: input?.note } })
    },
    listInventory() {
      return client.request({ method: 'GET', path: `${STAFF}/assets`, auth: 'bearer', parse: (json) => parseArray(json, parseAsset) })
    },
    addAsset(input: AssetInput) {
      return client.request({ method: 'POST', path: `${STAFF}/assets`, auth: 'bearer', parse: parseAsset, body: assetBody(input) })
    },
    editAsset(id, input: AssetInput) {
      return client.request({ method: 'PUT', path: `${STAFF}/assets/${encode(id)}`, auth: 'bearer', parse: parseAsset, body: assetBody(input) })
    },
    setAssetState(id, state: Asset['state']) {
      return client.request({ method: 'PUT', path: `${STAFF}/assets/${encode(id)}/state`, auth: 'bearer', parse: parseAsset, body: { state } })
    },
  }

  const session = {
    /** Notified when the session ends outside the normal sign-out flow (401 anywhere, or an unconfirmed logout). */
    subscribe(listener: SessionListener): () => void { listeners.add(listener); return () => { listeners.delete(listener) } },
    hasToken: () => tokens.get() !== null,
  }
  return { service, session }
}

/** Only the editable contract fields: never an id, state, owner or audit property from the caller. */
function assetBody(input: AssetInput) {
  return { name: input.name, inventoryCode: input.inventoryCode, category: input.category, location: input.location, description: input.description }
}

export type HttpSession = ReturnType<typeof createHttpService>['session']

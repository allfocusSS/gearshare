import type { ServiceError, ServiceErrorCode, ServiceResult } from './types.ts'
import { parseErrorEnvelope } from './wire.ts'

/**
 * The one small shared HTTP client. It owns the bearer token, the request/response envelope and the mapping of every
 * failure (network, timeout, 4xx/5xx, invalid JSON, wrong shape) into a `ServiceResult` error. It never throws, never
 * retries and never invents data: a request either yields a validated payload or a typed error.
 */

export const SESSION_STORAGE_KEY = 'gearshare.session-token'
export const DEFAULT_TIMEOUT_MS = 15_000

export interface TokenStore {
  get(): string | null
  set(token: string): void
  clear(): void
}

/**
 * Token lives in sessionStorage (per tab, gone when the tab closes; never localStorage, cookies or a URL). Storage can be
 * blocked or throw (privacy modes, quota, sandboxed frames): then the token is kept in memory for the lifetime of the
 * page and the app keeps working, it just cannot survive a reload.
 */
export function createTokenStore(getStorage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined = () => globalThis.sessionStorage): TokenStore {
  let memory: string | null = null
  let persisted = true
  const storage = () => { try { return getStorage() ?? null } catch { return null } }
  return {
    get() {
      if (persisted) {
        try {
          const store = storage()
          if (store) { memory = store.getItem(SESSION_STORAGE_KEY); return memory }
        } catch { /* fall through to memory */ }
        persisted = false
      }
      return memory
    },
    set(token) {
      memory = token
      try {
        const store = storage()
        if (!store) throw new Error('no storage')
        store.setItem(SESSION_STORAGE_KEY, token)
        persisted = true
      } catch { persisted = false }
    },
    clear() {
      memory = null
      try { storage()?.removeItem(SESSION_STORAGE_KEY) } catch { /* nothing else to clear */ }
    },
  }
}

export type SessionEndReason = 'unauthenticated' | 'logout-unconfirmed'
export interface SessionEnd { reason: SessionEndReason; message: string }
export type SessionListener = (event: SessionEnd) => void

export interface RequestSpec<T> {
  method: 'GET' | 'POST' | 'PUT'
  /** Absolute path below the API root, path parameters already encoded, e.g. `/api/v1/bookings/b%201`. */
  path: string
  query?: Record<string, string | undefined>
  body?: unknown
  /** `bearer` sends the stored token; `none` never sends it (public operations, login, register). */
  auth: 'none' | 'bearer'
  /** Validates and projects a 2xx JSON body; returning null marks it an invalid response. Omit for 204 operations. */
  parse?: (json: unknown) => T | null
  /** A 401 normally ends the session (clears the token, notifies listeners). Logout handles its own 401. */
  keepSessionOn401?: boolean
}

export interface HttpClientOptions {
  baseUrl?: string
  fetch?: typeof fetch
  tokens: TokenStore
  timeoutMs?: number
  onSessionEnd?: SessionListener
}

export const MESSAGES = {
  network: 'Could not reach the GearShare server. Check your connection and try again.',
  timeout: 'The GearShare server took too long to respond. Try again.',
  invalid: 'The GearShare server sent a response this app cannot use. Try again in a moment.',
  unavailable: 'The GearShare server is unavailable right now. Try again in a moment.',
  unauthenticated: 'Your session has ended. Sign in again to continue.',
} as const

function codeForStatus(status: number): ServiceErrorCode {
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404 || status === 405) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 422 || status === 400) return 'VALIDATION_ERROR'
  return 'SERVICE_UNAVAILABLE'
}

const fail = <T>(error: ServiceError): ServiceResult<T> => ({ ok: false, error })
const unavailable = <T>(message: string, status?: number): ServiceResult<T> => fail({ code: 'SERVICE_UNAVAILABLE', message, ...(status === undefined ? {} : { status }) })

function messageForStatus(status: number): string {
  if (status === 401) return MESSAGES.unauthenticated
  if (status === 403) return 'Coordinator access is required for this action.'
  if (status === 404 || status === 405) return 'This item could not be found.'
  if (status === 409) return 'The request conflicts with the current state. Refresh and review before trying again.'
  if (status === 422 || status === 400) return 'Check the submitted values and try again.'
  return MESSAGES.unavailable
}

export function createHttpClient(options: HttpClientOptions) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const send: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const { tokens } = options

  async function request<T = null>(spec: RequestSpec<T>): Promise<ServiceResult<T>> {
    const sentToken = spec.auth === 'bearer' ? tokens.get() : null
    const query = Object.entries(spec.query ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)
    const search = query.length ? `?${new URLSearchParams(query).toString()}` : ''
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (sentToken) headers.Authorization = `Bearer ${sentToken}`
    if (spec.body !== undefined) headers['Content-Type'] = 'application/json'

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    let status: number
    let text: string
    try {
      const response = await send(`${baseUrl}${spec.path}${search}`, {
        method: spec.method, headers, signal: controller.signal, credentials: 'omit', cache: 'no-store',
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      })
      status = response.status
      text = await response.text()
    } catch {
      return unavailable(timedOut ? MESSAGES.timeout : MESSAGES.network)
    } finally {
      clearTimeout(timer)
    }

    if (status >= 200 && status < 300) {
      if (!spec.parse) return status === 204 || text.trim() === '' ? { ok: true, data: null as T } : unavailable(MESSAGES.invalid, status)
      let json: unknown
      try { json = JSON.parse(text) } catch { return unavailable(MESSAGES.invalid, status) }
      let data: T | null = null
      try { data = spec.parse(json) } catch { data = null }
      return data === null ? unavailable(MESSAGES.invalid, status) : { ok: true, data }
    }

    let envelope: ReturnType<typeof parseErrorEnvelope> = null
    try { envelope = parseErrorEnvelope(JSON.parse(text)) } catch { envelope = null }
    // A 5xx always means "try again"; a client-error status keeps the documented code the server sent.
    const error: ServiceError = envelope && !(status >= 500 && envelope.code !== 'SERVICE_UNAVAILABLE')
      ? { ...envelope, status }
      : { code: codeForStatus(status), message: messageForStatus(status), status }

    if (status === 401 && spec.auth === 'bearer' && !spec.keepSessionOn401) {
      error.code = 'UNAUTHENTICATED'
      // Only end the session this request actually used; a newer sign-in must survive a late 401 from an old token.
      if (sentToken !== null && tokens.get() === sentToken) {
        tokens.clear()
        options.onSessionEnd?.({ reason: 'unauthenticated', message: MESSAGES.unauthenticated })
      }
    }
    return fail(error)
  }

  return { request, tokens }
}

export type HttpClient = ReturnType<typeof createHttpClient>

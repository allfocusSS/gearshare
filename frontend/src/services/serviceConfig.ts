/**
 * Build-time configuration of the service adapter. Kept free of `import.meta` so Node tests can import it.
 *
 *   VITE_GEARSHARE_SERVICE  `http` (default, also when empty/unset) or `mock`. Any other value is a startup error:
 *                           a typo must never silently select an adapter.
 *   VITE_API_BASE_URL       Empty (default) means same origin, so requests go to `/api/v1/...` and the Vite dev/preview
 *                           proxy forwards them to the backend. A non-empty value is an absolute http(s) origin
 *                           (optionally with a path prefix) or an absolute path; it needs a backend that accepts
 *                           cross-origin requests, which the MVP backend does not (see README and _docs/api.md).
 */
export type ServiceMode = 'http' | 'mock'

export function resolveServiceMode(raw: string | undefined | null): ServiceMode {
  const value = (raw ?? '').trim()
  if (value === '' || value === 'http') return 'http'
  if (value === 'mock') return 'mock'
  throw new Error(`VITE_GEARSHARE_SERVICE must be "http" or "mock", received "${value}".`)
}

export function resolveApiBaseUrl(raw: string | undefined | null): string {
  const value = (raw ?? '').trim()
  if (value === '') return ''
  const absolute = /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(value)
  const path = /^\/[^\s?#]*$/.test(value) && !value.startsWith('//')
  if (!absolute && !path) {
    throw new Error('VITE_API_BASE_URL must be empty (same origin), an absolute http(s) URL such as http://127.0.0.1:8000, or an absolute path such as /backend.')
  }
  return value.replace(/\/+$/, '')
}

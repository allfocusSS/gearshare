import { createHttpService } from './httpService.ts'
import type { SessionEnd } from './httpClient.ts'
import { createMockService } from './mockService.ts'
import { resolveApiBaseUrl, resolveServiceMode } from './serviceConfig.ts'

/**
 * The single place that chooses the adapter. HTTP against the persisted backend is the default; the in-memory mock is
 * only selected explicitly with VITE_GEARSHARE_SERVICE=mock (README, `.env.example`). There is no runtime fallback from
 * one adapter to the other: a failed HTTP call stays a failure.
 */
export const serviceMode = resolveServiceMode(import.meta.env.VITE_GEARSHARE_SERVICE)
export const isMockMode = serviceMode === 'mock'

const mock = isMockMode ? createMockService() : null
const http = isMockMode ? null : createHttpService({ baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL) })

export const gearShareService = (mock ?? http)!.service
/** Demo fixtures and failure injection exist only for the mock; `null` means the UI must not offer them. */
export const demoControls = mock?.demo ?? null

/** Session-ending events (a 401 from any request, an unconfirmed logout). The mock never produces them. */
export function subscribeToSessionEnd(listener: (event: SessionEnd) => void): () => void {
  return http ? http.session.subscribe(listener) : () => {}
}
export type { SessionEnd }

// Independent QA seam: real detail component and mock service, controlled delivery only.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AssetDetailPage } from '../../src/pages/AssetDetailPage.tsx'
import { createMockService, DEMO_ACCOUNTS } from '../../src/services/mockService.ts'
import type { AssetAvailability, Booking, ServiceResult } from '../../src/services/types.ts'

const { service, demo } = createMockService({ now: () => new Date('2026-10-19T06:00:00Z'), sleep: async () => {} })
const login = await service.login(DEMO_ACCOUNTS.student)
if (!login.ok) throw new Error('QA fixture sign-in failed')
const root = createRoot(document.getElementById('root')!)
const control = {
  service, demo, holdAvailability: false, holdRequest: false, calls: 0,
  availability: [] as { assetId: string; snapshot: ServiceResult<AssetAvailability>; resolve: () => void; fail: () => void }[],
  requests: [] as { resolve: () => void }[],
  render: (id: string) => render(id),
}
const wrapped = {
  ...service,
  requestBooking: async (input: Parameters<typeof service.requestBooking>[0]) => {
    control.calls++
    if (!control.holdRequest) return service.requestBooking(input)
    return new Promise<ServiceResult<Booking>>(resolve => control.requests.push({ resolve: () => { void service.requestBooking(input).then(resolve) } }))
  },
  getAssetAvailability: async (assetId: string) => {
    const snapshot = await service.getAssetAvailability(assetId)
    if (!control.holdAvailability) return snapshot
    return new Promise<typeof snapshot>(resolve => control.availability.push({
      assetId, snapshot, resolve: () => resolve(snapshot),
      fail: () => resolve({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled QA refresh failure' } }),
    }))
  },
}
function render(assetId: string) { root.render(<AssetDetailPage assetId={assetId} service={wrapped} user={login.data} />) }
Object.assign(window, { qa25: control })
render('accessory-03')

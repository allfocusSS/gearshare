import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockService } from '../src/services/mockService.ts'
import { addDays, clubToday, inclusiveDays, isCalendarDate, validateDateRange } from '../src/services/dates.ts'
const NOW = '2026-10-19T06:00:00Z'
const T = '2026-10-19'
const make = (extra = {}) => createMockService({ now: () => new Date(NOW), sleep: async () => {}, ...extra })
const unwrap = (result) => { assert.equal(result.ok, true); return result.data }
const fail = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.equal('data' in result, false); return result.error }

test('catalogue has ten fictional physical units with unique codes and all categories', async () => {
  const { service } = make()
  const list = unwrap(await service.listAssets())
  assert.equal(list.items.length, 10)
  assert.equal(new Set(list.items.map(a => a.id)).size, 10)
  assert.equal(new Set(list.items.map(a => a.inventoryCode)).size, 10)
  assert.deepEqual([...new Set(list.items.map(a => a.category))].sort(), ['Accessories', 'Audio', 'Cameras', 'Presentation'])
  assert.equal(list.range, null)
  assert.equal(list.today, T)
  assert.equal(list.horizonEnd, addDays(T, 90))
  for (const asset of list.items) {
    assert.ok(asset.name && asset.location && asset.description)
    assert.deepEqual(unwrap(await service.getAsset(asset.id)), asset)
  }
})

test('search, category and paired dates combine as an intersection, case-insensitively', async () => {
  const { service } = make()
  assert.equal(unwrap(await service.listAssets({ search: '  field CAMERA ' })).items.length, 2)
  assert.equal(unwrap(await service.listAssets({ search: 'North desk', category: 'Audio' })).items.length, 0)
  const filters = { search: 'CAM', category: 'Cameras', startDate: addDays(T, 1), endDate: addDays(T, 1) }
  assert.deepEqual(unwrap(await service.listAssets(filters)).items.map(a => a.id), ['camera-01'])
  assert.equal(unwrap(await service.listAssets({ ...filters, startDate: addDays(T, 2), endDate: addDays(T, 4) })).items.length, 0)
  assert.equal(unwrap(await service.listAssets({ search: 'does-not-exist' })).items.length, 0)
  fail(await service.listAssets({ category: 'Unknown' }), 'VALIDATION_ERROR')
})

test('same-day occupied endpoints are inclusive and following-day adjacency is available', async () => {
  const { service } = make()
  const one = async offset => unwrap(await service.listAssets({ search: 'CAM-001', startDate: addDays(T, offset), endDate: addDays(T, offset) })).items.length
  assert.equal(await one(1), 1)
  assert.equal(await one(2), 0)
  assert.equal(await one(4), 0)
  assert.equal(await one(5), 1)
  assert.equal(inclusiveDays(T, T), 1)
  assert.equal(inclusiveDays(T, addDays(T, 13)), 14)
})

test('selectable range rejects partial, malformed, past, reversed, 15-day and beyond-horizon input', async () => {
  const { service } = make()
  for (const [startDate, endDate] of [[T, ''], ['', T], ['2026-02-30', T], [addDays(T, -1), T], [addDays(T, 1), T], [T, addDays(T, 14)], [T, addDays(T, 91)], [addDays(T, 91), addDays(T, 91)]]) {
    const error = fail(await service.listAssets({ startDate, endDate }), 'VALIDATION_ERROR')
    assert.ok(error.fields.startDate || error.fields.endDate)
  }
  assert.ok(unwrap(await service.listAssets()).items.length)
})

test('today, exact 14 days and the 90-day horizon boundary are independently valid', async () => {
  const { service } = make()
  for (const [startDate, endDate] of [[T, T], [T, addDays(T, 13)], [addDays(T, 90), addDays(T, 90)], [addDays(T, 77), addDays(T, 90)]]) {
    const result = unwrap(await service.listAssets({ search: 'ACC-001', startDate, endDate }))
    assert.equal(result.items.length, 1)
    assert.deepEqual(result.range, { startDate, endDate })
  }
})

test('maintenance is explicit publicly and never appears available for a selected range', async () => {
  const { service } = make()
  const asset = unwrap(await service.getAsset('camera-03'))
  assert.equal(asset.state, 'maintenance')
  assert.equal(unwrap(await service.listAssets({ search: 'CAM-003' })).items.length, 1)
  assert.equal(unwrap(await service.listAssets({ search: 'CAM-003', startDate: T, endDate: T })).items.length, 0)
  assert.ok(unwrap(await service.getAssetAvailability('camera-03')).days.every(day => day.state === 'maintenance'))
})

test('anonymous availability contains only dates/states across the club-local window', async () => {
  const { service } = make()
  const availability = unwrap(await service.getAssetAvailability('camera-01'))
  assert.deepEqual(Object.keys(availability).sort(), ['assetId', 'days', 'horizonEnd', 'timeZone', 'today'])
  assert.equal(availability.days.length, 91)
  assert.equal(availability.days[0].date, T)
  assert.equal(availability.days[90].date, addDays(T, 90))
  assert.equal(availability.timeZone, 'Asia/Almaty')
  assert.deepEqual(availability.days.filter(d => d.state === 'occupied').map(d => d.date), [2, 3, 4].map(offset => addDays(T, offset)))
  for (const day of availability.days) assert.deepEqual(Object.keys(day).sort(), ['date', 'state'])
  for (const asset of unwrap(await service.listAssets()).items) assert.deepEqual(Object.keys(asset).sort(), ['category', 'description', 'id', 'inventoryCode', 'location', 'name', 'state'])
})

test('public catalogue/detail/availability do not change or reveal extra fields for signed-in roles', async () => {
  const { service } = make()
  const before = [unwrap(await service.listAssets()), unwrap(await service.getAsset('camera-01')), unwrap(await service.getAssetAvailability('camera-01'))]
  unwrap(await service.login({ username: 'alex_coordinator', password: 'CoordinatorDemo42!' }))
  const after = [unwrap(await service.listAssets()), unwrap(await service.getAsset('camera-01')), unwrap(await service.getAssetAvailability('camera-01'))]
  assert.deepEqual(after, before)
  assert.equal(/borrower|purpose|bookingId|privateNote|username|password/.test(JSON.stringify(after)), false)
})

test('public result mutation cannot change future asset or schedule results', async () => {
  const { service } = make()
  const asset = unwrap(await service.getAsset('camera-01'))
  asset.state = 'maintenance'
  const availability = unwrap(await service.getAssetAvailability(asset.id))
  availability.days[0].state = 'occupied'
  assert.equal(unwrap(await service.getAsset(asset.id)).state, 'active')
  assert.equal(unwrap(await service.getAssetAvailability(asset.id)).days[0].state, 'available')
})

test('missing assets, empty fixtures and typed service failures return no private data', async () => {
  const { service, demo } = make()
  fail(await service.getAsset('unknown'), 'NOT_FOUND')
  fail(await service.getAssetAvailability('unknown'), 'NOT_FOUND')
  demo.setScenario('empty')
  assert.equal(unwrap(await service.listAssets()).items.length, 0)
  fail(await service.getAsset('camera-01'), 'NOT_FOUND')
  demo.setScenario('error')
  fail(await service.listAssets(), 'SERVICE_UNAVAILABLE')
  fail(await service.getAsset('camera-01'), 'SERVICE_UNAVAILABLE')
  fail(await service.getAssetAvailability('camera-01'), 'SERVICE_UNAVAILABLE')
  demo.setScenario('normal')
  assert.equal(unwrap(await service.listAssets()).items.length, 10)
})

test('fixtures are relative to injected club-local today, including a UTC date boundary', async () => {
  const { service } = make({ now: () => new Date('2026-12-31T20:00:00Z') })
  const current = '2027-01-01'
  const availability = unwrap(await service.getAssetAvailability('camera-01'))
  assert.equal(availability.today, current)
  assert.equal(availability.days.find(d => d.date === addDays(current, 2)).state, 'occupied')
  assert.equal(clubToday(new Date('2026-12-31T20:00:00Z')), current)
  assert.equal(isCalendarDate('2026-02-30'), false)
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.equal(validateDateRange('', '', current), null)
})

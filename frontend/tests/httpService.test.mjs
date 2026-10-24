import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { SESSION_STORAGE_KEY, createTokenStore } from '../src/services/httpClient.ts'
import { createHttpService } from '../src/services/httpService.ts'
import { resolveApiBaseUrl, resolveServiceMode } from '../src/services/serviceConfig.ts'
import { TOKEN, blockedStorage, createFakeFetch, errorBody, memoryStorage, reply, session } from './support/fakeFetch.mjs'

// #13/#14: the HTTP adapter against an injected fetch double that serves contract-shaped answers and every failure mode.
const samples = JSON.parse(readFileSync(new URL('./fixtures/contract-samples.json', import.meta.url), 'utf8')).samples
const sample = (method, label = '', status) => {
  const found = samples.find((entry) => entry.method === method && entry.label === label && (status === undefined || entry.status === status))
  assert.ok(found, `missing contract sample ${method}/${label}`)
  return found
}
const ok200 = (method, label = '') => reply(200, sample(method, label, 200).body)

function setup(handler, { storage = memoryStorage(), timeoutMs = 2000, baseUrl = '' } = {}) {
  const fake = createFakeFetch(handler)
  const events = []
  const { service, session: sessionApi } = createHttpService({ fetch: fake.fetch, tokens: createTokenStore(() => storage), timeoutMs, baseUrl })
  sessionApi.subscribe((event) => events.push(event))
  return { service, calls: fake.calls, events, storage, sessionApi }
}
const signedIn = (handler, options) => {
  const storage = options?.storage ?? memoryStorage({ [SESSION_STORAGE_KEY]: TOKEN })
  return setup(handler, { ...options, storage })
}

test('register and login send only credentials, hold the token in sessionStorage and return the public user', async () => {
  const { service, calls, storage } = setup(() => reply(201, session()))
  const registered = await service.register({ username: 'Maya_Student', password: 'StudentDemo42!', role: 'coordinator', id: 'x' })
  assert.deepEqual(registered, { ok: true, data: { id: 'u-1', username: 'maya_student', role: 'student' } })
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, '/api/v1/auth/register')
  assert.deepEqual(calls[0].body, { username: 'Maya_Student', password: 'StudentDemo42!' }, 'role/id injected by a caller are never sent')
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.equal(calls[0].headers['Content-Type'], 'application/json')
  assert.equal(calls[0].credentials, 'omit')
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), TOKEN)
  assert.equal(JSON.stringify(registered).includes(TOKEN), false, 'the token never leaves the adapter')
  const login = await service.login({ username: 'maya_student', password: 'StudentDemo42!' })
  assert.equal(login.ok, true)
  assert.equal(calls[1].url, '/api/v1/auth/login')
})

test('wrong credentials, validation and duplicate usernames use the contract errors and keep the session untouched', async () => {
  const answers = [
    reply(401, errorBody('INVALID_CREDENTIALS', 'Username or password is incorrect.')),
    reply(422, errorBody('VALIDATION_ERROR', 'Check the highlighted fields.', { fields: { username: 'Use 3–30 ASCII letters, digits or underscores.', password: 'Use a password with 10–128 Unicode code points.', unknown: 'dropped' } })),
    reply(409, errorBody('USERNAME_TAKEN', 'That username is already in use.', { fields: { username: 'Choose a different username.' } })),
  ]
  const { service, events, storage } = signedIn((_call, index) => answers[index])
  const wrong = await service.login({ username: 'maya_student', password: 'nope-nope-nope' })
  assert.deepEqual(wrong, { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect.', status: 401 } })
  const invalid = await service.register({ username: 'a', password: 'x' })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'VALIDATION_ERROR')
  assert.equal(invalid.error.status, 422)
  assert.deepEqual(Object.keys(invalid.error.fields).sort(), ['password', 'username'])
  const taken = await service.register({ username: 'maya_student', password: 'StudentDemo42!' })
  assert.deepEqual(taken.error.fields, { username: 'Choose a different username.' })
  assert.equal(taken.error.code, 'USERNAME_TAKEN')
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), TOKEN, 'a failed login is not an expired session: nothing is cleared')
  assert.deepEqual(events, [])
})

test('currentUser makes no request without a token, restores the session after a reload and maps 401 to null', async () => {
  const none = setup(() => assert.fail('no request expected'))
  assert.deepEqual(await none.service.currentUser(), { ok: true, data: null })
  assert.equal(none.calls.length, 0)

  const storage = memoryStorage()
  const first = setup(() => reply(200, session()), { storage })
  await first.service.login({ username: 'maya_student', password: 'StudentDemo42!' })
  const reloaded = setup((call) => (call.headers.Authorization === `Bearer ${TOKEN}` ? reply(200, session().user) : reply(401, errorBody('UNAUTHENTICATED', 'Sign in to continue.'))), { storage })
  const restored = await reloaded.service.currentUser()
  assert.deepEqual(restored, { ok: true, data: { id: 'u-1', username: 'maya_student', role: 'student' } })
  assert.equal(reloaded.calls[0].method, 'GET')
  assert.equal(reloaded.calls[0].url, '/api/v1/auth/me')

  const stale = signedIn(() => reply(401, errorBody('UNAUTHENTICATED', 'Sign in to continue.')))
  assert.deepEqual(await stale.service.currentUser(), { ok: true, data: null })
  assert.equal(stale.storage.getItem(SESSION_STORAGE_KEY), null, 'a stale credential is removed')
  assert.deepEqual(stale.events.map((event) => event.reason), ['unauthenticated'])
  assert.deepEqual(await stale.service.currentUser(), { ok: true, data: null })
  assert.equal(stale.calls.length, 1, 'no further request once the token is gone')
})

test('currentUser keeps the token and reports a retryable error when the server cannot be reached', async () => {
  const { service, storage, events } = signedIn(() => { throw new TypeError('Failed to fetch') })
  const result = await service.currentUser()
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'SERVICE_UNAVAILABLE')
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), TOKEN, 'an outage is not proof the session ended')
  assert.deepEqual(events, [])
})

test('storage that is blocked or throws falls back to memory for the page and never breaks the adapter', async () => {
  const { service, calls } = setup((call) => (call.url.endsWith('/auth/login') ? reply(200, session()) : call.url.endsWith('/auth/logout') ? reply(204) : call.headers.Authorization ? reply(200, session().user) : reply(401, errorBody('UNAUTHENTICATED', 'Sign in to continue.'))), { storage: blockedStorage() })
  assert.deepEqual(await service.currentUser(), { ok: true, data: null })
  await service.login({ username: 'maya_student', password: 'StudentDemo42!' })
  const me = await service.currentUser()
  assert.equal(me.ok, true)
  assert.equal(calls.at(-1).headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal((await service.logout()).ok, true)
  assert.deepEqual(await service.currentUser(), { ok: true, data: null })
})

test('logout revokes on the server, then clears local credentials', async () => {
  const { service, calls, storage, events } = signedIn(() => reply(204))
  assert.deepEqual(await service.logout(), { ok: true, data: null })
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, '/api/v1/auth/logout')
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null)
  assert.deepEqual(events, [])
  assert.deepEqual(await service.logout(), { ok: true, data: null })
  assert.equal(calls.length, 1, 'with no session there is nothing to revoke')
})

test('logout clears local credentials and says so honestly when the server could not confirm', async (t) => {
  for (const [name, handler] of [['network error', () => { throw new TypeError('Failed to fetch') }], ['server error', () => reply(500, errorBody('SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Try again.'))], ['html gateway page', () => ({ status: 502, text: '<html>Bad gateway</html>' })]]) {
    await t.test(name, async () => {
      const { service, storage, events } = signedIn(handler)
      const result = await service.logout()
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'SERVICE_UNAVAILABLE')
      assert.match(result.error.message, /signed out on this device/i)
      assert.match(result.error.message, /not told to end the session/i)
      assert.equal(storage.getItem(SESSION_STORAGE_KEY), null, 'signed out locally regardless')
      assert.deepEqual(events.map((event) => event.reason), ['logout-unconfirmed'])
      assert.equal(events[0].message, result.error.message)
    })
  }
  const already = signedIn(() => reply(401, errorBody('UNAUTHENTICATED', 'Sign in to continue.')))
  assert.deepEqual(await already.service.logout(), { ok: true, data: null }, 'a session that is already invalid is simply signed out')
  assert.deepEqual(already.events, [])
  assert.equal(already.storage.getItem(SESSION_STORAGE_KEY), null)
})

test('a 401 in the middle of a session clears the token once, notifies the app and later requests are anonymous', async () => {
  let expired = false
  const { service, calls, storage, events } = signedIn((call) => (expired ? reply(401, errorBody('UNAUTHENTICATED', 'Sign in to continue.')) : call.url.endsWith('/bookings') ? ok200('listBookings', 'six-state owner fixture') : reply(200, sample('listAssets', 'no filters').body)))
  assert.equal((await service.listBookings()).ok, true)
  expired = true
  const [a, b] = await Promise.all([service.listBookings(), service.getBooking('fixture-pending')])
  for (const result of [a, b]) {
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'UNAUTHENTICATED')
    assert.equal(result.error.status, 401)
  }
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null)
  assert.equal(events.length, 1, 'two concurrent 401s end the session once')
  assert.equal(events[0].reason, 'unauthenticated')
  expired = false
  await service.listAssets()
  assert.equal(calls.at(-1).headers.Authorization, undefined, 'public reads never carry the bearer token')
  await service.listBookings()
  assert.equal(calls.at(-1).headers.Authorization, undefined, 'no token after the 401')
})

test('a 401 without the error envelope (proxy page) still ends the session', async () => {
  const { service, storage, events } = signedIn(() => ({ status: 401, text: '<html>Unauthorized</html>' }))
  const result = await service.listStaffBookings()
  assert.equal(result.error.code, 'UNAUTHENTICATED')
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null)
  assert.equal(events.length, 1)
})

test('a late 401 for an old token cannot clear a newer sign-in', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const { service, storage, events } = signedIn(async (call) => {
    if (call.url.endsWith('/bookings')) { await gate; return reply(401, errorBody('UNAUTHENTICATED', 'Sign in to continue.')) }
    return reply(200, session({ token: 'N'.repeat(43) }))
  })
  const slow = service.listBookings()
  await service.login({ username: 'maya_student', password: 'StudentDemo42!' })
  release()
  assert.equal((await slow).error.code, 'UNAUTHENTICATED')
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), 'N'.repeat(43), 'the newer session survives')
  assert.deepEqual(events, [])
})

const requestAllowedMethods = [
  ['listAssets', (s) => s.listAssets({})], ['getAsset', (s) => s.getAsset('camera-01')], ['getAssetAvailability', (s) => s.getAssetAvailability('camera-01')],
  ['requestBooking', (s) => s.requestBooking({ assetId: 'a', startDate: '2026-10-24', endDate: '2026-10-24', purpose: 'Some project' })],
  ['listBookings', (s) => s.listBookings()], ['getBooking', (s) => s.getBooking('b1')], ['cancelBooking', (s) => s.cancelBooking('b1', { expectedVersion: 1 })],
  ['listStaffBookings', (s) => s.listStaffBookings()], ['approveBooking', (s) => s.approveBooking('b1', { expectedVersion: 1 })],
  ['rejectBooking', (s) => s.rejectBooking('b1', { expectedVersion: 1, note: 'No kit' })], ['checkoutBooking', (s) => s.checkoutBooking('b1', { expectedVersion: 2, note: 'Complete' })],
  ['returnBooking', (s) => s.returnBooking('b1', { expectedVersion: 3, note: 'Complete' })], ['listInventory', (s) => s.listInventory()],
  ['addAsset', (s) => s.addAsset({ name: 'Unit', inventoryCode: 'U-1', category: 'Audio', location: 'Shelf', description: '' })],
  ['editAsset', (s) => s.editAsset('a1', { name: 'Unit', inventoryCode: 'U-1', category: 'Audio', location: 'Shelf', description: '' })], ['setAssetState', (s) => s.setAssetState('a1', 'maintenance')],
  ['login', (s) => s.login({ username: 'maya_student', password: 'StudentDemo42!' })], ['register', (s) => s.register({ username: 'maya_student', password: 'StudentDemo42!' })],
]

test('network failures, timeouts, 5xx, invalid JSON and wrong shapes are retryable errors on every operation, never data or success', async (t) => {
  const failures = [
    ['network error', () => { throw new TypeError('Failed to fetch') }, /Could not reach/],
    ['non-error throw', () => { throw 'boom' }, /Could not reach/],
    ['500 with the Error envelope', () => reply(500, errorBody('SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Try again.')), /temporarily unavailable/],
    ['500 with an HTML page', () => ({ status: 500, text: '<h1>Internal Server Error</h1>' }), /unavailable/],
    ['502 with an empty body (dev proxy cannot reach the backend)', () => ({ status: 502, text: '' }), /unavailable/],
    ['503 with a foreign envelope code', () => reply(503, errorBody('CONFLICT', 'nope')), /unavailable/],
    ['200 with invalid JSON', () => ({ status: 200, text: '{"items": [' }), /cannot use/],
    ['200 with the SPA index.html (API not proxied)', () => ({ status: 200, text: '<!doctype html><title>GearShare</title>' }), /cannot use/],
    ['200 with an empty body', () => ({ status: 200, text: '' }), /cannot use/],
    ['200 with the wrong JSON shape', () => reply(200, { unexpected: true }), /cannot use/],
    ['200 with null', () => reply(200, null), /cannot use/],
    ['200 with an array where an object is expected', () => reply(200, []), /cannot use/, new Set(['listBookings', 'listInventory'])],
    ['200 with an object where an array is expected', () => reply(200, {}), /cannot use/, new Set()],
  ]
  for (const [name, handler, message, skip = new Set()] of failures) {
    await t.test(name, async () => {
      for (const [method, call] of requestAllowedMethods) {
        if (skip.has(method)) continue
        const { service, storage } = signedIn(handler)
        const result = await call(service)
        assert.equal(result.ok, false, `${method} must fail`)
        assert.equal(result.error.code, 'SERVICE_UNAVAILABLE', method)
        assert.match(result.error.message, message, method)
        assert.equal(result.error.fields, undefined)
        assert.equal(storage.getItem(SESSION_STORAGE_KEY), TOKEN, `${method}: a server problem is not an expired session`)
      }
    })
  }
})

test('a request that never answers times out as a retryable error and aborts the transport', async () => {
  let aborted = false
  const { service, calls } = setup((call) => new Promise((_resolve, reject) => { call.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')) }) }), { timeoutMs: 25 })
  const started = Date.now()
  const result = await service.listAssets({})
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'SERVICE_UNAVAILABLE')
  assert.match(result.error.message, /took too long/)
  assert.equal(aborted, true)
  assert.ok(Date.now() - started < 1500)
  assert.equal(calls.length, 1, 'no automatic retry')
})

test('a body that fails while being read is a retryable error', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error('reset')) } }), { status: 200 })
  const { service } = setup(() => response)
  const result = await service.getAsset('camera-01')
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'SERVICE_UNAVAILABLE')
})

test('contract errors keep status, unavailable dates, field messages and the stale-version marker', async () => {
  const conflict = sample('requestBooking', 'same unit and day again', 409)
  const stale = sample('cancelBooking', 'stale expectedVersion', 409)
  const answers = [reply(409, conflict.body), reply(409, stale.body), reply(404, errorBody('NOT_FOUND', 'Reservation not found or unavailable to this account.')), reply(403, errorBody('FORBIDDEN', 'Coordinator access is required for this action.')), reply(422, sample('addAsset', 'limits', 422).body), reply(409, sample('addAsset', 'duplicate inventory code', 409).body), reply(409, sample('setAssetState', 'blocked by an approved booking', 409).body)]
  const { service } = signedIn((_call, index) => answers[index])
  const taken = await service.requestBooking({ assetId: 'accessory-03', startDate: '2026-10-19', endDate: '2026-10-19', purpose: 'Student club film' })
  assert.equal(taken.error.code, 'CONFLICT')
  assert.equal(taken.error.status, 409)
  assert.deepEqual(taken.error.unavailableDates, conflict.body.unavailableDates)
  assert.ok(taken.error.unavailableDates.length > 0)
  const old = await service.cancelBooking('b1', { expectedVersion: 7 })
  assert.equal(old.error.code, 'CONFLICT')
  assert.ok(old.error.fields.expectedVersion, 'a stale 409 is distinguishable from a rule 409')
  assert.deepEqual([(await service.getBooking('b2')).error.code, (await service.listStaffBookings()).error.code], ['NOT_FOUND', 'FORBIDDEN'])
  const limits = await service.addAsset({ name: 'a', inventoryCode: 'x', category: 'Cameras', location: 'Club store', description: '' })
  assert.equal(limits.error.code, 'VALIDATION_ERROR')
  assert.ok(limits.error.fields.name && limits.error.fields.inventoryCode)
  const duplicate = await service.addAsset({ name: 'Studio', inventoryCode: 'cam-001', category: 'Cameras', location: 'Club store', description: '' })
  assert.deepEqual([duplicate.error.code, Object.keys(duplicate.error.fields)], ['CONFLICT', ['inventoryCode']])
  const maintenance = await service.setAssetState('camera-02', 'maintenance')
  assert.equal(maintenance.error.code, 'CONFLICT')
  assert.equal(maintenance.error.fields, undefined, 'a rule conflict carries no fields')
})

test('requests send only contract fields, encode ids and omit empty filters', async () => {
  const { service, calls } = signedIn(() => reply(200, {}))
  await service.requestBooking({ assetId: 'a', startDate: '2026-10-24', endDate: '2026-10-25', purpose: 'Project', userId: 'u-9', state: 'approved', version: 9, events: [] })
  assert.deepEqual(Object.keys(calls.at(-1).body).sort(), ['assetId', 'endDate', 'purpose', 'startDate'])
  await service.addAsset({ name: 'Unit', inventoryCode: 'U-1', category: 'Audio', location: 'Shelf', description: '', id: 'x', state: 'maintenance' })
  assert.deepEqual(Object.keys(calls.at(-1).body).sort(), ['category', 'description', 'inventoryCode', 'location', 'name'])
  await service.approveBooking('a b/c?d', { expectedVersion: 3, note: 'ignored', role: 'coordinator' })
  assert.equal(calls.at(-1).url, '/api/v1/staff/bookings/a%20b%2Fc%3Fd/approve')
  assert.deepEqual(calls.at(-1).body, { expectedVersion: 3 })
  await service.listAssets({ search: '  tripod ', category: undefined, startDate: '', endDate: '' })
  assert.equal(calls.at(-1).url, '/api/v1/assets?search=++tripod+')
  await service.listAssets({ category: 'Audio', startDate: '2026-10-24', endDate: '2026-10-25' })
  assert.equal(calls.at(-1).url, '/api/v1/assets?category=Audio&startDate=2026-10-24&endDate=2026-10-25')
  await service.listAssets()
  assert.equal(calls.at(-1).url, '/api/v1/assets')
  await service.cancelBooking('b1', {})
  assert.deepEqual(calls.at(-1).body, {}, 'a missing version is sent as missing so the server answers 422; it is never invented')
})

test('a configured base URL prefixes every request and trailing slashes are ignored', async () => {
  const { service, calls } = setup(() => reply(200, {}), { baseUrl: 'http://127.0.0.1:8000/' })
  await service.getAsset('camera-01')
  assert.equal(calls[0].url, 'http://127.0.0.1:8000/api/v1/assets/camera-01')
})

test('selector configuration: HTTP is the default, mock is explicit, anything else is rejected', () => {
  assert.equal(resolveServiceMode(undefined), 'http')
  assert.equal(resolveServiceMode(''), 'http')
  assert.equal(resolveServiceMode('http'), 'http')
  assert.equal(resolveServiceMode('mock'), 'mock')
  assert.throws(() => resolveServiceMode('moc'), /must be "http" or "mock"/)
  assert.throws(() => resolveServiceMode('MOCK'), /must be "http" or "mock"/)
  assert.equal(resolveApiBaseUrl(undefined), '')
  assert.equal(resolveApiBaseUrl(' http://127.0.0.1:8000/ '), 'http://127.0.0.1:8000')
  assert.equal(resolveApiBaseUrl('/backend/'), '/backend')
  for (const bad of ['127.0.0.1:8000', 'ftp://host', '//host/api', 'http://', 'javascript:alert(1)']) assert.throws(() => resolveApiBaseUrl(bad), /VITE_API_BASE_URL/, bad)
})

test('the adapter has no path to mock data and UI code never touches the network or browser storage', () => {
  const root = new URL('../src/', import.meta.url)
  for (const file of ['httpService.ts', 'httpClient.ts', 'wire.ts']) {
    const text = readFileSync(new URL(`services/${file}`, root), 'utf8')
    assert.doesNotMatch(text, /mockService|fixtures|DEMO_ACCOUNTS/, `${file} must never reference mock data`)
  }
  const index = readFileSync(new URL('services/index.ts', root), 'utf8')
  assert.match(index, /isMockMode \? createMockService\(\) : null/)
  assert.match(index, /resolveServiceMode\(import\.meta\.env\.VITE_GEARSHARE_SERVICE\)/)
  for (const folder of ['pages', 'components']) {
    for (const file of readdirSync(new URL(`${folder}/`, root))) {
      const text = readFileSync(new URL(`${folder}/${file}`, root), 'utf8')
      assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|sessionStorage|localStorage|WebSocket|EventSource/, `${folder}/${file} must use GearShareService only`)
    }
  }
  const app = readFileSync(new URL('App.tsx', root), 'utf8')
  assert.doesNotMatch(app, /\bfetch\s*\(|XMLHttpRequest|sessionStorage|localStorage/)
})

// Generates wire-shaped request/response samples by driving the real mock service, so the committed
// fixtures/contract-samples.json always reflects what the mock actually returns.
//
//   node tests/contract-samples.mjs --write   regenerate tests/fixtures/contract-samples.json
//
// frontend/tests/contract.test.mjs fails when the committed file drifts from the mock, and
// backend/tests/test_openapi_contract.py validates every sample against openapi.yml. Together they check that
// the shared frontend types/mock and the OpenAPI contract describe the same payloads (names, nullability,
// enums, version fields, error shapes and status mapping).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createMockService, DEMO_ACCOUNTS } from '../src/services/mockService.ts'
import { addDays } from '../src/services/dates.ts'

export const NOW = '2026-10-19T06:00:00Z'
export const T = '2026-10-19'
export const SAMPLES_PATH = fileURLToPath(new URL('./fixtures/contract-samples.json', import.meta.url))

// The HTTP status the future adapter maps each ServiceErrorCode from (see _docs/api.md).
export const STATUS_BY_CODE = {
  VALIDATION_ERROR: 422, INVALID_CREDENTIALS: 401, USERNAME_TAKEN: 409, SERVICE_UNAVAILABLE: 503,
  NOT_FOUND: 404, UNAUTHENTICATED: 401, FORBIDDEN: 403, CONFLICT: 409,
}
const SUCCESS_STATUS = { register: 201, requestBooking: 201, addAsset: 201, logout: 204 }

export async function buildSamples() {
  const { service: s, demo } = createMockService({ now: () => new Date(`${NOW}`), sleep: async () => {} })
  const samples = []
  /**
   * Record one call. `request` holds only wire inputs: query for GET, body otherwise.
   * `schemaInvalid` marks 422 inputs that the OpenAPI schema itself (not a date/state rule) must reject.
   */
  async function call(method, args, request = {}, label = '', schemaInvalid = false) {
    const result = await s[method](...args)
    const sample = { method, label, request }
    if (schemaInvalid) sample.schemaInvalid = true
    if (result.ok) {
      sample.status = SUCCESS_STATUS[method] ?? 200
      // Mock register/login return the public User; the wire answers with Session {token, expiresAt, user}.
      if (method === 'login' || method === 'register') { sample.mapsTo = 'Session.user'; sample.body = result.data }
      else sample.body = result.data
      if (method === 'logout') delete sample.body
    } else {
      const { status, ...body } = result.error // the status travels in the HTTP status line, not in the body
      sample.status = status ?? STATUS_BY_CODE[body.code]
      sample.body = body
      if (status !== undefined && status !== STATUS_BY_CODE[body.code]) throw new Error(`status ${status} does not match ${body.code}`)
    }
    samples.push(sample)
    return result.ok ? result.data : result.error
  }
  const as = role => s.login(DEMO_ACCOUNTS[role])

  // ---- anonymous ----
  await call('listAssets', [{}], { query: {} }, 'no filters')
  const filters = { search: '  field CAMERA ', category: 'Cameras', startDate: addDays(T, 1), endDate: addDays(T, 1) }
  await call('listAssets', [filters], { query: filters }, 'intersection with paired dates')
  await call('listAssets', [{ startDate: T }], { query: { startDate: T } }, 'only one date')
  await call('listAssets', [{ category: 'Unknown' }], { query: { category: 'Unknown' } }, 'unknown category')
  await call('getAsset', ['camera-01'], { path: { assetId: 'camera-01' } })
  await call('getAsset', ['missing'], { path: { assetId: 'missing' } }, 'unknown id')
  await call('getAssetAvailability', ['camera-02'], { path: { assetId: 'camera-02' } })
  await call('getAssetAvailability', ['camera-03'], { path: { assetId: 'camera-03' } }, 'maintenance unit')
  await call('getAssetAvailability', ['missing'], { path: { assetId: 'missing' } }, 'unknown id')
  await call('login', [{ username: 'maya_student', password: 'WrongPassword42!' }], { body: { username: 'maya_student', password: 'WrongPassword42!' } }, 'wrong password')
  await call('login', [{ username: 'ab', password: 'short' }], { body: { username: 'ab', password: 'short' } }, 'malformed input', true)
  await call('listBookings', [], {}, 'anonymous')
  await call('getBooking', ['fixture-pending'], { path: { bookingId: 'fixture-pending' } }, 'anonymous')
  await call('cancelBooking', ['fixture-pending', { expectedVersion: 1 }], { path: { bookingId: 'fixture-pending' }, body: { expectedVersion: 1 } }, 'anonymous')
  await call('listStaffBookings', [], {}, 'anonymous')

  // ---- student ----
  const studentLogin = { username: 'maya_student', password: 'StudentDemo42!' }
  await call('login', [studentLogin], { body: studentLogin })
  await call('currentUser', [], {})
  await call('listBookings', [], {}, 'six-state owner fixture')
  await call('getBooking', ['fixture-checked_out'], { path: { bookingId: 'fixture-checked_out' } }, 'checked out, nullable priorState only on create')
  const request = { assetId: 'accessory-03', startDate: T, endDate: T, purpose: '  Student club film  ' }
  const created = await call('requestBooking', [request], { body: request }, 'one-day booking')
  await call('requestBooking', [request], { body: request }, 'same unit and day again')
  const maintenance = { ...request, assetId: 'camera-03' }
  await call('requestBooking', [maintenance], { body: maintenance }, 'maintenance unit')
  const missing = { ...request, assetId: 'missing' }
  await call('requestBooking', [missing], { body: missing }, 'unknown asset')
  const invalid = { assetId: 'accessory-03', startDate: T, endDate: addDays(T, 14), purpose: 'x' }
  await call('requestBooking', [invalid], { body: invalid }, 'range and purpose rules', true)
  await call('cancelBooking', [created.id, {}], { path: { bookingId: created.id }, body: {} }, 'missing expectedVersion', true)
  await call('cancelBooking', [created.id, { expectedVersion: 7 }], { path: { bookingId: created.id }, body: { expectedVersion: 7 } }, 'stale expectedVersion')
  await call('cancelBooking', ['fixture-returned', { expectedVersion: 4 }], { path: { bookingId: 'fixture-returned' }, body: { expectedVersion: 4 } }, 'terminal state')
  await call('cancelBooking', [created.id, { expectedVersion: created.version }], { path: { bookingId: created.id }, body: { expectedVersion: created.version } }, 'owner cancels pending')
  // Largest and smallest accepted values (the mock accepts them, so the schema must too).
  const longest = { assetId: 'presentation-02', startDate: addDays(T, 90), endDate: addDays(T, 90), purpose: 'p'.repeat(500) }
  await call('requestBooking', [longest], { body: longest }, 'horizon end and 500-character purpose')
  const fortnight = { assetId: 'presentation-02', startDate: addDays(T, 20), endDate: addDays(T, 33), purpose: 'abcde' }
  await call('requestBooking', [fortnight], { body: fortnight }, '14 inclusive days and 5-character purpose')
  const overLong = { ...fortnight, startDate: addDays(T, 40), endDate: addDays(T, 54), purpose: 'p'.repeat(501) }
  await call('requestBooking', [overLong], { body: overLong }, '15 days and 501-character purpose', true)
  await call('listStaffBookings', [], {}, 'student')
  await call('approveBooking', ['fixture-pending', { expectedVersion: 1 }], { path: { bookingId: 'fixture-pending' }, body: { expectedVersion: 1 } }, 'student')
  await call('listInventory', [], {}, 'student')
  await call('addAsset', [{ name: 'Studio camera', inventoryCode: 'NEW-001', category: 'Cameras', location: 'Club store', description: '' }], { body: { name: 'Studio camera', inventoryCode: 'NEW-001', category: 'Cameras', location: 'Club store', description: '' } }, 'student')
  await call('logout', [], {}, 'student session')

  // ---- another student and registration ----
  const registration = { username: '  New_Member9  ', password: 'ExamplePass42!', role: 'coordinator', id: 'coordinator-demo' }
  await call('register', [registration], { body: registration }, 'trimmed, lowercased, role ignored')
  await call('currentUser', [], {}, 'newly registered student')
  await call('getBooking', ['fixture-pending'], { path: { bookingId: 'fixture-pending' } }, 'foreign private booking is indistinguishable from missing')
  await call('cancelBooking', ['fixture-pending', { expectedVersion: 1 }], { path: { bookingId: 'fixture-pending' }, body: { expectedVersion: 1 } }, 'foreign private booking')
  const duplicate = { username: ' NEW_MEMBER9 ', password: 'ExamplePass42!' }
  await call('register', [duplicate], { body: duplicate }, 'normalized duplicate')
  const weak = { username: 'ok_name', password: 'short' }
  await call('register', [weak], { body: weak }, 'password too short', true)

  const shortest = { username: 'abc', password: 'x'.repeat(10) }
  await call('register', [shortest], { body: shortest }, '3-character name, 10-character password')
  const widest = { username: 'A'.repeat(30), password: 'y'.repeat(128) }
  await call('register', [widest], { body: widest }, '30-character name, 128-character password')
  const tooLong = { username: 'a'.repeat(31), password: 'y'.repeat(129) }
  await call('register', [tooLong], { body: tooLong }, '31-character name, 129-character password', true)

  // ---- coordinator ----
  const coordinatorLogin = { username: 'alex_coordinator', password: 'CoordinatorDemo42!' }
  await call('login', [coordinatorLogin], { body: coordinatorLogin })
  const desk = await call('listStaffBookings', [], {}, 'full desk')
  const pending = desk.bookings.find(b => b.id === 'fixture-pending')
  const unknown = { path: { bookingId: 'missing' }, body: { expectedVersion: 1 } }
  await call('approveBooking', ['missing', { expectedVersion: 1 }], unknown, 'unknown booking')
  await call('approveBooking', [pending.id, {}], { path: { bookingId: pending.id }, body: {} }, 'missing expectedVersion', true)
  await call('approveBooking', [pending.id, { expectedVersion: 5 }], { path: { bookingId: pending.id }, body: { expectedVersion: 5 } }, 'stale expectedVersion')
  const approved = await call('approveBooking', [pending.id, { expectedVersion: pending.version }], { path: { bookingId: pending.id }, body: { expectedVersion: pending.version } })
  await call('approveBooking', [pending.id, { expectedVersion: approved.version }], { path: { bookingId: pending.id }, body: { expectedVersion: approved.version } }, 'repeat from the current version')
  await call('cancelBooking', [pending.id, { expectedVersion: pending.version }], { path: { bookingId: pending.id }, body: { expectedVersion: pending.version } }, 'cancel from the old pending snapshot')
  await call('rejectBooking', ['fixture-audio-request', { expectedVersion: 1, note: 'ab' }], { path: { bookingId: 'fixture-audio-request' }, body: { expectedVersion: 1, note: 'ab' } }, 'note too short', true)
  await call('rejectBooking', ['fixture-audio-request', { expectedVersion: 1, note: '  Equipment inspection required.  ' }], { path: { bookingId: 'fixture-audio-request' }, body: { expectedVersion: 1, note: '  Equipment inspection required.  ' } })
  await call('checkoutBooking', ['fixture-light-pickup', { expectedVersion: 2, note: 'Complete kit' }], { path: { bookingId: 'fixture-light-pickup' }, body: { expectedVersion: 2, note: 'Complete kit' } }, 'outside the booked days')
  const mine = await call('requestBooking', [{ assetId: 'accessory-01', startDate: T, endDate: T, purpose: 'Coordinator test shoot' }], { body: { assetId: 'accessory-01', startDate: T, endDate: T, purpose: 'Coordinator test shoot' } })
  const approvedMine = await call('approveBooking', [mine.id, { expectedVersion: mine.version }], { path: { bookingId: mine.id }, body: { expectedVersion: mine.version } }, 'approved for same-day pickup')
  const out = await call('checkoutBooking', [mine.id, { expectedVersion: approvedMine.version, note: '  Complete kit; tested and working.  ' }], { path: { bookingId: mine.id }, body: { expectedVersion: approvedMine.version, note: '  Complete kit; tested and working.  ' } })
  await call('checkoutBooking', ['fixture-next-pickup', { expectedVersion: 2, note: 'Complete kit' }], { path: { bookingId: 'fixture-next-pickup' }, body: { expectedVersion: 2, note: 'Complete kit' } }, 'unit still on loan')
  await call('listStaffBookings', [], {}, 'with an active loan and an overdue booking')
  await call('returnBooking', [mine.id, { expectedVersion: out.version, note: 'Returned complete.' }], { path: { bookingId: mine.id }, body: { expectedVersion: out.version, note: 'Returned complete.' } })
  await call('returnBooking', ['fixture-checked_out', { expectedVersion: 3, note: 'Late return complete' }], { path: { bookingId: 'fixture-checked_out' }, body: { expectedVersion: 3, note: 'Late return complete' } }, 'overdue return')
  await call('getBooking', ['fixture-returned'], { path: { bookingId: 'fixture-returned' } }, 'coordinator reads any booking')
  await call('listInventory', [], {}, 'including maintenance')
  const input = { name: '  Studio camera  ', inventoryCode: '  new-001  ', category: 'Cameras', location: '  Club store  ', description: '  A complete fictional kit.  ' }
  const added = await call('addAsset', [input], { body: input })
  await call('addAsset', [input], { body: input }, 'duplicate inventory code')
  const biggest = { name: 'n'.repeat(100), inventoryCode: 'c'.repeat(30), category: 'Audio', location: 'l'.repeat(100), description: 'd'.repeat(2000) }
  await call('addAsset', [biggest], { body: biggest }, 'maximum lengths')
  const smallest = { name: 'ab', inventoryCode: 'ab-', category: 'Presentation', location: 'ab', description: '' }
  await call('addAsset', [smallest], { body: smallest }, 'minimum lengths and empty description')
  const oversize = { ...biggest, inventoryCode: 'z'.repeat(31), name: 'n'.repeat(101), location: 'l'.repeat(101), description: 'd'.repeat(2001) }
  await call('addAsset', [oversize], { body: oversize }, 'one over every maximum', true)
  const tooShort = { ...input, name: 'a', inventoryCode: 'x' }
  await call('addAsset', [tooShort], { body: tooShort }, 'limits', true)
  const renamed = { ...input, name: 'Renamed unit' }
  await call('editAsset', [added.id, renamed], { path: { assetId: added.id }, body: renamed })
  await call('editAsset', ['missing', renamed], { path: { assetId: 'missing' }, body: renamed }, 'unknown id')
  const clash = { ...renamed, inventoryCode: 'cam-001' }
  await call('editAsset', [added.id, clash], { path: { assetId: added.id }, body: clash }, 'code of another unit')
  await call('setAssetState', [added.id, 'maintenance'], { path: { assetId: added.id }, body: { state: 'maintenance' } })
  await call('setAssetState', [added.id, 'maintenance'], { path: { assetId: added.id }, body: { state: 'maintenance' } }, 'already in that state')
  await call('setAssetState', ['camera-02', 'maintenance'], { path: { assetId: 'camera-02' }, body: { state: 'maintenance' } }, 'blocked by an approved booking')
  await call('setAssetState', [added.id, 'deleted'], { path: { assetId: added.id }, body: { state: 'deleted' } }, 'invalid state', true)
  await call('setAssetState', ['missing', 'active'], { path: { assetId: 'missing' }, body: { state: 'active' } }, 'unknown id')
  await call('logout', [], {}, 'coordinator session')

  // ---- unavailable service ----
  demo.setScenario('error')
  await call('listAssets', [{}], { query: {} }, 'service unavailable')
  await call('getBooking', ['fixture-pending'], { path: { bookingId: 'fixture-pending' } }, 'service unavailable')
  return JSON.parse(JSON.stringify(samples))
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  const samples = await buildSamples()
  writeFileSync(SAMPLES_PATH, `${JSON.stringify({ generatedBy: 'node tests/contract-samples.mjs --write', clock: NOW, samples }, null, 1)}\n`)
  console.log(`wrote ${samples.length} samples to ${SAMPLES_PATH}`)
}

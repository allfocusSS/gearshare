import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockService, DEMO_ACCOUNTS } from '../src/services/mockService.ts'
import { addDays } from '../src/services/dates.ts'

// #6 QA-FAIL correction: decisions written into openapi.yml / _docs/api.md that the QA-passed mock must already honour
// (ids, event shape and system notes, desk counts). Each assertion mirrors a sentence of the contract.
const T = '2026-10-19'
let clock = T
const make = () => { clock = T; return createMockService({ now: () => new Date(`${clock}T06:00:00Z`), sleep: async () => {} }) }
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data }
const fail = (r, code, status) => {
  assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code, JSON.stringify(r.error))
  if (status) assert.equal(r.error.status, status)
  return r.error
}
const student = s => s.login(DEMO_ACCOUNTS.student)
const staff = s => s.login(DEMO_ACCOUNTS.coordinator)
const valid = { assetId: 'accessory-03', startDate: T, endDate: T, purpose: 'Contract decision production' }

test('a malformed body assetId is 422 fields.assetId only; a well-formed unknown id is 404; nothing is created', async () => {
  const { service: s } = make()
  ok(await student(s))
  const before = ok(await s.listBookings())
  for (const assetId of [undefined, '', 'a'.repeat(101), 7, null, {}]) {
    const error = fail(await s.requestBooking({ ...valid, assetId }), 'VALIDATION_ERROR')
    assert.deepEqual(Object.keys(error.fields), ['assetId'], `assetId ${JSON.stringify(assetId)} must flag only assetId`)
    assert.equal('unavailableDates' in error, false)
  }
  assert.deepEqual(ok(await s.listBookings()), before)
  fail(await s.requestBooking({ ...valid, assetId: 'does-not-exist' }), 'NOT_FOUND')
  fail(await s.requestBooking({ ...valid, assetId: 'a'.repeat(100) }), 'NOT_FOUND')
  const combined = fail(await s.requestBooking({ ...valid, assetId: '', purpose: 'x' }), 'VALIDATION_ERROR')
  assert.deepEqual(Object.keys(combined.fields).sort(), ['assetId', 'purpose'], 'every offending field is reported in one answer')
  ok(await s.requestBooking(valid))
})

test('a path id the server does not know is 404 however long or malformed, and role checks still come first', async () => {
  const { service: s } = make()
  const huge = 'x'.repeat(101), odd = '../ 💥 id'
  for (const id of [huge, odd, '']) {
    fail(await s.getAsset(id), 'NOT_FOUND'); fail(await s.getAssetAvailability(id), 'NOT_FOUND')
    fail(await s.getBooking(id), 'UNAUTHENTICATED', 401)
  }
  ok(await student(s))
  const missing = fail(await s.getBooking('does-not-exist'), 'NOT_FOUND', 404)
  for (const id of [huge, odd, '']) {
    assert.deepEqual(fail(await s.getBooking(id), 'NOT_FOUND', 404), missing, 'same body as a missing or foreign booking')
    fail(await s.cancelBooking(id, { expectedVersion: 1 }), 'NOT_FOUND', 404)
    fail(await s.approveBooking(id, { expectedVersion: 1 }), 'FORBIDDEN', 403)
  }
  ok(await staff(s))
  for (const id of [huge, odd, '']) {
    fail(await s.approveBooking(id, { expectedVersion: 1 }), 'NOT_FOUND', 404)
    fail(await s.rejectBooking(id, { expectedVersion: 1, note: 'abc' }), 'NOT_FOUND', 404)
    fail(await s.editAsset(id, { name: 'ab', inventoryCode: 'code-1', category: 'Audio', location: 'ab', description: '' }), 'NOT_FOUND')
    fail(await s.setAssetState(id, 'maintenance'), 'NOT_FOUND')
  }
})

test('event shape and fixed system notes: create, approve, cancel by the owner or a coordinator, reject', async () => {
  const { service: s } = make()
  const stamp = `${T}T06:00:00.000Z`
  ok(await student(s))
  const pending = ok(await s.requestBooking({ ...valid, purpose: '  Contract decision production  ' }))
  assert.deepEqual(pending.events, [{ id: pending.events[0].id, bookingId: pending.id, actorId: 'student-demo', action: 'create', priorState: null, newState: 'pending', timestamp: stamp, note: 'Contract decision production' }])
  const cancelled = ok(await s.cancelBooking(pending.id, { expectedVersion: 1 }))
  assert.deepEqual(cancelled.events[1], { id: cancelled.events[1].id, bookingId: pending.id, actorId: 'student-demo', action: 'cancel', priorState: 'pending', newState: 'cancelled', timestamp: stamp, note: 'Reservation cancelled; reserved dates released.' })
  const second = ok(await s.requestBooking({ ...valid, startDate: addDays(T, 1), endDate: addDays(T, 1) }))
  ok(await staff(s))
  const approved = ok(await s.approveBooking(second.id, { expectedVersion: 1 }))
  assert.deepEqual(approved.events[1], { id: approved.events[1].id, bookingId: second.id, actorId: 'coordinator-demo', action: 'approve', priorState: 'pending', newState: 'approved', timestamp: stamp, note: 'Reservation approved.' })
  const byStaff = ok(await s.cancelBooking(second.id, { expectedVersion: 2 }))
  assert.deepEqual(byStaff.events[2], { id: byStaff.events[2].id, bookingId: second.id, actorId: 'coordinator-demo', action: 'cancel', priorState: 'approved', newState: 'cancelled', timestamp: stamp, note: 'Reservation cancelled; reserved dates released.' })
  const rejected = ok(await s.rejectBooking('fixture-audio-request', { expectedVersion: 1, note: '  Equipment inspection required.  ' }))
  assert.equal(rejected.events.at(-1).note, 'Equipment inspection required.')
  assert.equal(rejected.events.at(-1).priorState, 'pending')
  for (const booking of [pending, cancelled, approved, byStaff, rejected]) {
    assert.equal(new Set(booking.events.map(e => e.id)).size, booking.events.length, 'event ids are unique within a booking')
    for (const event of booking.events.slice(1)) assert.match(event.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  }
})

test('StaffDesk.counts: pending counts every pending booking even past its end date; dueToday and overdue only count checked-out bookings', async () => {
  const { service: s } = make()
  ok(await staff(s))
  const counts = async () => {
    const desk = ok(await s.listStaffBookings())
    assert.deepEqual(desk.counts, {
      pending: desk.bookings.filter(b => b.state === 'pending').length,
      dueToday: desk.bookings.filter(b => b.state === 'checked_out' && b.endDate === desk.today).length,
      overdue: desk.bookings.filter(b => b.state === 'checked_out' && b.endDate < desk.today).length,
    })
    assert.equal(desk.counts.overdue, desk.bookings.filter(b => b.overdue).length, 'counts.overdue equals the number of overdue rows')
    assert.ok(desk.bookings.filter(b => b.overdue).every(b => b.state === 'checked_out'))
    return desk.counts
  }
  assert.deepEqual(await counts(), { pending: 3, dueToday: 0, overdue: 1 })
  const mine = ok(await s.requestBooking({ assetId: 'accessory-01', startDate: T, endDate: addDays(T, 1), purpose: 'Desk count loan' }))
  const approved = ok(await s.approveBooking(mine.id, { expectedVersion: mine.version }))
  ok(await s.checkoutBooking(mine.id, { expectedVersion: approved.version, note: 'Complete kit' }))
  assert.deepEqual(await counts(), { pending: 3, dueToday: 0, overdue: 1 })
  clock = addDays(T, 1)
  assert.deepEqual(await counts(), { pending: 3, dueToday: 1, overdue: 1 })
  clock = addDays(T, 2)
  assert.deepEqual(await counts(), { pending: 3, dueToday: 0, overdue: 2 })
  clock = addDays(T, 30)
  assert.deepEqual(await counts(), { pending: 3, dueToday: 0, overdue: 2 }, 'pending requests whose end date passed still count until rejected or cancelled')
  ok(await s.rejectBooking('fixture-pending', { expectedVersion: 1, note: 'Expired request' }))
  assert.deepEqual(await counts(), { pending: 2, dueToday: 0, overdue: 2 })
})

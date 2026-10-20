import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockService, DEMO_ACCOUNTS, MAX_VERSION } from '../src/services/mockService.ts'
import { addDays } from '../src/services/dates.ts'

// #6 compatibility checks for the Booking `version` / `expectedVersion` precondition (PM clarification on issue #6).
const T = '2026-10-19'
const NOTE = 'Complete kit and cables'
const make = () => createMockService({ now: () => new Date(`${T}T06:00:00Z`), sleep: async () => {} })
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data }
const fail = (r, code, status) => {
  assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code, JSON.stringify(r.error)); assert.equal('data' in r, false)
  if (status) assert.equal(r.error.status, status)
  return r.error
}
const student = s => s.login(DEMO_ACCOUNTS.student)
const staff = s => s.login(DEMO_ACCOUNTS.coordinator)
const MUTATIONS = ['approve', 'reject', 'cancel', 'checkout', 'return']
const run = (s, action, id, input) => ({
  approve: () => s.approveBooking(id, input), reject: () => s.rejectBooking(id, input), cancel: () => s.cancelBooking(id, input),
  checkout: () => s.checkoutBooking(id, input), return: () => s.returnBooking(id, input),
})[action]()
const withNote = (action, input) => (['reject', 'checkout', 'return'].includes(action) && input && typeof input === 'object' ? { note: NOTE, ...input } : input)

/** A fresh service whose Booking is in the state each action needs (acting as the coordinator). */
async function prepared(action) {
  const { service: s } = make()
  ok(await student(s))
  let booking = ok(await s.requestBooking({ assetId: 'accessory-03', startDate: T, endDate: T, purpose: 'Versioning production' }))
  ok(await staff(s))
  if (action === 'checkout' || action === 'return') booking = ok(await s.approveBooking(booking.id, { expectedVersion: booking.version }))
  if (action === 'return') booking = ok(await s.checkoutBooking(booking.id, { note: NOTE, expectedVersion: booking.version }))
  return { s, booking }
}
/** Everything a failed mutation must leave untouched: the booking (state, version, events), desk, custody, inventory and public days. */
const snapshot = async (s, booking) => ({
  booking: ok(await s.getBooking(booking.id)), desk: ok(await s.listStaffBookings()), inventory: ok(await s.listInventory()),
  availability: ok(await s.getAssetAvailability(booking.assetId)),
})

test('private Booking snapshots carry a positive integer version equal to the number of coherent events', async () => {
  const { service: s } = make()
  ok(await student(s))
  const owned = ok(await s.listBookings())
  assert.deepEqual(owned.map(b => [b.id, b.version]), [['fixture-pending', 1], ['fixture-approved', 2], ['fixture-checked_out', 3], ['fixture-rejected', 2], ['fixture-cancelled', 2], ['fixture-returned', 4]])
  const fresh = ok(await s.requestBooking({ assetId: 'accessory-03', startDate: T, endDate: T, purpose: 'First request' }))
  assert.equal(fresh.version, 1)
  assert.equal(ok(await s.getBooking(fresh.id)).version, 1)
  assert.equal(ok(await s.listBookings()).find(b => b.id === fresh.id).version, 1)
  ok(await staff(s))
  for (const b of ok(await s.listStaffBookings()).bookings) {
    assert.ok(Number.isInteger(b.version) && b.version >= 1, b.id)
    assert.equal(b.version, b.events.length, `${b.id}: version tracks the event chain`)
  }
  const copy = ok(await s.getBooking(fresh.id)); copy.version = 99
  assert.equal(ok(await s.getBooking(fresh.id)).version, 1, 'returned snapshots are copies')
})

test('requests cannot choose the initial version and public asset data never carries a version', async () => {
  const { service: s } = make()
  ok(await student(s))
  const booking = ok(await s.requestBooking({ assetId: 'accessory-03', startDate: T, endDate: T, purpose: 'Injected version', version: 50, state: 'approved', userId: 'x', events: [] }))
  assert.equal(booking.version, 1); assert.equal(booking.state, 'pending')
  const anonymous = make().service
  const list = ok(await anonymous.listAssets())
  for (const asset of list.items) assert.deepEqual(Object.keys(asset).sort(), ['category', 'description', 'id', 'inventoryCode', 'location', 'name', 'state'])
  assert.deepEqual(Object.keys(list).sort(), ['horizonEnd', 'items', 'range', 'today'])
  const availability = ok(await anonymous.getAssetAvailability('camera-01'))
  assert.deepEqual(Object.keys(availability).sort(), ['assetId', 'days', 'horizonEnd', 'timeZone', 'today'])
  assert.ok(availability.days.every(day => Object.keys(day).sort().join() === 'date,state'))
})

for (const action of MUTATIONS) {
  test(`${action}: success increments the version by exactly one and every read agrees`, async () => {
    const { s, booking } = await prepared(action)
    const done = ok(await run(s, action, booking.id, withNote(action, { expectedVersion: booking.version, version: 77, actorId: 'attacker' })))
    assert.equal(done.version, booking.version + 1)
    assert.equal(done.events.length, booking.events.length + 1)
    assert.equal(done.events.at(-1).action, action)
    assert.deepEqual(ok(await s.getBooking(booking.id)), done)
    assert.equal(ok(await s.listStaffBookings()).bookings.find(b => b.id === booking.id).version, done.version)
    ok(await student(s))
    assert.equal(ok(await s.listBookings()).find(b => b.id === booking.id).version, done.version)
  })

  test(`${action}: missing or invalid expectedVersion is 422 VALIDATION_ERROR and changes nothing`, async () => {
    const { s, booking } = await prepared(action)
    const before = await snapshot(s, booking)
    const invalid = [undefined, null, {}, { expectedVersion: undefined }, { expectedVersion: null }, { expectedVersion: 0 }, { expectedVersion: -1 }, { expectedVersion: 1.5 },
      { expectedVersion: '1' }, { expectedVersion: NaN }, { expectedVersion: Infinity }, { expectedVersion: true }, { expectedVersion: [1] }, { expectedVersion: { value: 1 } },
      { expectedVersion: MAX_VERSION + 1 }, { expectedVersion: Number.MAX_SAFE_INTEGER }]
    for (const input of invalid) {
      const error = fail(await run(s, action, booking.id, withNote(action, input)), 'VALIDATION_ERROR')
      assert.ok(error.fields?.expectedVersion, `fields.expectedVersion for ${JSON.stringify(input)}`)
      assert.equal(error.fields.note, undefined)
      assert.deepEqual(await snapshot(s, booking), before)
    }
  })

  test(`${action}: valid but stale expectedVersion is 409 CONFLICT and changes nothing`, async () => {
    const { s, booking } = await prepared(action)
    const before = await snapshot(s, booking)
    for (const expectedVersion of [booking.version - 1, booking.version + 1, 1000, MAX_VERSION].filter(v => v !== booking.version && v >= 1)) {
      const error = fail(await run(s, action, booking.id, withNote(action, { expectedVersion })), 'CONFLICT', 409)
      assert.ok(error.fields?.expectedVersion, 'stale conflicts are distinguishable from state conflicts')
      assert.deepEqual(await snapshot(s, booking), before)
    }
    ok(await run(s, action, booking.id, withNote(action, { expectedVersion: booking.version })))
  })

  test(`${action}: authorization, privacy and availability checks run before version validation`, async () => {
    const { s, booking } = await prepared(action)
    const input = withNote(action, undefined)
    ok(await s.logout())
    fail(await run(s, action, booking.id, input), 'UNAUTHENTICATED', 401)
    if (action !== 'cancel') {
      // Staff-only routes: role first, even for an unknown id.
      ok(await student(s))
      fail(await run(s, action, booking.id, input), 'FORBIDDEN', 403)
      fail(await run(s, action, 'does-not-exist', input), 'FORBIDDEN', 403)
    } else {
      // Owner-or-coordinator route: another student cannot tell a foreign booking from a missing one.
      ok(await s.register({ username: 'versioning_other', password: 'VersioningOther42!' }))
      const foreign = fail(await run(s, action, booking.id, input), 'NOT_FOUND', 404)
      assert.deepEqual(fail(await run(s, action, 'does-not-exist', input), 'NOT_FOUND', 404), foreign)
    }
    ok(await staff(s))
    fail(await run(s, action, 'does-not-exist', input), 'NOT_FOUND', 404)
  })
}

test('an unavailable service answers before any authentication or version check', async () => {
  const { service: s, demo } = make()
  ok(await staff(s))
  demo.setScenario('error')
  for (const action of MUTATIONS) fail(await run(s, action, 'fixture-pending', undefined), 'SERVICE_UNAVAILABLE')
})

test('the approve-versus-cancel race: approval wins, then the stale cancellation fails and a fresh one succeeds', async () => {
  const { service: s } = make()
  ok(await student(s))
  const seen = ok(await s.requestBooking({ assetId: 'accessory-03', startDate: T, endDate: addDays(T, 1), purpose: 'Approve versus cancel' }))
  assert.equal(seen.state, 'pending'); assert.equal(seen.version, 1)
  // The owner keeps the pending version 1 snapshot while a coordinator, who observed the same snapshot, approves first.
  ok(await staff(s))
  const observed = ok(await s.listStaffBookings()).bookings.find(b => b.id === seen.id)
  assert.equal(observed.version, 1)
  const approved = ok(await s.approveBooking(seen.id, { expectedVersion: observed.version }))
  assert.deepEqual([approved.state, approved.version, approved.events.length], ['approved', 2, 2])
  ok(await student(s))
  const before = await snapshot2(s, seen)
  const stale = fail(await s.cancelBooking(seen.id, { expectedVersion: seen.version }), 'CONFLICT', 409)
  assert.ok(stale.fields.expectedVersion)
  assert.deepEqual(await snapshot2(s, seen), before, 'state, version, events and reserved days are unchanged')
  assert.equal(before.booking.state, 'approved'); assert.equal(before.days.filter(d => d.state === 'occupied').length, 2)
  // Cancelling from the freshly observed approved version 2 is allowed and produces version 3.
  const fresh = ok(await s.getBooking(seen.id))
  assert.equal(fresh.version, 2)
  const cancelled = ok(await s.cancelBooking(seen.id, { expectedVersion: fresh.version }))
  assert.deepEqual([cancelled.state, cancelled.version, cancelled.events.map(e => e.action)], ['cancelled', 3, ['create', 'approve', 'cancel']])
  assert.equal(ok(await s.getAssetAvailability(seen.assetId)).days.filter(d => d.state === 'occupied' && d.date >= T && d.date <= addDays(T, 1)).length, 0)
})

test('the approve-versus-cancel race: cancellation wins, then the old approval fails without resurrecting the booking', async () => {
  const { service: s } = make()
  ok(await student(s))
  const seen = ok(await s.requestBooking({ assetId: 'accessory-03', startDate: T, endDate: addDays(T, 1), purpose: 'Cancel versus approve' }))
  ok(await staff(s))
  const observed = ok(await s.listStaffBookings()).bookings.find(b => b.id === seen.id)
  ok(await student(s))
  const cancelled = ok(await s.cancelBooking(seen.id, { expectedVersion: seen.version }))
  assert.deepEqual([cancelled.state, cancelled.version, cancelled.events.length], ['cancelled', 2, 2])
  ok(await staff(s))
  const before = await snapshot2(s, seen)
  const stale = fail(await s.approveBooking(seen.id, { expectedVersion: observed.version }), 'CONFLICT', 409)
  assert.ok(stale.fields.expectedVersion)
  assert.deepEqual(await snapshot2(s, seen), before)
  assert.equal(before.booking.state, 'cancelled'); assert.equal(before.booking.version, 2)
  assert.ok(before.days.every(d => d.state === 'available'), 'cancelled dates stay released')
  // Even the fresh version cannot approve a terminal booking; that is the ordinary invalid-transition conflict.
  const terminal = fail(await s.approveBooking(seen.id, { expectedVersion: before.booking.version }), 'CONFLICT', 409)
  assert.equal(terminal.fields, undefined)
  assert.deepEqual(await snapshot2(s, seen), before)
})

test('both orderings of two in-flight actions settle on exactly one coherent winner', async () => {
  for (const order of ['approve-first', 'cancel-first']) {
    const { service: s } = make()
    ok(await student(s))
    const seen = ok(await s.requestBooking({ assetId: 'accessory-03', startDate: T, endDate: T, purpose: 'Concurrent actions' }))
    ok(await staff(s))
    const calls = { approve: () => s.approveBooking(seen.id, { expectedVersion: 1 }), cancel: () => s.cancelBooking(seen.id, { expectedVersion: 1 }) }
    const results = order === 'approve-first' ? await Promise.all([calls.approve(), calls.cancel()]) : await Promise.all([calls.cancel(), calls.approve()])
    assert.deepEqual(results.map(r => r.ok), [true, false], order)
    fail(results[1], 'CONFLICT', 409)
    const final = ok(await s.getBooking(seen.id))
    assert.equal(final.version, 2); assert.equal(final.events.length, 2)
    assert.equal(final.state, order === 'approve-first' ? 'approved' : 'cancelled')
    assert.equal(final.events.at(-1).action, order === 'approve-first' ? 'approve' : 'cancel')
    assert.equal(ok(await s.getAssetAvailability(seen.assetId)).days[0].state, order === 'approve-first' ? 'occupied' : 'available')
  }
})

test('a successful mutation makes every older snapshot stale, including repeats of the same action', async () => {
  const { s, booking } = await prepared('return')
  const v = booking.version
  const returned = ok(await s.returnBooking(booking.id, { note: NOTE, expectedVersion: v }))
  assert.equal(returned.version, v + 1)
  const before = await snapshot(s, booking)
  fail(await s.returnBooking(booking.id, { note: NOTE, expectedVersion: v }), 'CONFLICT', 409)
  assert.deepEqual(await snapshot(s, booking), before)
  // A repeat from the new version is the ordinary terminal-state conflict, not a stale one.
  const terminal = fail(await s.returnBooking(booking.id, { note: NOTE, expectedVersion: returned.version }), 'CONFLICT', 409)
  assert.equal(terminal.fields, undefined)
  assert.deepEqual(await snapshot(s, booking), before)
})

test('evaluation order: shape (422) and stale version (409) precede transition legality, which precedes note validation', async () => {
  const { s, booking } = await prepared('reject')
  const before = await snapshot(s, booking)
  // Valid version, short note: field-level 422 about the note only.
  const shortNote = fail(await s.rejectBooking(booking.id, { expectedVersion: booking.version, note: 'ab' }), 'VALIDATION_ERROR')
  assert.ok(shortNote.fields.note); assert.equal(shortNote.fields.expectedVersion, undefined)
  // Missing version wins over an invalid note; a stale version wins over an invalid note.
  assert.ok(fail(await s.rejectBooking(booking.id, { note: 'ab' }), 'VALIDATION_ERROR').fields.expectedVersion)
  assert.ok(fail(await s.rejectBooking(booking.id, { expectedVersion: booking.version + 1, note: 'ab' }), 'CONFLICT', 409).fields.expectedVersion)
  assert.deepEqual(await snapshot(s, booking), before)
  // A current version on an action the state forbids is the ordinary 409 (no fields), even with an invalid note.
  const approved = ok(await s.approveBooking(booking.id, { expectedVersion: booking.version }))
  const illegal = fail(await s.rejectBooking(booking.id, { expectedVersion: approved.version, note: 'ab' }), 'CONFLICT', 409)
  assert.equal(illegal.fields, undefined)
  assert.equal(ok(await s.getBooking(booking.id)).version, approved.version, 'the illegal action changed nothing')
  ok(await s.cancelBooking(booking.id, { expectedVersion: approved.version }))
})

// Public days for the booking's asset plus the private booking, as the owner or coordinator currently sees them.
async function snapshot2(s, booking) {
  return { booking: ok(await s.getBooking(booking.id)), days: ok(await s.getAssetAvailability(booking.assetId)).days }
}

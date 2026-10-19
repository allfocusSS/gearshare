import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockService, DEMO_ACCOUNTS } from '../src/services/mockService.ts'
import { addDays } from '../src/services/dates.ts'
const T = '2026-10-19'
const make = () => createMockService({ now: () => new Date(`${T}T06:00:00Z`), sleep: async () => {} })
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data }
const fail = (r, code) => { assert.equal(r.ok, false); assert.equal(r.error.code, code); return r.error }
const input = (extra = {}) => ({ assetId: 'accessory-01', startDate: T, endDate: T, purpose: '  Student club film  ', ...extra })
const login = async service => ok(await service.login(DEMO_ACCOUNTS.student))

test('request is private, pending, trimmed, copies public values and creates one UTC event', async () => {
  const { service } = make()
  fail(await service.requestBooking(input()), 'UNAUTHENTICATED')
  await login(service)
  const booking = ok(await service.requestBooking({ ...input(), userId: 'other', state: 'approved' }))
  assert.equal(booking.state, 'pending'); assert.equal(booking.userId, 'student-demo'); assert.equal(booking.purpose, 'Student club film')
  assert.deepEqual(booking.events.map(e => [e.action, e.priorState, e.newState, e.timestamp]), [['create', null, 'pending', `${T}T06:00:00.000Z`]])
  booking.events[0].note = 'tampered'
  assert.equal(ok(await service.getBooking(booking.id)).events[0].note, 'Student club film')
  const occupied = ok(await service.getAssetAvailability('accessory-01')).days.filter(d => d.state === 'occupied')
  assert.deepEqual(occupied.map(d => d.date), [T])
  ok(await service.register({ username: 'other_student', password: 'OtherStudent42!' }))
  assert.deepEqual(ok(await service.listBookings()), [])
  fail(await service.getBooking(booking.id), 'NOT_FOUND'); fail(await service.cancelBooking(booking.id), 'NOT_FOUND')
})

test('inclusive conflicts, adjacency, other units, cancellation release/rebooking and immutable history', async () => {
  const { service } = make(); await login(service)
  const b = ok(await service.requestBooking(input({ endDate: addDays(T, 2) })))
  for (const [startDate, endDate] of [[T,T],[addDays(T,2),addDays(T,3)],[T,addDays(T,4)]]) {
    const error = fail(await service.requestBooking(input({ startDate, endDate })), 'CONFLICT')
    assert.equal(error.status, 409); assert.ok(error.unavailableDates.length); assert.deepEqual(Object.keys(error).sort(), ['code','message','status','unavailableDates'])
  }
  ok(await service.requestBooking(input({ startDate: addDays(T,3), endDate: addDays(T,3) })))
  ok(await service.requestBooking(input({ assetId: 'accessory-03' })))
  const cancelled = ok(await service.cancelBooking(b.id)); assert.equal(cancelled.state, 'cancelled'); assert.equal(cancelled.events.length, 2)
  fail(await service.cancelBooking(b.id), 'CONFLICT'); assert.deepEqual(ok(await service.getBooking(b.id)), cancelled)
  ok(await service.requestBooking(input()))
})

test('required/date/purpose bounds fail atomically and legal 14 days/horizon succeed', async () => {
  const { service } = make(); await login(service)
  const before = ok(await service.listBookings())
  for (const extra of [{startDate:'',endDate:''},{startDate:addDays(T,-1)},{startDate:addDays(T,1)}, {endDate:addDays(T,14)}, {endDate:addDays(T,91)}, {purpose:'    '},{purpose:'a'.repeat(501)}]) fail(await service.requestBooking(input(extra)), 'VALIDATION_ERROR')
  fail(await service.requestBooking(input({assetId:'camera-03'})), 'CONFLICT')
  fail(await service.requestBooking(input({assetId:'missing'})), 'NOT_FOUND')
  assert.deepEqual(ok(await service.listBookings()), before)
  ok(await service.requestBooking(input({endDate:addDays(T,13), purpose:'a'.repeat(500)})))
  ok(await service.requestBooking(input({startDate:addDays(T,90),endDate:addDays(T,90),purpose:'abcde'})))
})

test('seeded active and terminal states enforce transitions, coordinator cancellation and privacy', async () => {
  const { service } = make(); await login(service)
  const seeded = ok(await service.listBookings())
  assert.deepEqual(seeded.map(b=>b.state), ['pending','approved','checked_out','rejected','cancelled','returned'])
  for (const b of seeded.filter(b=>!['pending','approved'].includes(b.state))) { fail(await service.cancelBooking(b.id),'CONFLICT'); assert.deepEqual(ok(await service.getBooking(b.id)),b) }
  ok(await service.login(DEMO_ACCOUNTS.coordinator))
  ok(await service.cancelBooking('fixture-approved'))
  assert.deepEqual(ok(await service.listBookings()), [])
  const availability = ok(await service.getAssetAvailability('camera-02'))
  // Cancellation releases the seeded approved allocation.
  assert.equal(availability.days[1].state, 'available')
})

test('deterministic stale-calendar conflict refreshes anonymous days, fails without partial request', async () => {
  const { service, demo } = make(); await login(service)
  const before = ok(await service.listBookings())
  demo.simulateConflict()
  assert.deepEqual(fail(await service.requestBooking(input()),'CONFLICT').unavailableDates,[T])
  assert.deepEqual(ok(await service.listBookings()),before)
  assert.equal(ok(await service.getAssetAvailability('accessory-01')).days[0].state,'occupied')
  demo.setScenario('error')
  for (const call of [()=>service.requestBooking(input()),()=>service.listBookings(),()=>service.getBooking('fixture-pending'),()=>service.cancelBooking('fixture-pending')]) fail(await call(),'SERVICE_UNAVAILABLE')
})

test('#25 inclusive cross-month and 14-day refresh, isolation and anonymous public shape', async () => {
  for (const [startDate,endDate] of [['2026-10-20','2026-10-22'],['2026-10-31','2026-11-02'],['2026-10-20','2026-11-02']]) {
    const {service} = make(); await login(service)
    const before = ok(await service.listBookings())
    const booking = ok(await service.requestBooking(input({assetId:'accessory-03',startDate,endDate})))
    const availability = ok(await service.getAssetAvailability('accessory-03'))
    for (const day of availability.days) {
      assert.equal(day.state,day.date >= startDate && day.date <= endDate ? 'occupied' : 'available')
      assert.deepEqual(Object.keys(day).sort(),['date','state'])
    }
    assert.ok(ok(await service.getAssetAvailability('accessory-01')).days.every(d=>d.state==='available'))
    assert.equal(ok(await service.listBookings()).length,before.length+1)
    assert.equal(booking.events.length,1)
    ok(await service.logout())
    assert.deepEqual(ok(await service.getAssetAvailability('accessory-03')),availability)
  }
})

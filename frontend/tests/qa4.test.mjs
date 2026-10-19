// Independent QA: gaps in #4 date/purpose atomicity, seeded roles and private history.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createMockService, DEMO_ACCOUNTS } from '../src/services/mockService.ts'
import { addDays } from '../src/services/dates.ts'

const T = '2026-10-19'
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data }
const fail = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code) }
const make = () => createMockService({ now: () => new Date(`${T}T06:00:00Z`), sleep: async () => {} })
const input = extra => ({ assetId: 'accessory-03', startDate: T, endDate: T, purpose: 'QA student production', ...extra })
const snapshot = async service => ({
  bookings: ok(await service.listBookings()),
  availability: await Promise.all(ok(await service.listAssets()).items.map(async asset => ok(await service.getAssetAvailability(asset.id)))),
})

test('QA #4 short/invalid and one-shot failure preserve all bookings/events/public allocations; exact purpose bounds trim', async () => {
  const { service, demo } = make(); ok(await service.login(DEMO_ACCOUNTS.student))
  const before = await snapshot(service)
  for (const extra of [
    { purpose: '' }, { purpose: '    ' }, { purpose: 'abcd' }, { purpose: 'a'.repeat(501) },
    { startDate: '', endDate: '' }, { startDate: '' }, { endDate: '' },
    { startDate: addDays(T, -1) }, { startDate: addDays(T, 1) },
    { endDate: addDays(T, 14) }, { endDate: addDays(T, 91) },
  ]) {
    fail(await service.requestBooking(input(extra)), 'VALIDATION_ERROR')
    assert.deepEqual(await snapshot(service), before)
  }
  demo.simulateFailure()
  fail(await service.requestBooking(input()), 'SERVICE_UNAVAILABLE')
  assert.deepEqual(await snapshot(service), before)
  const retried = ok(await service.requestBooking(input()))
  assert.equal(retried.events.length, 1)
  assert.equal(ok(await service.listBookings()).length, before.bookings.length + 1)
  for (const purpose of ['  abcde  ', `  ${'a'.repeat(500)}  `]) {
    const clean = make().service; ok(await clean.login(DEMO_ACCOUNTS.student))
    const booking = ok(await clean.requestBooking(input({ purpose })))
    assert.equal(booking.purpose, purpose.trim())
    assert.equal(booking.events[0].note, purpose.trim())
  }
})

test('QA #4 all active states occupy their inclusive days; owner/coordinator pending+approved cancellation release/history and forbidden actions', async () => {
  let date = T
  const { service } = createMockService({ now: () => new Date(`${date}T06:00:00Z`), sleep: async () => {} })
  ok(await service.login(DEMO_ACCOUNTS.student))
  const seeded = ok(await service.listBookings())
  for (const booking of seeded.filter(b => ['pending', 'approved', 'checked_out'].includes(b.state))) {
    date = booking.state === 'checked_out' ? booking.startDate : T
    const days = ok(await service.getAssetAvailability(booking.assetId)).days
    for (let day = booking.startDate; day <= booking.endDate; day = addDays(day, 1)) assert.equal(days.find(d => d.date === day)?.state, 'occupied')
  }
  date = T
  for (const booking of seeded.filter(b => ['checked_out', 'cancelled', 'rejected', 'returned'].includes(b.state))) {
    const before = await snapshot(service)
    fail(await service.cancelBooking(booking.id), 'CONFLICT')
    assert.deepEqual(await snapshot(service), before)
  }
  for (const actor of ['student', 'coordinator']) for (const state of ['pending', 'approved']) {
    const clean = make().service; ok(await clean.login(DEMO_ACCOUNTS.student))
    const original = ok(await clean.getBooking(`fixture-${state}`))
    ok(await clean.login(DEMO_ACCOUNTS[actor]))
    const cancelled = ok(await clean.cancelBooking(original.id))
    assert.equal(cancelled.state, 'cancelled')
    assert.deepEqual(cancelled.events.slice(0, -1), original.events)
    assert.deepEqual([cancelled.events.at(-1).action, cancelled.events.at(-1).priorState, cancelled.events.at(-1).newState, cancelled.events.at(-1).timestamp], ['cancel', state, 'cancelled', `${T}T06:00:00.000Z`])
    const days = ok(await clean.getAssetAvailability(original.assetId)).days
    for (let day = original.startDate; day <= original.endDate; day = addDays(day, 1)) assert.equal(days.find(d => d.date === day)?.state, 'available')
    const after = ok(await clean.getBooking(original.id))
    fail(await clean.cancelBooking(original.id), 'CONFLICT')
    assert.deepEqual(ok(await clean.getBooking(original.id)), after)
  }
})

test('QA #4 other owner and anonymous read/cancel denials preserve original private history and public allocation', async () => {
  const { service } = make(); ok(await service.login(DEMO_ACCOUNTS.student))
  const original = ok(await service.requestBooking(input()))
  const publicBefore = ok(await service.getAssetAvailability(original.assetId))
  ok(await service.register({ username: 'qa_other_student', password: 'QaOtherStudent42!' }))
  assert.deepEqual(ok(await service.listBookings()), [])
  fail(await service.getBooking(original.id), 'NOT_FOUND')
  fail(await service.cancelBooking(original.id), 'NOT_FOUND')
  assert.deepEqual(ok(await service.getAssetAvailability(original.assetId)), publicBefore)
  ok(await service.logout())
  fail(await service.getBooking(original.id), 'UNAUTHENTICATED')
  fail(await service.cancelBooking(original.id), 'UNAUTHENTICATED')
  fail(await service.listBookings(), 'UNAUTHENTICATED')
  const anonymous = ok(await service.getAssetAvailability(original.assetId))
  assert.deepEqual(anonymous, publicBefore)
  assert.deepEqual(Object.keys(anonymous).sort(), ['assetId', 'days', 'horizonEnd', 'timeZone', 'today'])
  assert.ok(anonymous.days.every(day => Object.keys(day).sort().join(',') === 'date,state'))
  ok(await service.login(DEMO_ACCOUNTS.student))
  assert.deepEqual(ok(await service.getBooking(original.id)), original)
})

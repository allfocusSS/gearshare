import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockService, DEMO_ACCOUNTS } from '../src/services/mockService.ts'
import { hasUnpairedSurrogate, textLength } from '../src/services/text.ts'

const instant = () => createMockService({ sleep: async () => {}, now: () => new Date('2026-10-21T19:00:00Z') }).service
const unwrap = result => { assert.equal(result.ok, true); return result.data }
const rejected = (result, field) => { assert.equal(result.ok, false); assert.equal(result.error.code, 'VALIDATION_ERROR'); assert.ok(result.error.fields[field]) }

test('text limits count Unicode code points and recognize lone surrogates', () => {
  assert.equal(textLength('a😀e\u0301'), 4)
  assert.equal(hasUnpairedSurrogate('😀𐀀'), false)
  for (const value of ['\ud800', '\udfff', '\ud800x', 'x\udfff']) assert.equal(hasUnpairedSurrogate(value), true)
})

test('BMP, astral, mixed and combining passwords keep frozen 9/10/128/129 boundaries', async () => {
  const patterns = [n => 'é'.repeat(n), n => '😀'.repeat(n), n => 'a😀'.repeat(Math.floor(n / 2)) + (n % 2 ? 'a' : ''), n => 'e\u0301'.repeat(Math.floor(n / 2)) + (n % 2 ? 'e' : '')]
  for (const pattern of patterns) for (const length of [9, 10, 128, 129]) {
    const service = instant()
    const password = pattern(length)
    const result = await service.register({ username: 'unicode_member', password })
    if ([9, 129].includes(length)) {
      rejected(result, 'password')
      assert.equal(unwrap(await service.currentUser()), null)
      unwrap(await service.register({ username: 'unicode_member', password: 'ValidPassword42!' }))
    } else {
      const user = unwrap(result)
      await service.logout()
      assert.deepEqual(unwrap(await service.login({ username: 'unicode_member', password })), user)
    }
  }
})

test('credential surrogates and non-string values fail without creating an account', async () => {
  for (const [field, value] of [['username', 'abc\ud800'], ['password', 'a'.repeat(10) + '\ud800'], ['password', '\udfff' + 'a'.repeat(10)], ['username', 123], ['password', null]]) {
    const service = instant()
    rejected(await service.register({ username: 'unicode_member', password: 'ValidPassword42!', [field]: value }), field)
    assert.equal(unwrap(await service.currentUser()), null)
    unwrap(await service.register({ username: 'unicode_member', password: 'ValidPassword42!' }))
  }
})

test('password whitespace and combining sequences remain unnormalized', async () => {
  const service = instant()
  const password = '  e\u0301😀password  '
  unwrap(await service.register({ username: '\ufeff\u00a0 Code_Point9 \u3000', password }))
  await service.logout()
  for (const wrong of [password.trim(), password.normalize('NFC')]) {
    const result = await service.login({ username: 'code_point9', password: wrong })
    assert.equal(result.error.code, 'INVALID_CREDENTIALS')
  }
  unwrap(await service.login({ username: 'CODE_POINT9', password }))
  for (const edge of ['\u0085', '\u001c', '\u200b']) rejected(await service.register({ username: edge + 'abc' + edge, password }), 'username')
})

test('purpose, note and body-id lengths use the same code point unit', async () => {
  const service = instant()
  await service.login(DEMO_ACCOUNTS.student)
  const request = { assetId: 'asset-cam-001', startDate: '2026-10-22', endDate: '2026-10-22', purpose: '😀'.repeat(5) }
  // Use a free physical unit in the stable fixture instead of a made-up id.
  const assets = unwrap(await service.listAssets({ startDate: request.startDate, endDate: request.endDate }))
  request.assetId = assets.items[0].id
  rejected(await service.requestBooking({ ...request, purpose: '😀'.repeat(4) }), 'purpose')
  const long = await service.requestBooking({ ...request, purpose: '😀'.repeat(501) })
  rejected(long, 'purpose')
  assert.equal((await service.requestBooking({ ...request, assetId: '😀'.repeat(100) })).error.code, 'NOT_FOUND')
  rejected(await service.requestBooking({ ...request, assetId: '😀'.repeat(101) }), 'assetId')
  const booking = unwrap(await service.requestBooking({ ...request, purpose: '😀'.repeat(500) }))
  await service.login(DEMO_ACCOUNTS.coordinator)
  rejected(await service.rejectBooking(booking.id, { expectedVersion: booking.version, note: '😀'.repeat(2) }), 'note')
  rejected(await service.rejectBooking(booking.id, { expectedVersion: booking.version, note: '😀'.repeat(501) }), 'note')
  assert.equal(unwrap(await service.rejectBooking(booking.id, { expectedVersion: booking.version, note: '😀'.repeat(500) })).events.at(-1).note, '😀'.repeat(500))
})

test('inventory text lengths retain their numeric limits with supplementary characters', async () => {
  const service = instant()
  await service.login(DEMO_ACCOUNTS.coordinator)
  const input = { name: '😀'.repeat(100), inventoryCode: '😀'.repeat(30), location: '😀'.repeat(100), description: '😀'.repeat(2000), category: 'Cameras' }
  unwrap(await service.addAsset(input))
  for (const [field, limit] of [['name', 100], ['inventoryCode', 30], ['location', 100], ['description', 2000]]) rejected(await service.addAsset({ ...input, [field]: '😀'.repeat(limit + 1) }), field)
  for (const field of ['name', 'inventoryCode', 'location']) rejected(await service.addAsset({ ...input, [field]: '😀' }), field)
  unwrap(await service.addAsset({ ...input, name: '😀😀', inventoryCode: 'AB', location: '😀😀', description: '' }))
})

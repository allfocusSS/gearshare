import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockService, DEMO_ACCOUNTS } from '../src/services/mockService.ts'
import { clubToday } from '../src/services/dates.ts'

const instant = (scenario = 'normal') => createMockService({ scenario, sleep: async () => {} })
const unwrap = (result) => { assert.equal(result.ok, true); return result.data }
const error = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); return result.error }

test('both fictional accounts sign in through the same boundary and expose only public user fields', async () => {
  const { service } = instant()
  assert.equal(unwrap(await service.currentUser()), null)
  for (const role of ['student', 'coordinator']) {
    const user = unwrap(await service.login(DEMO_ACCOUNTS[role]))
    assert.equal(user.role, role)
    assert.deepEqual(Object.keys(user).sort(), ['id', 'role', 'username'])
    user.role = 'changed-by-client'
    assert.equal(unwrap(await service.currentUser()).role, role)
    assert.equal(unwrap(await service.logout()), null)
    assert.equal(unwrap(await service.currentUser()), null)
  }
})

test('registration trims and lowercases usernames, fixes student role and rejects normalized duplicates', async () => {
  const { service } = instant()
  const user = unwrap(await service.register({ username: '  New_Member9  ', password: 'ExamplePass42!', role: 'coordinator', id: 'coordinator-demo' }))
  assert.equal(user.username, 'new_member9')
  assert.equal(user.role, 'student')
  assert.notEqual(user.id, 'coordinator-demo')
  assert.deepEqual(unwrap(await service.currentUser()), user)
  await service.logout()
  assert.equal(unwrap(await service.login({ username: ' NEW_MEMBER9 ', password: 'ExamplePass42!' })).id, user.id)
  error(await service.register({ username: '  nEw_Member9 ', password: 'DifferentPass42!' }), 'USERNAME_TAKEN')
  error(await service.register({ username: ' MAYA_STUDENT ', password: 'DifferentPass42!' }), 'USERNAME_TAKEN')
})

test('username bounds and exact ASCII character set are enforced without creating a user', async () => {
  for (const username of ['ab', 'a'.repeat(31), 'name space', 'élève', 'имя', 'abc-def', '', '  ']) {
    const { service } = instant('empty')
    assert.ok(error(await service.register({ username, password: 'ValidPassword42!' }), 'VALIDATION_ERROR').fields.username)
    assert.equal(unwrap(await service.currentUser()), null)
  }
  for (const username of ['abc', 'A'.repeat(30), 'abc_123']) {
    const { service } = instant('empty')
    assert.equal(unwrap(await service.register({ username, password: 'ValidPassword42!' })).username, username.toLowerCase())
  }
})

test('password lengths 10 and 128 pass; 9 and 129 fail without partial registration', async () => {
  for (const length of [9, 129]) {
    const { service } = instant('empty')
    assert.ok(error(await service.register({ username: 'member', password: 'x'.repeat(length) }), 'VALIDATION_ERROR').fields.password)
    assert.equal(unwrap(await service.currentUser()), null)
    unwrap(await service.register({ username: 'member', password: 'validpass10' }))
  }
  for (const length of [10, 128]) {
    const { service } = instant('empty')
    unwrap(await service.register({ username: 'member', password: 'x'.repeat(length) }))
  }
})

test('wrong credentials reject and do not create or mutate the current session', async () => {
  const { service } = instant()
  error(await service.login({ username: 'maya_student', password: 'WrongPassword42!' }), 'INVALID_CREDENTIALS')
  assert.equal(unwrap(await service.currentUser()), null)
  const user = unwrap(await service.login(DEMO_ACCOUNTS.student))
  error(await service.login({ username: 'unknown_member', password: 'WrongPassword42!' }), 'INVALID_CREDENTIALS')
  assert.deepEqual(unwrap(await service.currentUser()), user)
})

test('adapter instances and fixture resets keep all accounts and sessions memory-only', async () => {
  const first = instant()
  unwrap(await first.service.register({ username: 'new_member', password: 'ExamplePass42!' }))
  const second = instant()
  assert.equal(unwrap(await second.service.currentUser()), null)
  error(await second.service.login({ username: 'new_member', password: 'ExamplePass42!' }), 'INVALID_CREDENTIALS')
  first.demo.setScenario('normal')
  assert.equal(unwrap(await first.service.currentUser()), null)
  error(await first.service.login({ username: 'new_member', password: 'ExamplePass42!' }), 'INVALID_CREDENTIALS')
})

test('empty fixture has no seeded users and still permits student registration', async () => {
  const { service } = instant('empty')
  error(await service.login(DEMO_ACCOUNTS.student), 'INVALID_CREDENTIALS')
  error(await service.login(DEMO_ACCOUNTS.coordinator), 'INVALID_CREDENTIALS')
  assert.equal(unwrap(await service.register({ username: 'fresh_student', password: 'ExamplePass42!' })).role, 'student')
})

test('error fixture returns typed failure for every async operation; recovery creates no false account', async () => {
  const { service, demo } = instant('error')
  error(await service.currentUser(), 'SERVICE_UNAVAILABLE')
  error(await service.login(DEMO_ACCOUNTS.student), 'SERVICE_UNAVAILABLE')
  error(await service.register({ username: 'new_member', password: 'ExamplePass42!' }), 'SERVICE_UNAVAILABLE')
  error(await service.logout(), 'SERVICE_UNAVAILABLE')
  demo.setScenario('normal')
  assert.equal(unwrap(await service.currentUser()), null)
  error(await service.login({ username: 'new_member', password: 'ExamplePass42!' }), 'INVALID_CREDENTIALS')
})

test('loading fixture stays pending until its injected delay resolves', async () => {
  let release
  let requestedDelay
  const { service } = createMockService({ scenario: 'loading', sleep: (milliseconds) => { requestedDelay = milliseconds; return new Promise((resolve) => { release = resolve }) } })
  let settled = false
  const request = service.login(DEMO_ACCOUNTS.student).then((result) => { settled = true; return result })
  await Promise.resolve()
  assert.equal(requestedDelay, 1600)
  assert.equal(settled, false)
  release()
  assert.equal(unwrap(await request).role, 'student')
})

test('reset during an outstanding request cannot establish a stale session', async () => {
  let release
  const { service, demo } = createMockService({ sleep: () => new Promise((resolve) => { release = resolve }) })
  const request = service.login(DEMO_ACCOUNTS.coordinator)
  demo.setScenario('empty')
  release()
  error(await request, 'SERVICE_UNAVAILABLE')
})

test('club-local today is injected and handles UTC date boundaries deterministically', () => {
  assert.equal(clubToday(new Date('2026-01-01T18:59:59Z')), '2026-01-01')
  assert.equal(clubToday(new Date('2026-01-01T19:00:00Z')), '2026-01-02')
  assert.equal(clubToday(new Date('2026-12-31T23:00:00Z')), '2027-01-01')
})

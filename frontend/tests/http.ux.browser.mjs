import assert from 'node:assert/strict'
import { after, before, describe } from 'node:test'
import { api, launchBrowser, outputFolder, startStack, writeJson } from './support/stack.mjs'
import { TOKEN_KEY, addDays, clubToday, newStudent } from './support/browserKit.mjs'
import { issue31, issue32, issue33, issue36, issue37, issue38, issue43, selectedIssue } from './support/ux.mjs'

const suite = { mode: 'http', output: outputFolder('http-ux'), records: [] }
let stack, browser, coordinatorToken, serial = 0
before(async () => {
  stack = await startStack({ backendPort: Number(process.env.UX_HTTP_BACKEND_PORT ?? 6241), vitePort: Number(process.env.UX_HTTP_VITE_PORT ?? 6242) })
  suite.base = stack.frontendUrl
  browser = await launchBrowser()
  const login = await api(stack, '/api/v1/auth/login', { method: 'POST', body: stack.coordinator })
  assert.equal(login.status, 200)
  coordinatorToken = login.json.token
})
after(async () => { writeJson(suite.output, 'evidence.json', suite.records); await browser?.close(); await stack?.stop() })
/**
 * A fresh case: its own student, its own unit and its own browser context (signed in through the stored token).
 * `options.unit` overrides unit fields (name, location, description, category) for the text-wrapping cases;
 * `options.signedIn === false` opens the unit without a session.
 */
suite.fresh = async (width, name, options = {}) => {
  const n = ++serial
  const student = newStudent(`ux_${n}`)
  const registration = await api(stack, '/api/v1/auth/register', { method: 'POST', body: student })
  assert.equal(registration.status, 201)
  const unit = await api(stack, '/api/v1/staff/assets', { method: 'POST', token: coordinatorToken, body: {
    name: `UX unit ${n}`, inventoryCode: `UX-${n}`, category: 'Cameras', location: 'Club desk', description: 'Dedicated usability regression unit.', ...(typeof options.unit === 'function' ? options.unit(n) : options.unit),
  } })
  assert.equal(unit.status, 201, JSON.stringify(unit.json))
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Almaty' })
  const token = options.as === 'coordinator' ? coordinatorToken : registration.json.token
  if (options.signedIn !== false) await context.addInitScript(({ key, token }) => sessionStorage.setItem(key, token), { key: TOKEN_KEY, token })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  await page.goto(`${suite.base}/#/assets/${unit.json.id}`)
  await page.getByRole('heading', { name: 'Check availability', level: 2 }).waitFor()
  if (options.signedIn !== false) await page.getByRole('button', { name: 'Request equipment', exact: true }).waitFor()
  else await page.getByRole('link', { name: 'Sign in to request equipment', exact: true }).waitFor()
  const today = (await api(stack, `/api/v1/assets/${unit.json.id}/availability`)).json.today
  assert.equal(today, clubToday())
  // Dates stay inside the 90 day booking horizon however many cases ran before: 21..80 days ahead, wrapping every 60 cases
  // (each case has its own unit, so reusing an offset cannot collide).
  const day = addDays(today, 20 + 1 + ((n - 1) % 60))
  let booking = null
  if (options.reserve) {
    // One reservation for the case student through the API ('cancelled' also cancels it, for the History tab).
    const made = await api(stack, '/api/v1/bookings', { method: 'POST', token: registration.json.token, body: { assetId: unit.json.id, startDate: day, endDate: day, purpose: 'Reservation for the layout check' } })
    assert.equal(made.status, 201, JSON.stringify(made.json))
    booking = made.json
    if (options.reserve === 'cancelled') {
      const cancelled = await api(stack, `/api/v1/bookings/${booking.id}/cancel`, { method: 'POST', token: registration.json.token, body: { expectedVersion: booking.version } })
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.json))
      booking = cancelled.json
    }
  }
  return { page, context, width, name, today, day, assetId: unit.json.id, token: registration.json.token, student, unit: unit.json, booking }
}
/** A page of the same browser signed in as the coordinator (its own context, same viewport width). */
suite.coordinatorPage = async t => {
  const context = await browser.newContext({ viewport: { width: t.width, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Almaty' })
  await context.addInitScript(({ key, token }) => sessionStorage.setItem(key, token), { key: TOKEN_KEY, token: coordinatorToken })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  return page
}
/**
 * Bookings for the desk screens of the #37/#38 sweeps, made through the API for the case student: a pending request, an
 * approved pickup and a returned loan (request, approve, check out and return today). Returns the booking ids.
 */
suite.seedDesk = async t => {
  const staff = (path, body) => api(stack, path, { method: 'POST', token: coordinatorToken, body })
  const book = async (startDate, endDate, purpose) => {
    const made = await api(stack, '/api/v1/bookings', { method: 'POST', token: t.token, body: { assetId: t.assetId, startDate, endDate, purpose } })
    assert.equal(made.status, 201, JSON.stringify(made.json))
    return made.json.id
  }
  const step = async (id, action, version, note) => {
    const done = await staff(`/api/v1/staff/bookings/${id}/${action}`, { expectedVersion: version, ...(note ? { note } : {}) })
    assert.equal(done.status, 200, `${action}: ${JSON.stringify(done.json)}`)
  }
  const pending = await book(addDays(t.today, 30), addDays(t.today, 31), 'Sweep: pending request with a normal purpose')
  const approved = await book(addDays(t.today, 40), addDays(t.today, 41), 'Sweep: approved pickup with a normal purpose')
  await step(approved, 'approve', 1)
  const returned = await book(t.today, t.today, 'Sweep: returned loan with a normal purpose')
  await step(returned, 'approve', 1)
  await step(returned, 'checkout', 2, 'Kit complete and in good condition')
  await step(returned, 'return', 3, 'Returned complete and clean')
  return { pending, approved, returned }
}
/** A second unit (unique code) for cases that need more than the case's own unit. */
suite.newUnit = async (overrides = {}) => {
  const n = ++serial
  const unit = await api(stack, '/api/v1/staff/assets', { method: 'POST', token: coordinatorToken, body: { name: `UX unit ${n}`, inventoryCode: `UX-${n}`, category: 'Cameras', location: 'Club desk', description: 'Extra unit for a usability regression.', ...overrides } })
  assert.equal(unit.status, 201, JSON.stringify(unit.json))
  return unit.json
}
/** A booking of one day, `offset` days ahead, for the case student (returns the booking). */
suite.book = async (t, assetId, offset, purposeText = 'Second reservation for the focus check') => {
  const day = addDays(t.today, offset)
  const made = await api(stack, '/api/v1/bookings', { method: 'POST', token: t.token, body: { assetId, startDate: day, endDate: day, purpose: purposeText } })
  assert.equal(made.status, 201, JSON.stringify(made.json))
  return made.json
}
/** A coordinator API call (staff actions behind the page's back: approve, check out, return, cancel). */
suite.staff = (path, body, method = 'POST') => api(stack, path, { method, token: coordinatorToken, body })
/** Ends the case student's session on the server (the page still holds the token). */
suite.revoke = async t => {
  const result = await api(stack, '/api/v1/auth/logout', { method: 'POST', token: t.token })
  assert.ok([200, 204].includes(result.status), `logout status ${result.status}`)
}
suite.conflict = async (t, day = t.day) => {
  const other = await api(stack, '/api/v1/auth/register', { method: 'POST', body: newStudent('ux31_race') })
  assert.equal(other.status, 201)
  const booked = await api(stack, '/api/v1/bookings', { method: 'POST', token: other.json.token, body: { assetId: t.assetId, startDate: day, endDate: day, purpose: 'Competing future reservation' } })
  assert.equal(booked.status, 201)
}
/** Another unit to open from the same page (returns its id). */
suite.otherAsset = async t => {
  const unit = await api(stack, '/api/v1/staff/assets', { method: 'POST', token: coordinatorToken, body: { name: `UX other ${++serial}`, inventoryCode: `UX-O${serial}`, category: 'Cameras', location: 'Club desk', description: 'Second unit for the scope guards.' } })
  assert.equal(unit.status, 201)
  return unit.json.id
}
suite.fail = async (t, kind) => t.page.route('**/api/v1/bookings', route => kind === 'network' ? route.abort('connectionreset') : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Internal server error.' }) }))
describe('issue #31 — associated server date validation', { skip: !selectedIssue(31), concurrency: false }, () => issue31(suite))
describe('issue #32 — focus after the booking request settles', { skip: !selectedIssue(32), concurrency: false }, () => issue32(suite))
describe('issue #36 — calendar month across the availability refresh', { skip: !selectedIssue(36), concurrency: false }, () => issue36(suite))
describe('issue #37 — long unbroken equipment text on the asset detail page', { skip: !selectedIssue(37), concurrency: false }, () => issue37(suite))
describe('issue #38 — long unbroken equipment names on My reservations', { skip: !selectedIssue(38), concurrency: false }, () => issue38(suite))
describe('issue #43 — Retry detail on the asset detail load error', { skip: !selectedIssue(43), concurrency: false }, () => issue43(suite))
describe('issue #33 — My reservations: View details and Cancel reservation focus', { skip: !selectedIssue(33), concurrency: false }, () => issue33(suite))

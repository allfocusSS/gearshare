import assert from 'node:assert/strict'
import { after, before, describe } from 'node:test'
import { api, launchBrowser, outputFolder, startStack, writeJson } from './support/stack.mjs'
import { TOKEN_KEY, addDays, clubToday, newStudent } from './support/browserKit.mjs'
import { issue31, selectedIssue } from './support/ux.mjs'

const suite = { mode: 'http', output: outputFolder('http-ux'), records: [] }
let stack, browser, coordinatorToken, serial = 0
before(async () => {
  stack = await startStack({ backendPort: 6241, vitePort: 6242 })
  suite.base = stack.frontendUrl
  browser = await launchBrowser()
  const login = await api(stack, '/api/v1/auth/login', { method: 'POST', body: stack.coordinator })
  assert.equal(login.status, 200)
  coordinatorToken = login.json.token
})
after(async () => { writeJson(suite.output, 'evidence.json', suite.records); await browser?.close(); await stack?.stop() })
suite.fresh = async (width, name) => {
  const n = ++serial
  const student = newStudent(`ux31_${n}`)
  const registration = await api(stack, '/api/v1/auth/register', { method: 'POST', body: student })
  assert.equal(registration.status, 201)
  const unit = await api(stack, '/api/v1/staff/assets', { method: 'POST', token: coordinatorToken, body: {
    name: `UX31 unit ${n}`, inventoryCode: `UX31-${n}`, category: 'Cameras', location: 'Club desk', description: 'Dedicated date error regression unit.',
  } })
  assert.equal(unit.status, 201)
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Almaty' })
  await context.addInitScript(({ key, token }) => sessionStorage.setItem(key, token), { key: TOKEN_KEY, token: registration.json.token })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  await page.goto(`${suite.base}/#/assets/${unit.json.id}`)
  await page.getByRole('button', { name: 'Request equipment', exact: true }).waitFor()
  const today = (await api(stack, `/api/v1/assets/${unit.json.id}/availability`)).json.today
  assert.equal(today, clubToday())
  return { page, context, width, name, today, day: addDays(today, 20 + n), assetId: unit.json.id }
}
suite.conflict = async t => {
  const other = await api(stack, '/api/v1/auth/register', { method: 'POST', body: newStudent('ux31_race') })
  assert.equal(other.status, 201)
  const booked = await api(stack, '/api/v1/bookings', { method: 'POST', token: other.json.token, body: { assetId: t.assetId, startDate: t.day, endDate: t.day, purpose: 'Competing future reservation' } })
  assert.equal(booked.status, 201)
}
suite.fail = async (t, kind) => t.page.route('**/api/v1/bookings', route => kind === 'network' ? route.abort('connectionreset') : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Internal server error.' }) }))
describe('issue #31 — associated server date validation', { skip: !selectedIssue(31), concurrency: false }, () => issue31(suite))

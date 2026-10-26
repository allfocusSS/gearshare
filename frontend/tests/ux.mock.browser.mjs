import { spawn } from 'node:child_process'
import { after, before, describe } from 'node:test'
import { frontendDir, launchBrowser, outputFolder, writeJson } from './support/stack.mjs'
import { addDays, clubToday, createHelpers, newStudent } from './support/browserKit.mjs'
import { issue31, issue32, issue33, issue34, issue35, issue36, issue37, issue38, issue39, issue43, selectedIssue } from './support/ux.mjs'
const mockPort = Number(process.env.UX_MOCK_PORT ?? 6243)
const suite = { mode: 'mock', base: `http://127.0.0.1:${mockPort}`, output: outputFolder('mock-ux'), records: [] }
let server, browser, serial = 0
before(async () => {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(mockPort), '--strictPort'], { cwd: frontendDir, stdio: 'ignore', env: { ...process.env, VITE_GEARSHARE_SERVICE: 'mock' } })
  for (let i = 0; i < 100; i++) { try { if ((await fetch(suite.base)).ok) break } catch {} await new Promise(resolve => setTimeout(resolve, 100)) }
  browser = await launchBrowser()
})
after(async () => { writeJson(suite.output, 'evidence.json', suite.records); await browser?.close(); server?.kill() })
suite.fresh = async (width, name, options = {}) => {
  // Every fresh browser context has its own isolated mock store, fresh unit and student.
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const h = createHelpers(page, suite.base)
  const student = newStudent('ux31mock')
  let unit = null, assetId = 'camera-01'
  // `options.bare`: an empty page for the cases of other screens; the case itself navigates and signs in.
  if (options.bare) {
    await page.goto(`${suite.base}/#/explore`)
    await page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    return { page, context, width, name, today: clubToday(), day: addDays(clubToday(), 20), assetId, unit, student }
  }
  if (options.unit) {
    // Units for the text-wrapping cases are added through the real Inventory form as the coordinator, as QA's 37.10 asks.
    await page.goto(`${suite.base}/#/signin?returnTo=inventory`)
    await page.getByRole('button', { name: 'Fill coordinator credentials', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await h.accountName().waitFor()
    unit = { name: `UX unit ${++serial}`, inventoryCode: `UXM-${serial}`, category: 'Cameras', location: 'Club desk', description: 'Dedicated usability regression unit.', ...(typeof options.unit === 'function' ? options.unit(serial) : options.unit) }
    await page.getByRole('button', { name: /^Add equipment/ }).click()
    await page.getByLabel('Equipment name', { exact: true }).fill(unit.name)
    await page.getByLabel('Inventory code', { exact: true }).fill(unit.inventoryCode)
    await page.getByLabel('Pickup location', { exact: true }).fill(unit.location)
    await page.getByLabel('Description', { exact: true }).fill(unit.description)
    await page.getByRole('button', { name: 'Add physical unit', exact: true }).click()
    await page.locator('[id^="edit-"]').last().waitFor()
    assetId = (await page.locator(`tr:has-text("${unit.inventoryCode}") [id^="edit-"]`).first().getAttribute('id')).slice('edit-'.length)
    unit = { ...unit, inventoryCode: unit.inventoryCode.toUpperCase() }
    await page.evaluate(id => { location.hash = `/assets/${id}` }, assetId)
    if (options.reserve) {
      // The mock store lives in this page load: sign out, sign in as maya_student and request the unit through the form.
      await h.signOut()
      await page.evaluate(id => { location.hash = `/signin?returnTo=assets/${id}` }, assetId)
      await page.getByRole('button', { name: 'Fill student credentials', exact: true }).click()
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await h.accountName().waitFor()
      await page.getByRole('button', { name: 'Request equipment', exact: true }).waitFor()
      await page.locator('#detail-startDate').fill(addDays(clubToday(), 20))
      await page.locator('#detail-endDate').fill(addDays(clubToday(), 20))
      await page.locator('#booking-purpose').fill('Reservation for the layout check')
      await page.getByRole('button', { name: 'Request equipment', exact: true }).click()
      await page.getByRole('link', { name: 'View my reservations', exact: true }).waitFor()
    }
  } else if (options.maya || name.startsWith('31.10 ')) {
    await page.goto(`${suite.base}/#/signin?returnTo=assets/camera-01`)
    await page.getByRole('button', { name: 'Fill student credentials', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  } else await h.register(student.username, student.password, 'assets/camera-01')
  await page.getByRole('button', { name: 'Request equipment', exact: true }).waitFor()
  // Observe the real mock adapter without replacing its behavior or manufacturing error fields.
  await page.evaluate(async () => {
    const { gearShareService } = await import('/src/services/index.ts')
    const requestBooking = gearShareService.requestBooking.bind(gearShareService)
    window.__uxBookingProbe = { calls: 0, results: [] }
    gearShareService.requestBooking = async input => {
      window.__uxBookingProbe.calls += 1
      const result = await requestBooking(input)
      window.__uxBookingProbe.results.push(result)
      return result
    }
  })
  const today = clubToday()
  return { page, context, width, name, today, day: addDays(today, 20), assetId, unit, student }
}
suite.conflict = async (t, day) => t.page.getByRole('button', { name: 'Simulate next-request conflict', exact: true }).click()
suite.otherAsset = async () => 'camera-02'
suite.fail = async t => t.page.getByRole('button', { name: 'Simulate next-request failure', exact: true }).click()
describe('issue #31 — mock shared date validation (includes 31.10)', { skip: !selectedIssue(31), concurrency: false }, () => issue31(suite))
describe('issue #32 — mock focus after the booking request settles (includes 32.12)', { skip: !selectedIssue(32), concurrency: false }, () => issue32(suite))
describe('issue #36 — mock calendar month across the availability refresh (includes 36.9)', { skip: !selectedIssue(36), concurrency: false }, () => issue36(suite))
describe('issue #37 — mock long unbroken equipment text (37.10)', { skip: !selectedIssue(37), concurrency: false }, () => issue37(suite))
describe('issue #38 — mock long unbroken equipment names on My reservations (38.11)', { skip: !selectedIssue(38), concurrency: false }, () => issue38(suite))
describe('issue #43 — mock Retry detail on the asset detail load error (43.11)', { skip: !selectedIssue(43), concurrency: false }, () => issue43(suite))
describe('issue #33 — mock My reservations focus (33.11)', { skip: !selectedIssue(33), concurrency: false }, () => issue33(suite))
describe('issue #34 — mock Inventory maintenance toggle focus (34.10)', { skip: !selectedIssue(34), concurrency: false }, () => issue34(suite))
describe('issue #35 — mock Coordinator desk focus rules (35.9)', { skip: !selectedIssue(35), concurrency: false }, () => issue35(suite))
describe('issue #39 — mock Sign in: a wrong password keeps focus (39.9)', { skip: !selectedIssue(39), concurrency: false }, () => issue39(suite))

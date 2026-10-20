// Independent #28 recovery regression. BASELINE=1 records expected old failures.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const port = process.env.GEARSHARE_QA28_PORT ?? '5194'
const base = `http://127.0.0.1:${port}`, baseline = process.env.BASELINE === '1'
const output = `${cwd}/test-results/qa28-${baseline ? 'before' : 'after'}`
await mkdir(output, { recursive: true })
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
assert.equal(execFileSync('git', ['diff', '--', 'src'], { cwd, encoding: 'utf8' }).trim(), '', 'Use committed implementation')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
let log = '', browser, page
server.stdout.on('data', d => { log += d }); server.stderr.on('data', d => { log += d })
const checks = [], failures = [], observations = [], errors = [], failedRequests = [], apiRequests = []
const check = (condition, message) => { checks.push({ message, passed: Boolean(condition) }); if (!condition) failures.push(message) }
const cases = [
  { name: 'approve', id: 'fixture-pending', view: 'Pending requests', action: 'Approve request', confirm: 'approve request', method: 'approveBooking', state: 'approved' },
  { name: 'reject', id: 'fixture-pending', view: 'Pending requests', action: 'Reject request', confirm: 'reject request', method: 'rejectBooking', state: 'rejected', label: 'Rejection reason' },
  { name: 'cancel-pending', id: 'fixture-pending', view: 'Pending requests', action: 'Cancel reservation', confirm: 'cancel reservation', method: 'cancelBooking', state: 'cancelled' },
  { name: 'cancel-approved', id: 'fixture-approved', view: 'Pickups', action: 'Cancel reservation', confirm: 'cancel reservation', method: 'cancelBooking', state: 'cancelled' },
  { name: 'checkout', view: 'Pickups', action: 'Check out equipment', confirm: 'check out equipment', method: 'checkoutBooking', state: 'checked_out', label: 'Outgoing condition' },
  { name: 'overdue-return', id: 'fixture-checked_out', view: 'Active loans', action: 'Record return', confirm: 'record return', method: 'returnBooking', state: 'returned', label: 'Incoming condition' },
]
const noOverflow = async label => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), `No overflow: ${label}`)
const unavailable = async label => {
  check(await page.locator('.desk-counts').count() === 0, `Untrusted summary withheld: ${label}`)
  check(await page.locator('.staff-tabs').count() === 0, `Untrusted queue counts withheld: ${label}`)
  check(await page.locator('.staff-table').count() === 0, `Untrusted queue rows withheld: ${label}`)
  check(await page.locator('.custody-note, .custody-warning').count() === 0, `Unverified custody hints withheld: ${label}`)
  const text = (await page.locator('.staff-workspace [role="alert"], .staff-workspace [role="status"]').allTextContents()).join(' ')
  check(/refresh|unavailable/i.test(text) && /saved|recorded|approved|rejected|cancelled|checked out|returned/i.test(text), `Persistent saved-action/read-failure feedback: ${label}`)
  check(await page.getByRole('heading', { name: 'Nothing in this queue.', exact: true }).count() === 0, `Unavailable is not empty/up-to-date: ${label}`)
  check(await page.getByRole('button', { name: 'Refresh desk', exact: true }).first().isEnabled(), `Read-only refresh usable: ${label}`)
  const checkout = page.getByRole('button', { name: 'Check out equipment', exact: true })
  check(await checkout.count() === 0 || await checkout.isDisabled(), `No checkout from untrusted custody snapshot: ${label}`)
  await noOverflow(label)
}
const retry = async () => {
  const refresh = page.getByRole('button', { name: 'Refresh desk', exact: true }).first()
  await refresh.focus(); await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.qa28.queue.length === 1)
}
const resolveRead = async message => {
  await page.evaluate(message => window.qa28.queue.shift()({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message } }), message)
  await page.getByRole('alert').filter({ hasText: message }).first().waitFor()
}
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(log)
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Fresh Vite server ready')
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const width of [1440, 390]) for (const scenario of cases) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Almaty' })
    page = await context.newPage(); page.setDefaultTimeout(15000)
    await page.clock.setFixedTime(new Date('2026-10-19T06:00:00Z'))
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('requestfailed', r => failedRequests.push(r.url())); page.on('request', r => { if (/\/api\/|:8000/.test(r.url())) apiRequests.push(r.url()) })
    const label = `${scenario.name}-${width}`, note = `  QA28 ${scenario.name} complete kit and recorded condition.  `
    await page.goto(`${base}/#/signin?returnTo=desk`)
    await page.getByRole('button', { name: 'Fill coordinator credentials' }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.locator('.staff-tabs').waitFor()
    const id = await page.evaluate(async scenario => {
      const { gearShareService: s } = await import('/src/services/index.ts')
      let id = scenario.id
      if (scenario.name === 'checkout') {
        const first = await s.requestBooking({ assetId: 'accessory-03', startDate: '2026-10-19', endDate: '2026-10-19', purpose: 'QA28 same-day checkout' })
        if (!first.ok) throw new Error(JSON.stringify(first)); id = first.data.id
        const approval = await s.approveBooking(id, { expectedVersion: first.data.version }); if (!approval.ok) throw new Error(JSON.stringify(approval))
        const next = await s.requestBooking({ assetId: 'accessory-03', startDate: '2026-10-20', endDate: '2026-10-20', purpose: 'QA28 adjacent physical pickup' })
        if (!next.ok) throw new Error(JSON.stringify(next)); const approvedNext = await s.approveBooking(next.data.id, { expectedVersion: next.data.version }); if (!approvedNext.ok) throw new Error(JSON.stringify(approvedNext))
      }
      const before = await s.getBooking(id); if (!before.ok) throw new Error(JSON.stringify(before))
      window.qa28 = { s, id, before: before.data, originalList: s.listStaffBookings, originalCommand: s[scenario.method], queue: [], readCalls: 0, writeCalls: 0, successfulWrites: 0 }
      return id
    }, scenario)
    await page.getByRole('button', { name: 'Refresh desk', exact: true }).click()
    await page.locator('.staff-tabs').waitFor()
    await page.locator('.staff-tabs').getByRole('button', { name: scenario.view, exact: false }).click()
    await page.locator(`[data-booking-id="${id}"]`).getByRole('button').click()
    await page.getByRole('heading', { name: 'Manage reservation', exact: true }).waitFor()
    await page.getByRole('button', { name: scenario.action, exact: true }).click()
    if (scenario.label) await page.getByLabel(scenario.label, { exact: true }).fill(note)
    await page.evaluate(scenario => {
      const c = window.qa28
      c.s[scenario.method] = async (...args) => {
        c.writeCalls++
        if (c.writeCalls === 1) return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled mutation unavailable' } }
        const result = await c.originalCommand(...args)
        if (result.ok) { c.successfulWrites++; c.committed = result.data }
        return result
      }
      c.s.listStaffBookings = () => { c.readCalls++; return new Promise(resolve => c.queue.push(resolve)) }
    }, scenario)
    const confirm = page.getByRole('button', { name: `Confirm ${scenario.confirm}`, exact: true })
    await confirm.click(); await page.getByRole('alert').filter({ hasText: 'Controlled mutation unavailable' }).waitFor()
    check(await page.evaluate(async () => JSON.stringify((await window.qa28.s.getBooking(window.qa28.id)).data) === JSON.stringify(window.qa28.before)), `Actual command failure unchanged: ${label}`)
    check(await page.locator('.staff-workspace .success-notice').count() === 0, `No false command success: ${label}`)
    if (scenario.label) check(await page.getByLabel(scenario.label, { exact: true }).inputValue() === note, `Failed-command entered note retained: ${label}`)
    check(await confirm.isEnabled(), `Failed-command confirmation enabled: ${label}`)
    await confirm.focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => window.qa28.queue.length === 1)
    check(await page.evaluate(() => window.qa28.writeCalls === 2 && window.qa28.successfulWrites === 1), `One committed command after explicit retry: ${label}`)
    check(await page.evaluate(({ state, note, needsNote }) => { const c = window.qa28, b = c.committed; return b.state === state && b.events.length === c.before.events.length + 1 && (!needsNote || b.events.at(-1).note === note.trim()) }, { state: scenario.state, note, needsNote: Boolean(scenario.label) }), `Confirmed state and one original trimmed-note event: ${label}`)
    const pendingText = (await page.locator('.staff-workspace [role="status"]').allTextContents()).join(' ')
    check(/saving|loading|refresh|updat/i.test(pendingText), `Follow-up read pending feedback: ${label}`)
    check(await page.locator('.staff-detail button').evaluateAll(buttons => buttons.filter(b => /Confirm|Check out equipment|Approve request|Reject request|Cancel reservation|Record return/.test(b.textContent)).every(b => b.disabled)), `No duplicate confirmation while read pending: ${label}`)
    await resolveRead('Controlled desk refresh unavailable')
    await unavailable(`${label}-detail-failed`)
    const back = page.getByRole('button', { name: '← Back to queues', exact: true })
    check(await back.isEnabled(), `Back enabled after read failure: ${label}`)
    await back.focus(); await page.keyboard.press('Enter'); await back.waitFor({ state: 'hidden' })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await unavailable(`${label}-back-failed`)
    check(await page.evaluate(() => { const e = document.activeElement; return e !== document.body && document.contains(e) && e.textContent.includes('Refresh') }), `Back focuses surviving meaningful refresh control: ${label}`)
    await page.screenshot({ path: `${output}/${label}-unavailable.png`, fullPage: true })
    await retry()
    const beforeRapid = await page.evaluate(() => ({ reads: window.qa28.readCalls, writes: window.qa28.writeCalls }))
    await page.keyboard.press('Space')
    await page.evaluate(() => { for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === 'Refresh desk') { b.click(); b.click() } })
    check(await page.evaluate(before => window.qa28.readCalls === before.reads && window.qa28.writeCalls === before.writes && window.qa28.queue.length === 1, beforeRapid), `Rapid held retry is read-only and single: ${label}`)
    check(await page.locator('.desk-counts, .staff-tabs, .staff-table').count() === 0, `Held retry withholds untrusted snapshot: ${label}`)
    await resolveRead('Controlled repeated refresh unavailable'); await unavailable(`${label}-retry-failed`)
    await retry()
    await page.evaluate(async () => { const c = window.qa28; c.expected = (await c.originalList()).data; c.queue.shift()({ ok: true, data: c.expected }) })
    await page.locator('.staff-tabs').waitFor()
    const expected = await page.evaluate(() => window.qa28.expected)
    check(JSON.stringify(await page.locator('.desk-counts dd').allTextContents()) === JSON.stringify([expected.counts.pending, expected.counts.dueToday, expected.counts.overdue].map(String)), `Recovered summary matches full service snapshot: ${label}`)
    for (const [view, state] of [['Pending requests', 'pending'], ['Pickups', 'approved'], ['Active loans', 'checked_out'], ['History', 'history']]) {
      await page.locator('.staff-tabs').getByRole('button', { name: view, exact: false }).click()
      const records = expected.bookings.filter(b => state === 'history' ? ['rejected', 'cancelled', 'returned'].includes(b.state) : b.state === state)
      check(JSON.stringify((await page.locator('.staff-table tbody tr').evaluateAll(rows => rows.map(r => r.dataset.bookingId))).sort()) === JSON.stringify(records.map(b => b.id).sort()), `Recovered ${view} rows coherent: ${label}`)
      for (const b of records) {
        const row = page.locator(`[data-booking-id="${b.id}"]`)
        if (state === 'approved') check(await row.locator('.custody-warning').count() === Number(b.currentlyOnLoan), `Recovered cross-booking custody ${b.id}: ${label}`)
        if (state === 'checked_out') check((await row.locator('.status-pill').innerText()).includes('Overdue') === b.overdue, `Recovered derived overdue ${b.id}: ${label}`)
      }
      await noOverflow(`${label}-${view}`)
    }
    check(await page.evaluate(async () => { const c = window.qa28; return c.writeCalls === 2 && c.successfulWrites === 1 && JSON.stringify((await c.s.getBooking(c.id)).data) === JSON.stringify(c.committed) }), `Read retries preserve committed booking/events exactly: ${label}`)
    observations.push({ label, committed: await page.evaluate(() => window.qa28.committed), expectedCounts: expected.counts })
    await context.close()
    console.log(`Completed ${label}`)
  }
  check(errors.length === 0, 'No console/page errors'); check(failedRequests.length === 0, 'No failed network requests'); check(apiRequests.length === 0, 'No backend/API calls')
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(), commit, 'Commit unchanged throughout QA')
  const result = { commit, baseline, browser: browser.version(), date: new Date().toISOString(), checks, failures, observations, errors, failedRequests, apiRequests }
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ commit, baseline, checks: checks.length, passed: checks.filter(c => c.passed).length, failed: failures.length, failureKinds: [...new Set(failures.map(f => f.split(':')[0]))], output }, null, 2))
  if (!baseline) assert.equal(failures.length, 0, failures.join('\n'))
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
  await writeFile(`${output}/failure.json`, JSON.stringify({ commit, baseline, error: String(error), stack: error.stack, checks, failures, errors }, null, 2))
  throw error
} finally { await browser?.close(); server.kill('SIGTERM') }

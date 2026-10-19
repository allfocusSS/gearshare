// Independent QA #4: remaining history/detail and async reservations screen criteria.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const port = process.env.GEARSHARE_QA4_PORT ?? '5211'
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd, stdio: 'ignore' })
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data }
const errors = [], passed = []
const record = message => { passed.push(message); console.log(`PASS ${message}`) }
let browser
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('QA Vite exited before readiness')
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready)
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-10-19T06:00:00Z'))
  await page.goto(`${base}/#/signin?returnTo=explore`)
  await page.getByRole('button', { name: 'Fill student credentials' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor()
  await page.evaluate(async () => {
    const { gearShareService: service } = await import('/src/services/index.ts')
    window.qa4 = { service, list: service.listBookings, detail: service.getBooking, cancel: service.cancelBooking, queue: [] }
    service.listBookings = () => new Promise(resolve => window.qa4.queue.push(resolve))
    location.hash = '/reservations'
  })
  // The real dev app mounts under StrictMode, so both initial read effects run.
  await page.waitForFunction(() => window.qa4.queue.length === 2)
  await page.getByText('Loading reservations…', { exact: true }).waitFor()
  await page.evaluate(() => window.qa4.queue.splice(0).forEach(resolve => resolve({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'QA list temporarily unavailable' } })))
  await page.getByText('QA list temporarily unavailable', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Retry reservations', exact: true }).click()
  await page.waitForFunction(() => window.qa4.queue.length === 1)
  await page.evaluate(async () => { window.qa4.queue.shift()(await window.qa4.list()); window.qa4.service.listBookings = window.qa4.list })
  await page.waitForFunction(() => document.querySelectorAll('.reservation-row').length === 3)
  const seeded = ok(await page.evaluate(() => window.qa4.list()))
  assert.equal(seeded.length, 6)
  record('Reservations loading, list error and explicit retry recover the three active rows')

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const tab of ['Upcoming', 'History']) {
      await page.getByRole('button', { name: tab, exact: true }).click()
      const expected = seeded.filter(b => ['rejected', 'cancelled', 'returned'].includes(b.state) === (tab === 'History'))
      assert.equal(await page.locator('.reservation-row').count(), expected.length)
      for (const booking of expected) {
        const row = page.locator('.reservation-row').filter({ hasText: booking.assetName })
        assert.ok((await row.innerText()).includes(booking.state.replaceAll('_', ' ')))
        await row.getByRole('button', { name: `View details for ${booking.assetName}`, exact: true }).click()
        await page.waitForFunction(b => {
          const detail = document.querySelector('.reservation-detail')
          return detail?.querySelector('h3')?.textContent === b.assetName && detail.querySelector('strong')?.textContent === b.state.replaceAll('_', ' ')
        }, booking)
        const detail = page.locator('.reservation-detail')
        assert.ok((await detail.innerText()).includes(`${booking.startDate} – ${booking.endDate} · inclusive · Asia/Almaty`))
        assert.ok((await detail.innerText()).includes(`Purpose: ${booking.purpose}`))
        assert.equal(await detail.getByRole('button', { name: 'Cancel reservation', exact: true }).count(), ['pending', 'approved'].includes(booking.state) ? 1 : 0)
        const events = await detail.locator('.event-timeline li').evaluateAll(items => items.map(item => ({
          action: item.querySelector('strong').textContent,
          transition: item.querySelector('p').textContent,
          timestamp: item.querySelector('time').dateTime,
          text: item.textContent,
        })))
        assert.equal(events.length, booking.events.length)
        events.forEach((event, index) => {
          const expected = booking.events[index]
          assert.equal(event.action, expected.action)
          assert.equal(event.transition, `${expected.priorState ?? 'new'} → ${expected.newState}`)
          assert.equal(event.timestamp, expected.timestamp)
          assert.ok(event.text.includes(`${expected.timestamp} (UTC)`))
          assert.ok(event.text.includes(expected.note))
        })
        assert.ok(await detail.isVisible())
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      }
      if (tab === 'Upcoming') assert.equal(await page.getByText('checked out · Overdue', { exact: true }).count(), 1)
    }
    record(`All six states, active/overdue and terminal history remain reachable with exact ordered readable events, dates, notes and permitted actions at ${width}px`)
  }

  await page.getByRole('button', { name: 'Upcoming', exact: true }).click()
  await page.evaluate(() => { window.qa4.service.getBooking = () => new Promise(resolve => window.qa4.queue.push(resolve)) })
  const pending = seeded.find(b => b.state === 'pending')
  await page.getByRole('button', { name: `View details for ${pending.assetName}`, exact: true }).click()
  await page.waitForFunction(() => window.qa4.queue.length === 1)
  assert.equal(await page.getByRole('button', { name: 'History', exact: true }).isDisabled(), true)
  await page.evaluate(() => window.qa4.queue.shift()({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'QA detail temporarily unavailable' } }))
  await page.getByText('QA detail temporarily unavailable', { exact: false }).waitFor()
  assert.equal(await page.locator('.reservation-detail').count(), 0)
  await page.evaluate(() => { window.qa4.service.getBooking = window.qa4.detail })
  await page.getByRole('button', { name: 'Retry reservations', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.reservation-row').length === 3 && !document.querySelector('.service-notice[role=alert]'))
  await page.getByRole('button', { name: `View details for ${pending.assetName}`, exact: true }).click()
  await page.getByRole('button', { name: 'Cancel reservation', exact: true }).waitFor()
  const before = await page.evaluate(async id => ({ booking: await window.qa4.detail(id), availability: await window.qa4.service.getAssetAvailability('camera-01') }), pending.id)
  await page.evaluate(() => { window.qa4.service.cancelBooking = () => new Promise(resolve => window.qa4.queue.push(resolve)) })
  await page.getByRole('button', { name: 'Cancel reservation', exact: true }).click()
  await page.waitForFunction(() => window.qa4.queue.length === 1)
  assert.equal(await page.getByRole('button', { name: 'Cancelling…', exact: true }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'History', exact: true }).isDisabled(), true)
  await page.evaluate(() => window.qa4.queue.shift()({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'QA cancel temporarily unavailable' } }))
  await page.getByText('QA cancel temporarily unavailable', { exact: false }).waitFor()
  assert.equal(await page.getByText('Reservation cancelled. The dates have been released.', { exact: true }).count(), 0)
  assert.deepEqual(await page.evaluate(async id => ({ booking: await window.qa4.detail(id), availability: await window.qa4.service.getAssetAvailability('camera-01') }), pending.id), before)
  await page.evaluate(() => { window.qa4.service.cancelBooking = window.qa4.cancel })
  await page.getByRole('button', { name: 'Cancel reservation', exact: true }).click()
  await page.getByText('Reservation cancelled. The dates have been released.', { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('.event-timeline li').length === 2)
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: `View details for ${pending.assetName}`, exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.reservation-detail strong')?.textContent === 'cancelled')
  assert.equal(await page.getByRole('button', { name: 'Cancel reservation', exact: true }).count(), 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  record('Detail delay/error/retry and cancellation pending/failure/recovery retain record+allocation, disable actions, show no false success and preserve readable cancellation history')
  assert.deepEqual(errors, [])
  console.log(`PASS independent #4 focused browser: ${passed.length} groups, no console/page errors`)
  await context.close()
} finally { await browser?.close(); server.kill() }

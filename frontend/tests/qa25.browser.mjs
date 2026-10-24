// Independent QA regressions for #25 R06/R08 gaps; no production test controls.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const port = process.env.GEARSHARE_QA25_PORT ?? '5210'
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd, stdio: 'pipe', env: { ...process.env, VITE_GEARSHARE_SERVICE: 'mock' } })
let serverOutput = '', browser
server.stdout.on('data', text => { serverOutput += text })
server.stderr.on('data', text => { serverOutput += text })
const errors = []
const passed = []
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data }
const fields = async page => ({
  startDate: await page.getByLabel('Start date', { exact: true }).inputValue(),
  endDate: await page.getByLabel('End date', { exact: true }).inputValue(),
  purpose: await page.getByLabel('Project purpose').inputValue(),
})
const fill = async (page, startDate, endDate = startDate, purpose = 'Independent QA refresh regression') => {
  await page.getByLabel('Start date', { exact: true }).fill(startDate)
  await page.getByLabel('End date', { exact: true }).fill(endDate)
  await page.getByLabel('Project purpose').fill(purpose)
}
const submit = page => page.getByRole('button', { name: 'Request equipment', exact: true }).click()
const summary = (page, text) => page.getByText(text, { exact: true }).waitFor()
const noSuccess = async page => assert.equal(await page.getByRole('link', { name: 'View my reservations' }).count(), 0)
const assertDay = (page, date, state, selected = false) => page.getByRole('button', { name: `${date}: ${state}${selected ? ', selected' : ''}`, exact: true }).waitFor()
const bookings = async page => ok(await page.evaluate(() => window.qa25.service.listBookings()))
const availability = async (page, asset = 'accessory-03') => ok(await page.evaluate(id => window.qa25.service.getAssetAvailability(id), asset))
const waitQueue = (page, count) => page.waitForFunction(n => window.qa25.availability.length === n, count)
// Drain React commits after resolving the deliberately old response; no timed sleeps.
const deliver = async (page, index = 0, fail = false) => page.evaluate(async ({ index, fail }) => {
  const entry = window.qa25.availability.splice(index, 1)[0]
  if (!entry) throw new Error('Expected deferred availability response')
  fail ? entry.fail() : entry.resolve()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}, { index, fail })
const fresh = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  await page.goto(`${base}/tests/fixtures/qa25.html`)
  await page.getByRole('heading', { name: 'Check availability', exact: true }).waitFor()
  return { context, page }
}
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${serverOutput}`)
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, `Vite readiness failed: ${serverOutput}`)
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] })

  {
    const { context, page } = await fresh()
    const before = await bookings(page)
    await fill(page, '2026-10-20', '2026-10-22', 'Keep the conflict project purpose')
    const entered = await fields(page)
    await page.evaluate(() => { window.qa25.holdAvailability = true; window.qa25.demo.simulateConflict() })
    await submit(page); await waitQueue(page, 1)
    await page.getByText('These dates were reserved.', { exact: false }).waitFor()
    await summary(page, 'Updating availability…'); await noSuccess(page)
    assert.equal(await page.getByText('Available for selected dates', { exact: true }).count(), 0)
    assert.equal(await page.locator('.availability-calendar').count(), 0)
    await deliver(page, 0, true)
    await summary(page, 'Could not refresh availability.'); await noSuccess(page)
    assert.deepEqual(await fields(page), entered)
    assert.deepEqual(await bookings(page), before)
    await page.getByRole('button', { name: 'Retry availability', exact: true }).click()
    await waitQueue(page, 1); await deliver(page)
    await summary(page, 'Unavailable for selected dates')
    await assertDay(page, '2026-10-20', 'Occupied, unavailable', true)
    await assertDay(page, '2026-10-21', 'Available', true)
    await assertDay(page, '2026-10-22', 'Available', true)
    await page.getByText('These dates were reserved.', { exact: false }).waitFor()
    assert.deepEqual(await fields(page), entered)
    assert.deepEqual(await bookings(page), before)
    assert.equal(await page.evaluate(() => window.qa25.calls), 1)
    assert.deepEqual((await availability(page)).days.filter(day => day.state === 'occupied').map(day => day.date), ['2026-10-20'])
    await noSuccess(page); await context.close()
    passed.push('R06: conflict refresh delay/failure/retry retains input+conflict, no success/write, one submission; only simulated competing day occupied')
  }

  {
    const { context, page } = await fresh()
    const before = await bookings(page)
    await fill(page, '2026-10-19')
    const firstEntered = await fields(page)
    await page.evaluate(() => { window.qa25.holdAvailability = true })
    await submit(page); await waitQueue(page, 1)
    await deliver(page, 0, true)
    await summary(page, 'Could not refresh availability.')
    await page.getByRole('link', { name: 'View my reservations' }).waitFor()
    assert.deepEqual(await fields(page), firstEntered)
    const firstAdded = (await bookings(page)).filter(b => !before.some(old => old.id === b.id))
    assert.equal(firstAdded.length, 1)
    assert.deepEqual({ assetId: firstAdded[0].assetId, startDate: firstAdded[0].startDate, endDate: firstAdded[0].endDate, purpose: firstAdded[0].purpose, state: firstAdded[0].state }, { assetId: 'accessory-03', ...firstEntered, state: 'pending' })
    assert.equal(firstAdded[0].events.length, 1)
    assert.deepEqual([firstAdded[0].events[0].action, firstAdded[0].events[0].priorState, firstAdded[0].events[0].newState], ['create', null, 'pending'])
    await page.getByRole('button', { name: 'Retry availability', exact: true }).click()
    await waitQueue(page, 1) // Older retry snapshot: 19 occupied; 20 available.
    await fill(page, '2026-10-20', '2026-10-20', 'A second distinct legitimate request')
    await submit(page); await waitQueue(page, 2) // New snapshot: 19 and 20 occupied.
    assert.deepEqual(await page.evaluate(() => window.qa25.availability.map(entry => entry.snapshot.data.days.find(day => day.date === '2026-10-20').state)), ['available', 'occupied'])
    await deliver(page, 1)
    await summary(page, 'Unavailable for selected dates')
    await assertDay(page, '2026-10-20', 'Occupied, unavailable', true)
    await fill(page, '2026-10-21', '2026-10-22', 'Current range and purpose must survive')
    const current = await fields(page)
    await summary(page, 'Available for selected dates')
    await deliver(page) // Older response must not erase the newer occupied day.
    assert.deepEqual(await fields(page), current)
    await summary(page, 'Available for selected dates')
    await page.getByText('2 days inclusive', { exact: false }).waitFor()
    await assertDay(page, '2026-10-19', 'Occupied, unavailable')
    await assertDay(page, '2026-10-20', 'Occupied, unavailable')
    await assertDay(page, '2026-10-21', 'Available', true)
    await assertDay(page, '2026-10-22', 'Available', true)
    const added = (await bookings(page)).filter(b => !before.some(old => old.id === b.id))
    assert.equal(added.length, 2)
    assert.ok(added.every(b => b.state === 'pending' && b.events.length === 1 && b.events[0].action === 'create'))
    assert.equal(await page.evaluate(() => window.qa25.calls), 2)
    await context.close()
    passed.push('R08: same asset changed range; distinct snapshots newer-first/older-last retain current dates+purpose+summary and newest calendar')
  }

  for (const conflict of [false, true]) {
    const { context, page } = await fresh()
    const before = await bookings(page)
    await fill(page, '2026-10-19')
    await page.evaluate(conflict => { window.qa25.holdRequest = true; if (conflict) window.qa25.demo.simulateConflict() }, conflict)
    await submit(page)
    await page.waitForFunction(() => window.qa25.requests.length === 1)
    assert.equal(await page.getByLabel('Project purpose').isDisabled(), true)
    await page.evaluate(() => window.qa25.render('accessory-01'))
    await page.getByRole('heading', { name: 'Travel Tripod', exact: true }).waitFor()
    await fill(page, '2026-10-21', '2026-10-22', 'Current asset B purpose')
    const current = await fields(page)
    await page.evaluate(async () => {
      window.qa25.requests.shift().resolve()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    await page.getByRole('heading', { name: 'Travel Tripod', exact: true }).waitFor()
    await summary(page, 'Available for selected dates')
    await assertDay(page, '2026-10-19', 'Available')
    await assertDay(page, '2026-10-21', 'Available', true)
    assert.deepEqual(await fields(page), current)
    await noSuccess(page)
    assert.equal(await page.getByText('These dates were reserved.', { exact: false }).count(), 0)
    assert.equal(await page.evaluate(() => window.qa25.availability.length), 0)
    assert.equal(await page.evaluate(() => window.qa25.calls), 1)
    const after = await bookings(page)
    if (conflict) assert.deepEqual(after, before)
    else {
      const added = after.filter(b => !before.some(old => old.id === b.id))
      assert.equal(added.length, 1)
      assert.equal(added[0].assetId, 'accessory-03')
      assert.equal(added[0].state, 'pending')
      assert.equal(added[0].events.length, 1)
    }
    assert.deepEqual((await availability(page)).days.filter(day => day.state === 'occupied').map(day => day.date), ['2026-10-19'])
    assert.ok((await availability(page, 'accessory-01')).days.every(day => day.state === 'available'))
    await context.close()
    passed.push(`R08: pending asset A ${conflict ? 'conflict' : 'success'} delivered after navigation preserves asset B identity/range/purpose/calendar; no A feedback/refresh leaks`)
  }
  assert.deepEqual(errors, [])
  for (const result of passed) console.log(`PASS ${result}`)
  console.log(`PASS independent #25 focused browser: ${passed.length} controlled groups, no console/page errors`)
} finally { await browser?.close(); server.kill() }

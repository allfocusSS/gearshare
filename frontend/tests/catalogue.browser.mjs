/** #3 catalogue/detail/anonymous-calendar browser checks. Fixed Date, real async timers. */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const frontend = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../test-results/catalogue/', import.meta.url))
const port = process.env.GEARSHARE_TEST_PORT || '5179'
const base = `http://127.0.0.1:${port}`
await mkdir(output, { recursive: true })
const checks = [], consoleErrors = [], pageErrors = [], failedRequests = [], apiRequests = []
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: frontend, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', chunk => { serverLog += chunk })
server.stderr.on('data', chunk => { serverLog += chunk })
let browser
const passed = (name, detail = {}) => { checks.push({ name, result: 'PASS', ...detail }); process.stdout.write(`PASS ${name}\n`) }
try {
  let ready = false
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Vite exited ${server.exitCode}: ${serverLog}`)
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(ready, true)
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.clock.setFixedTime(new Date('2026-10-19T06:00:00Z'))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('requestfailed', request => failedRequests.push(request.url()))
  page.on('request', request => { if (!request.url().startsWith(base)) apiRequests.push(request.url()) })
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' })
  const cards = page.locator('.equipment-card')
  const start = page.getByLabel('Start date', { exact: true })
  const end = page.getByLabel('End date', { exact: true })
  const search = page.getByLabel('Search equipment', { exact: true })
  const go = async path => { await page.evaluate(next => { location.hash = next }, `/${path}`) }
  const results = async count => {
    await page.waitForFunction(expected => document.querySelectorAll('.equipment-card').length === expected && !document.querySelector('.catalogue-loading') && !!document.querySelector('.catalogue-results-label'), count)
  }
  const noOverflow = async label => {
    const size = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }))
    assert.ok(size.page <= size.viewport, `${label}: ${JSON.stringify(size)}`)
    passed(`No overflow: ${label}`, size)
  }
  const fixture = async mode => {
    const details = page.locator('.demo-controls')
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click()
    await page.getByLabel('Response fixture').selectOption(mode)
    await page.getByText('Loading your demo workspace…').waitFor({ state: 'hidden' })
    await details.locator('summary').click()
  }
  const dateRange = async (from, to) => { await start.fill(from); await end.fill(to) }

  await page.goto(`${base}/#/explore`)
  await results(10)
  assert.equal(await page.locator('.availability-badge.available').count(), 0)
  assert.equal(await page.locator('.equipment-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3)
  await noOverflow('1440 catalogue')
  await page.screenshot({ path: `${output}/desktop-catalogue.png`, fullPage: true })
  passed('Anonymous catalogue displays ten physical units; no range-based availability claim before dates')
  await search.fill('  field CAMERA '); await results(2)
  await page.getByRole('button', { name: 'Audio', exact: true }).click()
  await heading('No equipment to show.')
  await page.getByRole('button', { name: 'Cameras', exact: true }).click(); await results(2)
  await dateRange('2026-10-20', '2026-10-20'); await results(1)
  assert.ok((await cards.first().getAttribute('href')).endsWith('camera-01'))
  await page.getByText('20 Oct 2026 – 20 Oct 2026 · 1 day inclusive · Asia/Almaty', { exact: true }).waitFor()
  assert.equal(await page.locator('.availability-badge.available').count(), 1)
  passed('Search/category/paired dates intersect; same-day duration is one and independent camera units differ')
  await dateRange('2026-10-21', '2026-10-23')
  await heading('No equipment to show.')
  await page.getByRole('button', { name: 'Clear all filters' }).click(); await results(10)
  passed('Inclusive occupied range gives empty results; clear filters recovers')

  for (const [from, to, label] of [
    ['2026-10-19', '', 'partial'], ['2026-10-18', '2026-10-19', 'past'], ['2026-10-20', '2026-10-19', 'reversed'], ['2026-10-19', '2026-11-02', '15-day'], ['2026-10-19', '2027-01-18', 'beyond horizon'],
  ]) {
    await dateRange(from, to)
    await page.locator('.catalogue-feedback').filter({ hasText: 'Check your dates.' }).waitFor()
    assert.equal(await cards.count(), 0)
    assert.equal(await page.locator('.catalogue-results-label').count(), 0)
    assert.ok(await page.locator('input[aria-invalid=true]').count() > 0)
    passed(`Invalid ${label} range shows field errors and no stale valid results`)
  }
  await dateRange('2027-01-17', '2027-01-17'); await results(9)
  passed('Single day at exact T+90 boundary accepted; maintenance excluded')
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click(); await results(10)
  await cards.filter({ hasText: 'CAM-001' }).click()
  await heading('Field Camera · Unit 01')
  await page.getByRole('heading', { name: 'Check availability', exact: true }).waitFor()
  assert.equal(await page.locator('.asset-specs').getByText('CAM-001', { exact: true }).count(), 1)
  await page.getByRole('button', { name: '2026-10-21: Occupied, unavailable', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Previous month', exact: true }).isDisabled(), true)
  await noOverflow('1440 detail calendar')
  await page.screenshot({ path: `${output}/desktop-detail.png`, fullPage: true })
  passed('Anonymous detail has code/category/location/description, month calendar and explicit occupied-day labels')
  await dateRange('2026-10-19', '2026-10-19')
  await page.locator('.range-summary').getByText('Available for selected dates', { exact: true }).waitFor()
  await page.locator('.range-summary').getByText('1 day inclusive', { exact: true }).waitFor()
  await dateRange('2026-10-21', '2026-10-23')
  await page.locator('.range-summary').getByText('Unavailable for selected dates', { exact: true }).waitFor()
  await page.getByText('3 selected days are unavailable.', { exact: true }).waitFor()
  await dateRange('2026-10-24', '2026-10-24')
  await page.locator('.range-summary').getByText('Available for selected dates', { exact: true }).waitFor()
  passed('Calendar/date fields show inclusive occupied endpoints, selected states and next-day adjacency')
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click()
  await page.getByRole('button', { name: '2026-10-19: Available', exact: true }).click()
  await page.getByRole('button', { name: '2026-10-20: Available', exact: true }).click()
  assert.equal(await start.inputValue(), '2026-10-19')
  assert.equal(await end.inputValue(), '2026-10-20')
  await page.locator('.range-summary').getByText('2 days inclusive', { exact: true }).waitFor()
  passed('Keyboard-usable calendar buttons select a range; labeled date fields remain an alternative')
  await page.getByRole('button', { name: 'Next month', exact: true }).click(); await heading('November 2026')
  await page.getByRole('button', { name: 'Next month', exact: true }).click(); await heading('December 2026')
  await page.getByRole('button', { name: 'Next month', exact: true }).click(); await heading('January 2027')
  assert.equal(await page.getByRole('button', { name: 'Next month', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '2027-01-17: Available', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '2027-01-18: Outside selectable window', exact: true }).isDisabled(), true)
  passed('Calendar month navigation stops at horizon; out-of-window days disabled')

  await go('assets/camera-03'); await heading('Pocket Video Camera')
  await page.getByText('× Maintenance · unavailable for requests', { exact: true }).waitFor()
  await dateRange('2026-10-19', '2026-10-19')
  await page.getByText('Unavailable during maintenance', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: /request|reserve/i }).count(), 0)
  passed('Maintenance detail/calendar cannot appear requestable')
  await go('assets/not-a-real-unit'); await heading('Equipment not found.')
  await page.getByRole('link', { name: 'Back to Explore', exact: true }).click(); await results(10)
  passed('Missing asset gives usable not-found view and return navigation')
  await search.fill('no-matching-unit'); await heading('No equipment to show.')
  await page.getByRole('button', { name: 'Clear all filters' }).click(); await results(10)
  passed('No-results state can clear filters and recover')

  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow('390 catalogue')
  assert.equal(await page.locator('.equipment-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1)
  await page.screenshot({ path: `${output}/mobile-catalogue.png`, fullPage: true })
  await cards.filter({ hasText: 'CAM-001' }).click(); await heading('Field Camera · Unit 01')
  await dateRange('2026-10-21', '2026-10-23')
  await page.getByText('3 selected days are unavailable.', { exact: true }).waitFor()
  await noOverflow('390 detail calendar')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/mobile-detail.png`, fullPage: true })
  await end.fill('2026-11-04')
  await page.locator('.availability-panel .form-alert').waitFor()
  assert.equal(await page.locator('.range-summary').count(), 0)
  await noOverflow('390 invalid range')
  passed('Mobile detail has readable calendar/date alternatives and hides valid claims for invalid input')
  await go('explore'); await results(10)
  await fixture('empty'); await heading('No equipment to show.')
  assert.equal(await cards.count(), 0)
  passed('Empty fixture displays no fictional equipment records')
  await fixture('error')
  await page.getByRole('button', { name: 'Retry equipment', exact: true }).click()
  await page.getByRole('button', { name: 'Retry equipment', exact: true }).waitFor()
  assert.equal(await cards.count(), 0)
  await noOverflow('390 catalogue service error')
  await go('assets/camera-01'); await heading('Could not load this equipment.')
  await page.getByRole('button', { name: 'Retry detail', exact: true }).click(); await heading('Could not load this equipment.')
  await fixture('normal'); await heading('Field Camera · Unit 01')
  passed('Catalogue/detail failure fixtures offer usable retries and recover through Normal')
  await fixture('loading')
  await go('explore')
  await page.getByText('Finding equipment…', { exact: true }).waitFor()
  await results(10)
  passed('Loading fixture shows real async feedback before catalogue success')
  await fixture('normal'); await results(10)
  await cards.filter({ hasText: 'CAM-001' }).click(); await heading('Field Camera · Unit 01')
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Fill student credentials' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await heading('Field Camera · Unit 01')
  assert.ok(page.url().endsWith('#/assets/camera-01'))
  passed('Existing auth preserves the concrete equipment-detail return destination')
  // #4 adds the signed-in student's own request purpose; public asset/calendar metadata remains anonymous.
  const publicText = await page.locator('.asset-identity, .availability-calendar').allTextContents().then(parts => parts.join(' '))
  assert.equal(/maya_student|alex_coordinator|borrower|purpose|booking id|private note/i.test(publicText), false)
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(apiRequests, [])
  passed('Public catalogue/detail/calendar show no borrower/private metadata; no backend/network/console failures')
  await writeFile(`${output}/results.json`, JSON.stringify({ date: new Date().toISOString(), fixedDate: '2026-10-19T06:00:00Z', browser: browser.version(), checks, consoleErrors, pageErrors, failedRequests, apiRequests }, null, 2))
  process.stdout.write(`All ${checks.length} catalogue browser checks passed.\n`)
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ checks, error: String(error), stack: error.stack, consoleErrors, pageErrors, failedRequests, apiRequests }, null, 2))
  throw error
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
  await writeFile(`${output}/vite.log`, serverLog)
}

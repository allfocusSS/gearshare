// Independent QA regression for #27. BASELINE=1 records the original failure.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const port = process.env.GEARSHARE_LABELS_QA_PORT ?? '5191'
const base = `http://127.0.0.1:${port}`
const baseline = process.env.BASELINE === '1'
const output = `${cwd}/test-results/qa27-${baseline ? 'before' : 'after'}`
await mkdir(output, { recursive: true })
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
const sourceDiff = execFileSync('git', ['diff', '--', 'src'], { cwd, encoding: 'utf8' }).trim()
assert.equal(sourceDiff, '', 'QA must run against committed implementation')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_GEARSHARE_SERVICE: 'mock' } })
let log = '', browser, page
server.stdout.on('data', d => { log += d })
server.stderr.on('data', d => { log += d })
const checks = [], observations = [], failures = [], errors = [], failedRequests = []
const check = (condition, message) => {
  checks.push({ message, passed: Boolean(condition) })
  if (!condition) failures.push(message)
}
const go = async route => { await page.evaluate(r => { location.hash = r }, `/${route}`) }
const noOverflow = async label => {
  const sizes = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  check(sizes.document <= sizes.width && sizes.body <= sizes.width, `No horizontal overflow: ${label}`)
}
const inspect = async (label, tableName) => {
  const table = tableName ? page.getByRole('table', { name: tableName, exact: true }) : page.locator('.reservation-list')
  await table.waitFor()
  const nodes = await table.locator('.sr-only').evaluateAll(elements => elements.map(el => {
    const s = getComputedStyle(el), rect = el.getBoundingClientRect()
    return { text: el.textContent, position: s.position, display: s.display, visibility: s.visibility, clip: s.clip, clipPath: s.clipPath, overflow: s.overflow, width: rect.width, height: rect.height, ariaHidden: Boolean(el.closest('[aria-hidden="true"]')), tabIndex: el.tabIndex }
  }))
  check(nodes.length > 1, `Naming content retained: ${label}`)
  for (const node of nodes) {
    check(node.display !== 'none' && node.visibility === 'visible' && !node.ariaHidden, `Naming node exposed: ${label} / ${node.text}`)
    check(node.position === 'absolute' && node.width <= 1 && node.height <= 1 && node.overflow === 'hidden' && (node.clip !== 'auto' || node.clipPath !== 'none'), `Naming node clipped outside normal layout: ${label} / ${node.text}`)
    check(node.tabIndex === -1, `Naming node has no focus stop: ${label} / ${node.text}`)
  }
  const snapshot = await table.ariaSnapshot()
  observations.push({ label, nodes, snapshot })
  await noOverflow(label)
  await page.screenshot({ path: `${output}/${label}.png`, fullPage: true })
}
const keyboard = async (button, previous, label, editor = false) => {
  await previous.focus()
  await page.keyboard.press('Tab')
  check(await button.evaluate(el => document.activeElement === el), `Tab reaches visible row action: ${label}`)
  const ring = await button.evaluate(el => ({ visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }))
  check(ring.visible && ring.outline !== 'none' && ring.width >= 2, `Visible keyboard focus: ${label}`)
  await page.screenshot({ path: `${output}/focus-${label.replaceAll(' ', '-').toLowerCase()}.png`, fullPage: true })
  await page.keyboard.press('Shift+Tab')
  check(await previous.evaluate(el => document.activeElement === el), `Shift+Tab returns without hidden stop: ${label}`)
  await page.keyboard.press('Tab')
  const id = await button.getAttribute('id')
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: editor ? 'Edit equipment details' : 'Manage reservation', exact: true }).waitFor()
  await page.waitForFunction(id => document.activeElement?.id === id, editor ? 'inventory-editor-title' : 'staff-booking-title')
  check(true, `Enter opens correct view and heading gains focus: ${label}`)
  await page.getByRole('button', { name: editor ? 'Discard changes' : '← Back to queues', exact: true }).click()
  await page.waitForFunction(id => document.activeElement?.id === id, id)
  check(true, `Back restores invoking action focus: ${label}`)
  await page.keyboard.press('Space')
  await page.getByRole('heading', { name: editor ? 'Edit equipment details' : 'Manage reservation', exact: true }).waitFor()
  check(true, `Space activates intended action: ${label}`)
  await page.getByRole('button', { name: editor ? 'Discard changes' : '← Back to queues', exact: true }).click()
  await page.waitForFunction(id => document.activeElement?.id === id, id)
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
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Almaty' })
    page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', e => errors.push(String(e)))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('requestfailed', r => failedRequests.push(r.url()))
    await page.clock.setFixedTime(new Date('2026-10-19T06:00:00Z'))
    await page.goto(`${base}/#/signin?returnTo=desk`)
    await page.getByRole('button', { name: 'Fill coordinator credentials', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.locator('.staff-tabs').waitFor()
    for (const [queue, action] of [['Pending requests', 'Review request'], ['Pickups', 'Manage pickup'], ['Active loans', 'Manage loan'], ['History', 'View history']]) {
      await page.locator('.staff-tabs').getByRole('button', { name: queue, exact: false }).click()
      const table = page.getByRole('table', { name: queue, exact: true })
      await table.waitFor()
      for (const row of await table.locator('tbody tr').all()) {
        const asset = await row.locator('td strong').innerText()
        check(await row.getByRole('button', { name: `${action} for ${asset}`, exact: true }).count() === 1, `Asset-specific accessible action: ${width} ${queue} ${asset}`)
      }
      await inspect(`desk-${queue.replaceAll(' ', '-').toLowerCase()}-${width}`, queue)
      await keyboard(table.getByRole('button').first(), page.getByRole('button', { name: 'Refresh desk', exact: true }), `${queue} ${width}`)
    }
    await go('inventory')
    const table = page.getByRole('table', { name: 'Physical equipment inventory', exact: true })
    await table.waitFor()
    for (const row of await table.locator('tbody tr').all()) {
      const code = await row.locator('td small').first().innerText()
      const state = (await row.locator('.status-pill').innerText()).trim().toLowerCase()
      check(await row.getByRole('button', { name: `Edit ${code}`, exact: true }).count() === 1, `Inventory Edit accessible name: ${width} ${code}`)
      check(await row.getByRole('button', { name: `${state === 'active' ? 'Set maintenance' : 'Make active'} for ${code}`, exact: true }).count() === 1, `Inventory state action accessible name: ${width} ${code}`)
    }
    await inspect(`inventory-${width}`, 'Physical equipment inventory')
    await keyboard(table.getByRole('button').first(), page.getByRole('button', { name: 'Refresh inventory', exact: true }), `Inventory Edit ${width}`, true)
    const first = table.getByRole('button').first(), second = table.getByRole('button').nth(1)
    await first.focus(); await page.keyboard.press('Tab')
    check(await second.evaluate(el => el === document.activeElement), `Tab reaches state action without suffix focus stop ${width}`)
    check(await second.evaluate(el => el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) >= 2), `State action visible focus ${width}`)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor({ state: 'hidden' })
    await go('signin?returnTo=reservations')
    await page.getByRole('button', { name: 'Fill student credentials', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.locator('.reservation-list').waitFor()
    for (const view of ['Upcoming', 'History']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      const rows = page.locator('.reservation-row')
      for (const row of await rows.all()) {
        const asset = await row.getByRole('heading').innerText()
        check(await row.getByRole('button', { name: `View details for ${asset}`, exact: true }).count() === 1, `Private reservation asset-specific accessible name: ${view} ${width} ${asset}`)
        check((await row.locator('.availability-badge').innerText()).trim().length > 0, `Private reservation state remains visible: ${view} ${width} ${asset}`)
      }
      await inspect(`my-reservations-${view.toLowerCase()}-${width}`, null)
      const firstAsset = await rows.first().getByRole('heading').innerText()
      for (const key of ['Enter', 'Space']) {
        await page.getByRole('button', { name: view, exact: true }).click()
        await page.locator('.reservation-tabs').getByRole('button', { name: 'History', exact: true }).focus()
        await page.keyboard.press('Tab')
        const firstButton = rows.first().getByRole('button')
        check(await firstButton.evaluate(el => document.activeElement === el && el.matches(':focus-visible')), `Keyboard reaches private details action: ${view} ${width} ${key}`)
        await page.keyboard.press(key)
        await page.locator('.reservation-detail').getByRole('heading', { name: firstAsset, exact: true }).waitFor()
        check(true, `${key} opens correct private booking: ${view} ${width}`)
        await noOverflow(`Private reservation details ${view} ${width} ${key}`)
      }
    }
    await context.close()
  }
  check(errors.length === 0, 'No browser console/page errors')
  check(failedRequests.length === 0, 'No failed browser requests')
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(), commit, 'Candidate did not change during QA')
  assert.equal(execFileSync('git', ['diff', '--', 'src'], { cwd, encoding: 'utf8' }).trim(), '', 'Implementation stayed committed during QA')
  const result = { commit, baseline, date: new Date().toISOString(), browser: browser.version(), node: process.version, checks, failures, observations, errors, failedRequests }
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ commit, baseline, checks: checks.length, passed: checks.filter(c => c.passed).length, failed: failures.length, failureKinds: [...new Set(failures.map(f => f.split(':')[0]))], errors, failedRequests, output }, null, 2))
  if (!baseline) assert.deepEqual(failures, [], 'All independent #27 regressions pass')
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
  await writeFile(`${output}/failure.json`, JSON.stringify({ commit, checks, failures, error: String(error), stack: error.stack }, null, 2))
  throw error
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await writeFile(`${output}/vite.log`, log)
}

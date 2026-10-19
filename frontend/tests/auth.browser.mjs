/** Scoped #2 shell/auth checks and #24 focus regressions; no backend is started. */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../test-results/mock-auth/', import.meta.url))
const port = process.env.GEARSHARE_TEST_PORT || '5178'
const base = `http://127.0.0.1:${port}`
await mkdir(output, { recursive: true })
const checks = [], consoleErrors = [], pageErrors = [], failedRequests = [], apiRequests = []
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: frontend, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', (chunk) => { serverLog += chunk })
server.stderr.on('data', (chunk) => { serverLog += chunk })
let browser
const passed = (name, detail = {}) => { checks.push({ name, result: 'PASS', ...detail }); process.stdout.write(`PASS ${name}\n`) }
try {
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited ${server.exitCode}: ${serverLog}`)
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(ready, true, 'Vite must be ready before checks')
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => failedRequests.push(request.url()))
  page.on('request', (request) => { if (/\/api\//.test(request.url())) apiRequests.push(request.url()) })
  const heading = (name) => page.getByRole('heading', { name, exact: true }).waitFor({ state: 'visible' })
  const username = page.getByLabel('Username', { exact: true })
  const password = page.getByLabel('Password', { exact: true })
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const focused = (locator) => locator.evaluate((element) => element === document.activeElement)
  const signOut = async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.locator('.account-name').waitFor({ state: 'hidden' })
    await heading('Explore')
  }
  const go = async (path) => { await page.evaluate((next) => { window.location.hash = next }, `/${path}`) }
  const auth = async (register = false, returnTo = 'explore') => {
    await go('explore'); await heading('Explore')
    await go(`${register ? 'register' : 'signin'}?returnTo=${returnTo}`)
    await heading(register ? 'Create an account' : 'Sign in')
  }
  const submit = (register = false) => page.getByRole('button', { name: register ? 'Create student account' : 'Sign in', exact: true })
  const noOverflow = async (label) => {
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }))
    assert.ok(sizes.page <= sizes.viewport, `${label}: ${JSON.stringify(sizes)}`)
    passed(`No overflow: ${label}`, sizes)
  }
  const switchFixture = async (value) => {
    const details = page.locator('.demo-controls')
    if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click()
    await page.getByLabel('Response fixture').selectOption(value)
    await page.getByText('Loading your demo workspace…').waitFor({ state: 'hidden' })
    await details.locator('summary').click()
  }
  const validation = async ({ register = false, name, secret, first, both = false }) => {
    await auth(register)
    await username.fill(name); await password.fill(secret)
    await submit(register).click()
    await page.locator('.form-alert').filter({ hasText: 'Check the highlighted fields.' }).waitFor()
    const target = first === 'username' ? username : password
    assert.equal(await target.isEnabled(), true)
    assert.equal(await focused(target), true)
    assert.equal(await target.getAttribute('aria-invalid'), 'true')
    assert.ok((await target.getAttribute('aria-describedby')).includes(`${first}-error`))
    assert.equal(await username.inputValue(), name)
    assert.equal(await password.inputValue(), secret)
    assert.equal(await page.locator('.success-notice').count(), 0)
    if (both) assert.equal(await password.getAttribute('aria-invalid'), 'true')
    else assert.equal(await (first === 'username' ? password : username).getAttribute('aria-invalid'), 'false')
  }

  await page.goto(`${base}/#/explore`)
  await page.getByText('Loading your demo workspace…').waitFor({ state: 'hidden' })
  await heading('Explore')
  assert.equal(await nav.getByRole('link', { name: 'Coordinator desk', exact: true }).count(), 0)
  await noOverflow('desktop visitor explore 1440')
  await page.screenshot({ path: `${output}/desktop-explore.png`, fullPage: true })
  passed('Visitor shell visibly labels memory-only demo and hides staff links')

  // Original reproduction, repeated at both required widths.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await auth(false, 'reservations')
    assert.equal(await focused(username), false, 'Initial rendering must not steal field focus')
    await username.focus(); await page.keyboard.press('Tab')
    assert.equal(await focused(password), true)
    await page.keyboard.press('Tab')
    assert.equal(await focused(submit()), true)
    await page.keyboard.press('Enter')
    await page.locator('.form-alert').filter({ hasText: 'Check the highlighted fields.' }).waitFor()
    assert.equal(await username.isEnabled(), true)
    assert.equal(await focused(username), true)
    assert.equal(await password.getAttribute('aria-invalid'), 'true')
    assert.ok((await username.getAttribute('aria-describedby')).includes('username-error'))
    assert.ok((await password.getAttribute('aria-describedby')).includes('password-error'))
    assert.equal(await username.evaluate((element) => getComputedStyle(element).outlineStyle), 'solid')
    assert.equal(await username.evaluate((element) => getComputedStyle(element).outlineWidth), '2px')
    await page.keyboard.type('immediate')
    assert.equal(await username.inputValue(), 'immediate')
    await page.keyboard.press('Tab'); assert.equal(await focused(password), true)
    await page.keyboard.press('Shift+Tab'); assert.equal(await focused(username), true)
    await noOverflow(`validation and keyboard focus at ${width}`)
    await page.screenshot({ path: `${output}/validation-${width}.png`, fullPage: true })
    passed(`Original #24 empty sign-in, immediate typing, visible focus, Tab/Shift+Tab at ${width}`)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const register of [false, true]) {
    await validation({ register, name: 'ab', secret: 'ValidPassword42!', first: 'username' })
    await validation({ register, name: 'valid_unused', secret: '123456789', first: 'password' })
    await validation({ register, name: 'ab', secret: 'short', first: 'username', both: true })
    passed(`${register ? 'Registration' : 'Sign-in'} username-only, password-only and both-field first-invalid focus`)
  }
  // Repeat the same invalid result after editing and moving focus away.
  await username.fill('xx'); await password.fill('stillbad')
  await submit(true).focus(); await page.keyboard.press('Enter')
  await page.locator('.form-alert').waitFor()
  await page.waitForFunction(() => !document.getElementById('username').disabled)
  assert.equal(await focused(username), true)
  await page.keyboard.type('y')
  await page.keyboard.press('Tab')
  assert.equal(await focused(password), true)
  await page.waitForTimeout(100)
  assert.equal(await focused(password), true)
  passed('Repeated invalid result restores focus once; typing and unrelated renders do not pull it back')

  for (const [name, secret] of [['abc', 'x'.repeat(10)], ['a'.repeat(30), 'x'.repeat(128)]]) {
    await auth(true, 'reservations')
    await username.fill(name); await password.fill(secret)
    await submit(true).click(); await heading('My reservations')
    await page.getByText('Demo account created. You are signed in as a student.').waitFor()
    assert.equal(await nav.getByRole('link', { name: 'Coordinator desk', exact: true }).count(), 0)
    assert.equal(await page.locator('#username').count(), 0)
    await signOut()
  }
  passed('Valid username/password boundaries 3/30 and 10/128 create students and retain return navigation')

  await auth(true)
  await username.fill('  New_Member9  '); await password.fill('ExamplePass42!')
  await submit(true).click(); await heading('Explore')
  assert.equal(await page.locator('.account-name').innerText(), 'new_member9\nStudent')
  await signOut()
  await auth(true)
  await username.fill(' NEW_MEMBER9 '); await password.fill('ExamplePass42!')
  await submit(true).click()
  await page.locator('.form-alert').filter({ hasText: 'That username is already in use.' }).waitFor()
  assert.equal(await focused(username), true)
  assert.equal(await username.isEnabled(), true)
  assert.equal(await username.inputValue(), ' NEW_MEMBER9 ')
  assert.equal(await password.inputValue(), 'ExamplePass42!')
  assert.ok((await username.getAttribute('aria-describedby')).includes('username-error'))
  assert.equal(await page.locator('.success-notice').count(), 0)
  passed('Trimmed lowercase registration; changed-case duplicate focuses enabled Username and preserves values')

  await auth(false, 'reservations')
  await username.fill('maya_student'); await password.fill('WrongPassword42!')
  await submit().focus(); await page.keyboard.press('Enter')
  await page.locator('.form-alert').filter({ hasText: 'Username or password is incorrect.' }).waitFor()
  assert.equal(await username.isEnabled(), true); assert.equal(await password.isEnabled(), true)
  assert.equal(await username.getAttribute('aria-invalid'), 'false'); assert.equal(await password.getAttribute('aria-invalid'), 'false')
  assert.equal(await focused(username), false); assert.equal(await focused(password), false)
  assert.equal(await page.locator('.success-notice').count(), 0)
  await username.focus(); await page.keyboard.press('Tab'); assert.equal(await focused(password), true)
  await password.fill('StudentDemo42!'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  await heading('My reservations'); await page.getByText('Signed in as maya_student.').waitFor()
  passed('Wrong credentials keep form usable without false invalid fields; keyboard retry succeeds to return destination')
  await signOut(); await page.getByText('Signed out. Your demo session has ended.').waitFor()
  passed('Logout clears session and visibly reports success')

  await auth()
  await page.getByRole('button', { name: 'Fill coordinator credentials' }).click()
  await submit().click(); await heading('Explore')
  await nav.getByRole('link', { name: 'Coordinator desk', exact: true }).click(); await heading('Coordinator desk')
  await nav.getByRole('link', { name: 'Inventory', exact: true }).click(); await heading('Inventory')
  await noOverflow('desktop coordinator inventory 1440')
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow('mobile coordinator inventory 390')
  await page.screenshot({ path: `${output}/mobile-coordinator.png`, fullPage: true })
  passed('Coordinator fixture exposes both staff destinations at desktop and mobile')
  await page.reload(); await page.getByText('Loading your demo workspace…').waitFor({ state: 'hidden' })
  assert.equal(await nav.getByRole('link', { name: 'Coordinator desk', exact: true }).count(), 0)
  await heading('Sign in as a coordinator.')
  passed('Reload clears memory session; direct staff destination stays gated')

  await auth()
  await noOverflow('mobile sign-in 390')
  await page.screenshot({ path: `${output}/mobile-signin.png`, fullPage: true })
  await switchFixture('empty')
  await go('explore'); await heading('A fresh start, with no demo accounts.')
  await auth()
  await page.getByRole('button', { name: 'Fill student credentials' }).click(); await submit().click()
  await page.locator('.form-alert').filter({ hasText: 'Username or password is incorrect.' }).waitFor()
  await auth(true)
  await username.fill('empty_student'); await password.fill('ExamplePass42!')
  await submit(true).click(); await heading('Explore')
  await page.getByText('Demo account created. You are signed in as a student.').waitFor()
  passed('Empty fixture has no seeded users and still permits student registration')

  await switchFixture('error')
  await page.locator('.service-notice').filter({ hasText: 'The demo service is unavailable.' }).waitFor()
  await page.getByRole('button', { name: 'Retry session', exact: true }).click()
  await page.getByText('Loading your demo workspace…').waitFor({ state: 'hidden' })
  await auth()
  await page.getByRole('button', { name: 'Fill student credentials' }).click()
  await submit().focus(); await page.keyboard.press('Enter')
  await page.locator('.form-alert').filter({ hasText: 'The demo service is unavailable.' }).waitFor()
  assert.equal(await username.isEnabled(), true); assert.equal(await password.isEnabled(), true)
  assert.equal(await username.getAttribute('aria-invalid'), 'false'); assert.equal(await password.getAttribute('aria-invalid'), 'false')
  assert.equal(await focused(username), false); assert.equal(await focused(password), false)
  assert.equal(await page.locator('.success-notice').count(), 0)
  await username.focus(); await page.keyboard.press('Tab'); assert.equal(await focused(password), true)
  await noOverflow('mobile service error/sign-in 390')
  passed('Service failure/retry shows useful errors, no false field errors/success and usable keyboard form')

  await switchFixture('loading')
  await username.fill('ab'); await password.fill('short')
  await submit().focus(); await page.keyboard.press('Enter')
  const pending = page.getByRole('button', { name: 'Signing in…', exact: true })
  await pending.waitFor()
  assert.equal(await pending.isDisabled(), true)
  assert.equal(await username.isDisabled(), true); assert.equal(await password.isDisabled(), true)
  await page.keyboard.press('Enter'); await pending.evaluate((element) => element.click())
  await page.waitForTimeout(100)
  assert.equal(await pending.isDisabled(), true)
  await page.locator('.form-alert').filter({ hasText: 'Check the highlighted fields.' }).waitFor()
  assert.equal(await username.isEnabled(), true); assert.equal(await focused(username), true)
  assert.equal(await submit().isEnabled(), true)
  await page.waitForTimeout(100)
  assert.equal(await focused(username), true)
  passed('Delayed invalid submit disables inputs/button; repeated Enter/click ignored; enabled Username focused afterward')
  await page.getByRole('button', { name: 'Fill student credentials' }).click(); await submit().click()
  await heading('Explore'); await page.getByText('Signed in as maya_student.').waitFor()
  await noOverflow('mobile signed-in explore 390')
  passed('Delayed valid retry succeeds once with correct session/navigation')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await signOut(); await auth()
  await page.screenshot({ path: `${output}/desktop-signin.png`, fullPage: true })
  await noOverflow('desktop sign-in 1440')
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []); assert.deepEqual(failedRequests, []); assert.deepEqual(apiRequests, [])
  passed('No console/page/request errors or API calls; backend absent throughout')
  await writeFile(`${output}/results.json`, JSON.stringify({ date: new Date().toISOString(), browser: browser.version(), checks, consoleErrors, pageErrors, failedRequests, apiRequests }, null, 2))
  process.stdout.write(`All ${checks.length} scoped browser checks passed.\n`)
} catch (error) {
  await writeFile(`${output}/failure.json`, JSON.stringify({ date: new Date().toISOString(), checks, error: String(error), stack: error.stack, consoleErrors, pageErrors, failedRequests, apiRequests }, null, 2))
  throw error
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
  await writeFile(`${output}/vite.log`, serverLog)
}

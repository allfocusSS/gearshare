// Shared helpers for the real-stack Playwright suites (http.browser.mjs, http.staff.browser.mjs).
import assert from 'node:assert/strict'
import { addDays, clubToday } from '../../src/services/dates.ts'

export { addDays, clubToday }
export const TOKEN_KEY = 'gearshare.session-token'

/** Watches one page: uncaught errors, console errors, failed requests and every /api/ call with its response status. */
export function watch(page, label, sink) {
  page.on('pageerror', (error) => sink.pageErrors.push(`${label}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // Chrome logs every non-2xx fetch as a console error; those are expected when a step provokes a 4xx/5xx and are
    // listed with their URL. Anything else (React errors, uncaught rejections, CSP) is unexpected.
    const resource = /Failed to load resource/.test(message.text())
    ;(resource ? sink.resourceErrors : sink.consoleErrors).push(`${label}: ${message.text()} ${resource ? message.location().url : ''}`.trim())
  })
  page.on('requestfailed', (request) => sink.failedRequests.push(`${label}: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`))
  page.on('request', (request) => {
    if (!request.url().includes('/api/')) return
    sink.requests.push({ label, method: request.method(), url: new URL(request.url()).pathname + new URL(request.url()).search, headers: request.headers(), body: request.postData() })
  })
  page.on('response', (response) => {
    if (!response.url().includes('/api/')) return
    sink.responses.push({ label, method: response.request().method(), url: new URL(response.url()).pathname, status: response.status() })
  })
}

export const newSink = () => ({ pageErrors: [], consoleErrors: [], resourceErrors: [], failedRequests: [], requests: [], responses: [] })

export function createHelpers(page, base) {
  const heading = (name, options = {}) => page.getByRole('heading', { name, exact: true, ...options }).waitFor({ state: 'visible' })
  const go = (route) => page.evaluate((next) => { window.location.hash = next }, `/${route}`)
  const noOverflow = async (label) => {
    const sizes = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }))
    assert.ok(sizes.page <= sizes.viewport, `${label}: horizontal overflow ${JSON.stringify(sizes)}`)
  }
  const token = () => page.evaluate((key) => sessionStorage.getItem(key), TOKEN_KEY)
  const accountName = () => page.locator('.account-name')
  const register = async (username, password, returnTo = 'explore') => {
    await page.goto(`${base}/#/register?returnTo=${returnTo}`)
    await heading('Create an account')
    await page.getByLabel('Username', { exact: true }).fill(username)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create student account', exact: true }).click()
    await accountName().waitFor()
  }
  const signIn = async (username, password, returnTo = 'explore') => {
    await go(`signin?returnTo=${returnTo}`)
    await heading('Sign in')
    await page.getByLabel('Username', { exact: true }).fill(username)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await accountName().waitFor()
  }
  const signOut = async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await accountName().waitFor({ state: 'hidden' })
  }
  /** Show the month that contains `date` in the availability calendar. */
  const showMonthOf = async (date) => {
    for (let step = 0; step < 4; step++) {
      if (await page.getByRole('button', { name: new RegExp(`^${date}: `) }).count()) return
      await page.getByRole('button', { name: 'Next month', exact: true }).click()
    }
    throw new Error(`calendar never showed ${date}`)
  }
  const calendarDay = async (date) => { await showMonthOf(date); return page.getByRole('button', { name: new RegExp(`^${date}: `) }) }
  const codes = async () => page.locator('a.equipment-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label').split(', ').at(-1)).sort())
  return { heading, go, noOverflow, token, accountName, register, signIn, signOut, showMonthOf, calendarDay, codes }
}

/** Fresh, valid, unique credentials for a student. */
export function newStudent(tag) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return { username: `${tag}_${suffix}`.slice(0, 30), password: `Pw-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}` }
}

export function assertNoUnexpected(sink) {
  assert.deepEqual(sink.pageErrors, [], 'uncaught page errors')
  assert.deepEqual(sink.consoleErrors, [], 'unexpected console errors')
  // Resource errors are only acceptable for API calls a step provoked on purpose.
  const stray = sink.resourceErrors.filter((entry) => !entry.includes('/api/v1/'))
  assert.deepEqual(stray, [], 'failed non-API resources')
}

/**
 * Full-page screenshot from the top of the page. The skip link is parked off-screen with `position: fixed; top: -100px`;
 * in a full-page capture of a scrolled page Chromium paints it inside the image, which looks like a focus defect but is
 * only a capture artifact (document.activeElement stays <body>). Scrolling to the top first keeps screenshots honest.
 */
export async function snap(page, path) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path, fullPage: true })
}

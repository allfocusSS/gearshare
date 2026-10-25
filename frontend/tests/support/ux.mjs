// Shared, issue-filterable browser regressions. Keep later UX issues in separate describe blocks.
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { join } from 'node:path'
import { addDays, assertNoUnexpected, createHelpers, newSink, newStudent, snap, watch } from './browserKit.mjs'

export const selectedIssue = (id) => (process.env.UX_ISSUES ?? '31').split(',').includes(String(id))
const purpose = 'A perfectly fine purpose text'
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export function issue31(suite) {
  const cases = [
    ['31.1 empty keyboard submission, response fields and layout', async t => {
      const response = await t.submit()
      await t.errors(response.fields, ['startDate', 'endDate', 'purpose'])
      await t.layout()
      await snap(t.page, join(suite.output, `31-empty-${suite.mode}-${t.width}.png`))
    }],
    ['31.2 valid purpose with both dates empty', async t => {
      await t.purpose(purpose)
      const response = await t.submit()
      await t.errors(response.fields, ['startDate', 'endDate'])
      assert.equal(await t.page.locator('.range-fields .field-error').count(), 2)
    }],
    ['31.3 pointer submission', async t => {
      const response = await t.submit({ pointer: true })
      await t.errors(response.fields, ['startDate', 'endDate', 'purpose'])
    }],
    ...(suite.mode === 'mock' ? [['31.10 maya_student mock reproduction', async t => {
      const response = await t.submit()
      await t.errors(response.fields, ['startDate', 'endDate', 'purpose'])
    }]] : []),
    ['31.4 one missing date, no duplicate IDs before or after edits/submits', async t => {
      await t.purpose(purpose)
      for (const key of ['startDate', 'endDate']) {
        await t.dates(key === 'startDate' ? t.day : '', key === 'endDate' ? t.day : '')
        await t.unique()
        const missing = key === 'startDate' ? 'endDate' : 'startDate'
        assert.equal(await t.page.locator(`#detail-${missing}`).getAttribute('aria-invalid'), 'true')
        const response = await t.submit()
        await t.errors(response.fields, [missing])
        assert.equal(await t.page.locator(`#detail-${key}`).getAttribute('aria-describedby'), 'detail-date-hint')
        await t.dates('', '')
        await t.unique()
      }
    }],
    ['31.5/31.15 server error persists on edit, next submit replaces it', async t => {
      const first = await t.submit()
      await t.page.locator('#detail-startDate').fill(t.day)
      await t.field('startDate', first.fields.startDate)
      await t.unique()
      await t.purpose(purpose)
      const next = await t.submit()
      await t.errors(next.fields, ['endDate'])
    }],
    ['31.6 valid retry clears errors and double Enter creates one request', async t => {
      await t.submit()
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await t.submit({ double: true, success: true, pending: true })
      await t.errors({}, [])
      await t.h.go('reservations')
      await t.page.locator('.reservation-row').first().waitFor()
      assert.equal(await t.page.locator('.reservation-row').count(), 1)
    }],
    ['31.6 purpose-only retry clears date errors', async t => {
      await t.submit()
      await t.dates(t.day, t.day)
      await t.purpose('no')
      const next = await t.submit()
      await t.errors(next.fields, ['purpose'])
    }],
    ['31.7 conflict has unavailableDates and no date field errors', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await suite.conflict(t)
      const response = await t.submit({ conflict: true })
      assert.ok(response.unavailableDates?.includes(t.day))
      assert.equal(response.fields, undefined)
      await t.errors({}, [])
      assert.match(await t.page.locator('.booking-form [role=alert]').innerText(), new RegExp(t.day))
    }],
    ['31.7 network/service failure has no date field errors', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await suite.fail(t, 'network')
      await t.submit({ injected: true })
      await t.errors({}, [])
    }],
    ...(suite.mode === 'http' ? [['31.7 HTTP 500 has no date field errors', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await suite.fail(t, '500')
      await t.submit({ injected: true })
      await t.errors({}, [])
    }]] : []),
    ['31.8 keyboard client range validation remains associated', async t => {
      for (const [start, end, key, text] of [
        [t.day, addDays(t.day, -1), 'endDate', 'End on or after the start date.'],
        [t.day, addDays(t.day, 14), 'endDate', 'Choose at most 14 inclusive days.'],
        [addDays(t.today, -1), t.today, 'startDate', 'Start on or after the club date today.'],
      ]) {
        await t.dates(start, end, true)
        await t.field(key, text)
        const other = key === 'startDate' ? 'endDate' : 'startDate'
        assert.equal(await t.page.locator(`#detail-${other}`).getAttribute('aria-invalid'), 'false')
        assert.equal(await t.page.locator('.availability-panel > [role=alert]').innerText(), 'Check the date range before viewing availability.')
      }
    }],
    ['31.9 shared Explore date fields retain client error', async t => {
      await t.h.go('explore')
      await t.page.locator('#catalogue-startDate').fill(t.day)
      await t.page.locator('#catalogue-endDate').fill(addDays(t.day, -1))
      assert.equal(await t.page.locator('#catalogue-endDate-error').innerText(), 'End on or after the start date.')
      assert.equal(await t.page.locator('#catalogue-endDate').getAttribute('aria-invalid'), 'true')
      assert.equal(await t.page.locator('#catalogue-endDate').getAttribute('aria-describedby'), 'catalogue-endDate-error')
      assert.match(await t.page.getByRole('alert').innerText(), /Check your dates\./)
    }],
    ['31.12 empty double Enter disables pending controls and sends once', async t => {
      const response = await t.submit({ double: true, pending: true })
      await t.errors(response.fields, ['startDate', 'endDate', 'purpose'])
    }],
    ['31.14 client messages take precedence over retained server messages', async t => {
      await t.submit()
      await t.dates(t.day, addDays(t.day, -1))
      await t.field('endDate', 'End on or after the start date.')
      await t.unique()
      await t.dates(addDays(t.today, -1), t.today)
      await t.field('startDate', 'Start on or after the club date today.')
      await t.unique()
    }],
  ]
  for (const width of [1440, 390]) for (const [name, run] of cases) {
    if (process.env.UX_CASES && !process.env.UX_CASES.split(',').some(id => name.split(' ')[0].split('/').includes(id))) continue
    it(`${suite.mode} ${name} @${width}`, async () => {
      const t = await suite.fresh(width, name)
      try { await augment(t, suite); await run(t); assertNoUnexpected(t.sink) }
      catch (error) { await snap(t.page, join(suite.output, `failure-${name.split(' ')[0].replaceAll('/', '-')}-${width}.png`)); throw error }
      finally { await t.context.close() }
    })
  }
}

async function augment(t, suite) {
  const { page } = t
  t.h = createHelpers(page, suite.base)
  t.sink = newSink()
  watch(page, `${t.width}`, t.sink)
  t.button = () => page.getByRole('button', { name: 'Request equipment', exact: true })
  t.purpose = value => page.locator('#booking-purpose').fill(value)
  t.unique = async () => {
    for (const key of ['startDate', 'endDate']) assert.ok(await page.locator(`[id="detail-${key}-error"]`).count() <= 1, `unique ${key} error`)
  }
  t.field = async (key, text) => {
    const control = page.locator(key === 'purpose' ? '#booking-purpose' : `#detail-${key}`)
    const id = key === 'purpose' ? 'purpose-error' : `detail-${key}-error`
    assert.equal(await control.getAttribute('aria-invalid'), 'true', `${key} flagged`)
    assert.ok((await control.getAttribute('aria-describedby')).split(/\s+/).includes(id), `${key} associated`)
    assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `${key} exactly one error`)
    assert.equal(await page.locator(`#${id}`).innerText(), text)
    assert.equal(await page.locator(`#${id}`).isVisible(), true)
  }
  t.errors = async (fields, expected) => {
    assert.deepEqual(Object.keys(fields).sort(), [...expected].sort(), 'response field oracle')
    for (const key of ['startDate', 'endDate', 'purpose']) {
      if (fields[key]) {
        const oneMissing = suite.mode === 'mock' && key !== 'purpose' && !(await page.locator(`#detail-${key}`).inputValue()) && !!(await page.locator(`#detail-${key === 'startDate' ? 'endDate' : 'startDate'}`).inputValue())
        await t.field(key, oneMissing ? `Choose a valid ${key === 'startDate' ? 'start' : 'end'} date.` : fields[key])
      }
      else {
        const id = key === 'purpose' ? 'booking-purpose' : `detail-${key}`
        assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'false', `${key} not flagged`)
        assert.equal(await page.locator(key === 'purpose' ? '#purpose-error' : `#detail-${key}-error`).count(), 0)
      }
    }
    await t.unique()
  }
  t.dates = async (start, end, keyboard = false) => {
    for (const [key, value] of [['startDate', start], ['endDate', end]]) {
      const input = page.locator(`#detail-${key}`)
      if (keyboard) {
        // Chromium's date control exposes month/day/year segments. Enter each segment through the keyboard.
        await input.click({ position: { x: 8, y: 10 } })
        const [year, month, day] = value.split('-')
        await page.keyboard.type(`${month}${day}${year}`)
        await page.keyboard.press('Tab')
        assert.equal(await input.inputValue(), value, 'date entered by keyboard')
      } else await input.fill(value)
    }
  }
  t.submit = async ({ pointer = false, double = false, success = false, pending = false, conflict = false, injected = false } = {}) => {
    const before = t.sink.requests.filter(r => r.method === 'POST' && r.url === '/api/v1/bookings').length
    const mockBefore = suite.mode === 'mock' ? await page.evaluate(() => window.__uxBookingProbe.calls) : null
    let release, responsePromise
    if (suite.mode === 'http') {
      // Gate only transmission, retaining the actual server response and field oracle.
      const gate = new Promise(resolve => { release = resolve })
      await page.route('**/api/v1/bookings', async route => { if (route.request().method() === 'POST') { await gate; await route.fallback() } else await route.fallback() })
      responsePromise = injected ? null : page.waitForResponse(r => r.url().endsWith('/api/v1/bookings') && r.request().method() === 'POST')
    }
    const button = t.button()
    await button.focus()
    if (pointer) await button.click()
    else { await page.keyboard.press('Enter'); if (double) await page.keyboard.press('Enter') }
    if (pending) {
      assert.equal(await page.locator('fieldset.request-date-fields').getAttribute('disabled'), '')
      assert.equal(await page.locator('#booking-purpose').isDisabled(), true)
      assert.equal(await page.getByRole('button', { name: 'Submitting request…', exact: true }).isDisabled(), true)
      // Retained server errors clear at the beginning of the retry.
      if (success) assert.equal(await page.locator('.field-error').count(), 0)
    }
    release?.()
    let response
    if (responsePromise) {
      const wire = await responsePromise
      response = await wire.json()
      assert.equal(wire.status(), success ? 201 : conflict ? 409 : 422)
      suite.records.push({ width: t.width, case: t.name, status: wire.status(), response })
    }
    await t.button().waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('.booking-form button[type=submit]')?.disabled)
    await pause(400)
    if (suite.mode === 'http') {
      await page.unroute('**/api/v1/bookings') // fresh case page; injection routes may also be removed after settlement.
      assert.equal(t.sink.requests.filter(r => r.method === 'POST' && r.url === '/api/v1/bookings').length - before, 1, 'exactly one POST per submit')
    }
    if (suite.mode === 'mock') {
      const observed = await page.evaluate(() => window.__uxBookingProbe)
      assert.equal(observed.calls - mockBefore, 1, 'exactly one real mock requestBooking call per submit')
      assert.equal(observed.results.length, observed.calls, 'mock request settled')
      const result = observed.results.at(-1)
      assert.equal(result.ok, success)
      response = result.ok ? result.data : result.error
      suite.records.push({ width: t.width, case: t.name, result })
    }
    if (success) await page.getByRole('link', { name: 'View my reservations', exact: true }).waitFor()
    else {
      const alert = page.locator('.booking-form [role=alert]')
      await alert.waitFor()
      if (response?.message) assert.ok((await alert.innerText()).startsWith(response.message), 'response summary remains in alert')
    }
    return response ?? {}
  }
  t.layout = async () => {
    const geometry = await page.evaluate(() => {
      const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
      const button = document.querySelector('.booking-form button[type=submit]')
      const panel = document.querySelector('.availability-panel').getBoundingClientRect()
      return { width: innerWidth, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, button: rect(button), panelRight: panel.right,
        errors: ['startDate', 'endDate', 'purpose'].map(key => {
          const error = document.getElementById(key === 'purpose' ? 'purpose-error' : `detail-${key}-error`)
          const input = document.getElementById(key === 'purpose' ? 'booking-purpose' : `detail-${key}`)
          const r = rect(error)
          let clipped = false
          for (let parent = error.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), box = parent.getBoundingClientRect()
            if (/(hidden|clip|auto|scroll)/.test(style.overflowX) && (r.left < box.left || r.right > box.right)) clipped = true
            if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (r.top < box.top || r.bottom > box.bottom)) clipped = true
          }
          return { key, error: r, input: rect(input), clipped }
        }) }
    })
    assert.equal(geometry.scroll, geometry.client, 'no horizontal page overflow')
    assert.ok(geometry.button.height >= 44 && geometry.button.left >= 0 && geometry.button.right <= geometry.width, 'visible 44px action')
    for (const { key, error, input, clipped } of geometry.errors) {
      assert.ok(error.width > 0 && error.height > 0 && error.left >= 0 && error.right <= geometry.width && error.right <= geometry.panelRight, `${key} visible within panel`)
      assert.equal(clipped, false, `${key} unclipped`)
      assert.ok(error.bottom <= input.top || error.top >= input.bottom || error.right <= input.left || error.left >= input.right, `${key} does not overlap control`)
    }
    suite.records.push({ width: t.width, case: '31.11 layout', geometry })
  }
}

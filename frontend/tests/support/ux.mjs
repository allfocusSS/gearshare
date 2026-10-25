// Shared, issue-filterable browser regressions for the #15 bugs (#31 to #43) and their helpers. Keep later UX issues in
// separate describe blocks (http.ux.browser.mjs / ux.mock.browser.mjs): each calls one `issueNN(suite)` exported here.
// Layout of this file: (1) the #31 body, (2) shared helpers (club-date arithmetic, stylesheet reading, focus and geometry
// readers, case registration), (3) one section per later issue. Part B appends its sections at "PART B SECTIONS".
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { join } from 'node:path'
import { addDays, assertNoUnexpected, createHelpers, newSink, newStudent, snap, watch } from './browserKit.mjs'
import { formatCalendarDate } from '../../src/services/dates.ts'

/** `UX_ISSUES=31,32` runs only those issue blocks; unset or empty runs every block. */
export const selectedIssue = (id) => {
  const wanted = (process.env.UX_ISSUES ?? '').split(/[\s,]+/).filter(Boolean)
  return wanted.length === 0 || wanted.includes(String(id))
}
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
    if (pointer) { if (double) await button.dblclick(); else await button.click() }
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

// ====================================================================================================================
// Shared helpers (part A; part B adds below the markers)
// ====================================================================================================================

export const WIDTHS = [1440, 390]
/** #37 matrix. The asset detail grid is one column up to 1099 px and two columns from 1100 px (`@media (max-width: 1099px)`). */
export const WRAP_WIDTHS = [390, 768, 1099, 1100, 1440]
export const TWO_COLUMN_FROM = 1100

// ---- club-date arithmetic (all dates are Asia/Almaty calendar dates, as in the app) -------------------------------------

export const horizonEnd = (today) => addDays(today, 90)

export function shiftMonth(month, delta) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7)
}

export function monthsBetween(from, to) {
  const [fromYear, fromNumber] = from.split('-').map(Number)
  const [toYear, toNumber] = to.split('-').map(Number)
  return (toYear - fromYear) * 12 + (toNumber - fromNumber)
}

/** The calendar heading text for a `YYYY-MM` month, e.g. "January 2027". */
export const monthLabel = (month) => formatCalendarDate(`${month}-01`, { month: 'long', year: 'numeric' })

/**
 * Free days in a later calendar month for the #36 cases, relative to the club date (QA data note on #36): D is the horizon
 * end minus ten days when that is still in the horizon-end month, otherwise the horizon end itself. When the last month
 * holds fewer than six horizon days the plan moves to the month before it (always fully inside the horizon), unless
 * `lastMonth` is requested (#36.4 needs the last month itself).
 *
 * Returns { today, horizonEnd, month, label, previousLabel, steps, first, last, days, isLastMonth }; `steps` is the number
 * of "Next month" presses from the current month and `days` are distinct dates of `month` (days[0] = D, days[1] = D + 3
 * when that fits, then 5, 7, 9 days after D, or earlier days when the month ends too soon).
 */
export function monthPlan(today, { lastMonth = false } = {}) {
  const end = horizonEnd(today)
  const lastKey = end.slice(0, 7)
  let month = lastKey
  let last = end
  if (!lastMonth && Number(end.slice(8)) < 6) {
    month = shiftMonth(lastKey, -1)
    last = addDays(`${lastKey}-01`, -1)
  }
  const first = `${month}-01`
  const D = Number(last.slice(8)) >= 11 ? addDays(last, -10) : last
  const days = []
  for (const offset of [0, 3, 5, 7, 9]) {
    const day = addDays(D, offset)
    if (day <= last) days.push(day)
  }
  for (let back = 1; days.length < 5 && addDays(D, -back) >= first; back++) days.push(addDays(D, -back))
  return {
    today, horizonEnd: end, month, label: monthLabel(month), previousLabel: monthLabel(shiftMonth(month, -1)),
    steps: monthsBetween(today.slice(0, 7), month), first, last, days, isLastMonth: month === lastKey,
  }
}

// ---- stylesheet reading for cheap "the rule exists" checks (#37.11, #38, and the #42 font-size scan later) -----------------

function splitDeclarations(body) {
  const declarations = []
  let depth = 0, current = ''
  for (const character of body) {
    if (character === '(') depth++
    else if (character === ')') depth = Math.max(0, depth - 1)
    if (character === ';' && depth === 0) { declarations.push(current); current = '' } else current += character
  }
  declarations.push(current)
  const result = {}
  for (const declaration of declarations) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim().replace(/\s*!important$/i, '')
    if (property) result[property] = value
  }
  return result
}

/** Flat list of style rules: { media: string | null, selectors: string[], declarations: Record<string, string> }. */
export function parseCss(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  const walk = (chunk, media) => {
    let index = 0
    while (index < chunk.length) {
      const open = chunk.indexOf('{', index)
      if (open === -1) break
      const header = chunk.slice(index, open).trim()
      let depth = 1, close = open + 1
      while (close < chunk.length && depth > 0) {
        if (chunk[close] === '{') depth++
        else if (chunk[close] === '}') depth--
        close++
      }
      const body = chunk.slice(open + 1, close - 1)
      if (/^@(media|supports)/i.test(header)) walk(body, header.replace(/\s+/g, ' ').replace(/^@media\s*\(/i, '@media ('))
      else if (!header.startsWith('@')) rules.push({ media, selectors: header.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')).filter(Boolean), declarations: splitDeclarations(body) })
      index = close
    }
  }
  walk(text, null)
  return rules
}

/** Declarations that apply to exactly this selector inside this @media text (default: outside any), later rules winning. */
export function declarationsFor(rules, selector, { media = null } = {}) {
  const merged = {}
  for (const rule of rules) if (rule.media === media && rule.selectors.includes(selector)) Object.assign(merged, rule.declarations)
  return merged
}

/** True when the declarations let an unbroken token wrap (design-system.md "User-entered text wrapping"). */
export const wrapsAnywhere = (declarations) => ['anywhere', 'break-word'].includes(declarations['overflow-wrap']) || ['break-word', 'break-all'].includes(declarations['word-break'])

/**
 * Whether text wraps at any character for an element whose rule chain is given closest first (the element's own selector,
 * then the ancestors that carry inherited wrapping), the way `overflow-wrap` inherits: the first selector in the chain that
 * declares `overflow-wrap` or `word-break` decides. Returns { ok, selector } so a failure can name what it found.
 */
export function wrapChain(rules, chain, { media = null } = {}) {
  for (const selector of chain) {
    const declarations = declarationsFor(rules, selector, { media })
    if ('overflow-wrap' in declarations || 'word-break' in declarations) return { ok: wrapsAnywhere(declarations), selector }
  }
  return { ok: false, selector: null }
}

// EXTENSION POINT #42: add `fontSizesUnder(rules, floor)` here (every `font-size` below 12px, including inside @media rules,
// outside the closed allow-list in design-system.md). parseCss already returns the media text for each rule.

// ---- browser readers (Playwright `page`/`locator` objects are passed in) -------------------------------------------------

export const settle = (page, ms = 400) => page.waitForTimeout(ms)

/**
 * `document.activeElement` itself (QA convention: assert the element, never infer it by pressing Tab). `isBody` is true for
 * body and for a null active element; `name` is aria-label, then the associated label text, then the text content.
 */
export function activeInfo(page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element) return { tag: null, id: null, name: '', type: null, disabled: false, isBody: true }
    const labels = 'labels' in element && element.labels ? [...element.labels].map((label) => label.textContent.trim()).join(' ') : ''
    const name = (element.getAttribute('aria-label') || labels || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100)
    return { tag: element.tagName, id: element.id || null, name, type: element.getAttribute('type'), disabled: !!element.disabled, isBody: element === document.body }
  })
}

export const describeActive = (info) => (info.isBody ? 'BODY' : `${info.tag.toLowerCase()}${info.id ? `#${info.id}` : ''} "${info.name}"${info.disabled ? ' (disabled)' : ''}`)

/** Asserts that the focused element is this id/tag/name (all optional), enabled and not BODY. Returns the info. */
export async function assertFocus(page, expected, label) {
  const info = await activeInfo(page)
  const actual = describeActive(info)
  assert.equal(info.isBody, false, `${label}: focus is on BODY, expected ${JSON.stringify(expected)}`)
  if (expected.id !== undefined) assert.equal(info.id, expected.id, `${label}: focus is ${actual}, expected #${expected.id}`)
  if (expected.tag !== undefined) assert.equal(info.tag, expected.tag, `${label}: focus is ${actual}, expected <${expected.tag.toLowerCase()}>`)
  if (expected.name !== undefined) assert.equal(info.name, expected.name, `${label}: focus is ${actual}, expected name "${expected.name}"`)
  assert.equal(info.disabled, false, `${label}: focus is on a disabled control (${actual})`)
  return info
}

/** Keyboard submit of the booking form without the response oracle of `t.submit` (401, navigation, delayed or failing refresh cases). */
export const pressRequest = async t => { await t.button().focus(); await t.page.keyboard.press('Enter') }

export const overflowInfo = (page) => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, innerWidth }))

/** Strict QA form: `scrollWidth === clientWidth` (not merely <=). */
export async function assertNoOverflow(page, label) {
  const sizes = await overflowInfo(page)
  assert.equal(sizes.scrollWidth, sizes.clientWidth, `${label}: horizontal overflow ${JSON.stringify(sizes)}`)
  return sizes
}

/**
 * Geometry of one element (a Playwright locator that resolves to one element): rect, whether an ancestor with a clipping
 * overflow hides part of it, its own scroll sizes and computed font/overflow properties.
 */
export function geometry(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    let clipped = false
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      if (/(hidden|clip|auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) {
        const box = ancestor.getBoundingClientRect()
        if (rect.left < box.left - 0.5 || rect.right > box.right + 0.5 || rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5) clipped = true
      }
    }
    const style = getComputedStyle(element)
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, clipped,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, fontSize: style.fontSize, textOverflow: style.textOverflow,
      overflowX: style.overflowX, display: style.display, visibility: style.visibility, innerWidth, text: element.textContent,
    }
  })
}

export const intersects = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

/** Count of booking POSTs the page has sent so far (from the watch() sink of `augment`). */
export const bookingPosts = (t) => t.sink.requests.filter((request) => request.method === 'POST' && request.url === '/api/v1/bookings').length

/** Long unbroken test strings from the #37/#38 data matrix. */
export const LONG = {
  url80: () => `https://docs.example.org/equipment/manuals/${'a'.repeat(80)}`.slice(0, 80),
  manualUrl80: () => `Manual: ${LONG.url80()}`,
  manualUrl470: () => `Manual: https://docs.example.org/${'a'.repeat(470)}`,
  spacedDescription2000: () => 'Lens kit with spare batteries and a carry case. '.repeat(60).slice(0, 2000),
}

// ---- case registration (used by every section below; issue31 above keeps its own, QA-accepted loop) -----------------------

/**
 * Registers `[name, run, options]` cases once per width as node:test `it`s. `name` starts with the QA case number and may
 * carry the QA tags ("32.1 [FAIL-NOW] ..."); `UX_CASES=32.1,32.4` narrows a run to exact case numbers. `options` go to
 * `suite.fresh(width, name, options)` (unit overrides, signedIn, ...) except `widths` (default both), `modes`
 * (default both adapters) and `todo` (a reason: the case documents a known open defect, so node:test reports it as a TODO
 * and a failure does not fail the run; remove `todo` when that defect is fixed).
 */
export function defineCases(suite, cases, { widths = WIDTHS } = {}) {
  for (const [name, run, options = {}] of cases) {
    if (options.modes && !options.modes.includes(suite.mode)) continue
    if (process.env.UX_CASES && !process.env.UX_CASES.split(',').some((id) => name.split(' ')[0].split('/').includes(id))) continue
    for (const width of options.widths ?? widths) {
      it(`${suite.mode} ${name} @${width}`, options.todo ? { todo: options.todo } : {}, async () => {
        const t = await suite.fresh(width, name, options)
        try { await augment(t, suite); await run(t); assertNoUnexpected(t.sink) }
        catch (error) { await snap(t.page, join(suite.output, `failure-${name.split(' ')[0].replaceAll('/', '-')}-${width}.png`)); throw error }
        finally { await t.context.close() }
      })
    }
  }
}

// EXTENSION POINT: part B appends helpers here (focus sweeps for #33-#35/#39-#41, the 21-state font scan with aria-hidden
// and pseudo-element handling for #42) and its `issueNN(suite)` sections at "PART B SECTIONS" below.

// ====================================================================================================================
// PART A SECTIONS: #32, #36, #37, #38 (each added in its own commit, after its red run)
// ====================================================================================================================

// ---- #32: focus after the booking request settles ------------------------------------------------------------------------

/** Chromium focus facts shared by the #32 cases: the request button is "Request equipment", the 401 link "Sign in again". */
const REQUEST_BUTTON = { tag: 'BUTTON', name: 'Request equipment' }

export function issue32(suite) {
  const http = suite.mode === 'http'
  const landed = async (t, expected, label) => {
    await settle(t.page) // QA convention: request finished plus 400 ms with no input
    return assertFocus(t.page, expected, `${label} (${suite.mode} @${t.width})`)
  }
  const focusinsOnPurpose = t => t.page.evaluate(() => window.__purposeFocusIns)
  const countPurposeFocusins = t => t.page.evaluate(() => {
    window.__purposeFocusIns = 0
    document.addEventListener('focusin', event => { if (event.target.id === 'booking-purpose') window.__purposeFocusIns += 1 })
  })
  const retained = async (t, { start, end, text }) => {
    assert.equal(await t.page.locator('#detail-startDate').inputValue(), start, 'start date retained')
    assert.equal(await t.page.locator('#detail-endDate').inputValue(), end, 'end date retained')
    assert.equal(await t.page.locator('#booking-purpose').inputValue(), text, 'purpose retained')
    assert.equal(await t.page.locator('.booking-form .success-notice').count(), 0, 'no success text')
    assert.equal(await t.page.getByText('Pending approval', { exact: false }).count(), 0, 'no "Pending approval"')
  }
  /** Presses Enter on the focused request button without the submit helper's response oracle (401, navigation, delay cases). */
  const press = pressRequest
  const delayPosts = (t, ms) => t.page.route('**/api/v1/bookings', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    await pause(ms)
    return route.fallback()
  })
  const cases = [
    ['32.1 [FAIL-NOW] purpose-only failure focuses the purpose, typing lands there (keyboard and pointer)', async t => {
      await t.dates(t.day, t.day)
      for (const pointer of [false, true]) {
        await t.purpose('no')
        const response = await t.submit({ pointer })
        await t.errors(response.fields, ['purpose'])
        await landed(t, { id: 'booking-purpose', tag: 'TEXTAREA' }, pointer ? 'pointer submit' : 'keyboard submit')
        await t.page.keyboard.type('abc')
        const value = await t.page.locator('#booking-purpose').inputValue()
        assert.equal(value.length, 5, 'the three typed characters landed in the textarea')
        assert.ok(value.includes('abc'))
        // 'no' plus three characters is a valid purpose; the helper leaves it for the next iteration to overwrite.
      }
    }],
    ['32.2 [FAIL-NOW] empty form and valid purpose with empty dates focus the Start date', async t => {
      const response = await t.submit()
      await t.errors(response.fields, ['startDate', 'endDate', 'purpose'])
      await landed(t, { id: 'detail-startDate', tag: 'INPUT' }, 'empty form')
      await t.purpose(purpose)
      const next = await t.submit()
      await t.errors(next.fields, ['startDate', 'endDate'])
      await landed(t, { id: 'detail-startDate', tag: 'INPUT' }, 'valid purpose, empty dates')
    }],
    ['32.3 [FAIL-NOW] Start typed with End empty focuses the End date', async t => {
      await t.purpose(purpose)
      await t.dates(t.day, '')
      const response = await t.submit()
      await t.errors(response.fields, ['endDate'])
      await landed(t, { id: 'detail-endDate', tag: 'INPUT' }, 'start only')
    }],
    ['32.4 [FAIL-NOW] focus is applied once per settled failure and never reclaimed', async t => {
      await t.dates(t.day, t.day)
      await t.purpose('no')
      await countPurposeFocusins(t)
      await t.submit()
      await landed(t, { id: 'booking-purpose' }, 'first failure')
      assert.equal(await focusinsOnPurpose(t), 1, 'one landing for the first failure')
      await t.page.keyboard.press('Tab')
      await pause(1000)
      await assertFocus(t.page, { tag: 'BUTTON', name: 'Request equipment' }, 'Tab moves on and is not pulled back')
      assert.equal(await focusinsOnPurpose(t), 1, 'no automatic return after Tab')
      await t.page.keyboard.press('Shift+Tab')
      assert.equal(await focusinsOnPurpose(t), 2, 'only the user-driven Shift+Tab returned')
      await t.page.keyboard.type('X')
      await pause(1000)
      await assertFocus(t.page, { id: 'booking-purpose' }, 'typing keeps focus where it is')
      assert.equal(await focusinsOnPurpose(t), 2, 'typing and ordinary rerenders never reclaim focus')
      const typed = await t.page.locator('#booking-purpose').inputValue()
      assert.equal(typed.length, 3, 'one character typed')
      assert.ok(typed.includes('X'))
      await t.submit()
      await landed(t, { id: 'booking-purpose' }, 'second failure')
      assert.equal(await focusinsOnPurpose(t), 3, 'the second failure moves focus exactly once')
    }],
    ['32.5 [FAIL-NOW] 409 conflict leaves focus on Request equipment, values retained', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await suite.conflict(t)
      const response = await t.submit({ conflict: true })
      assert.ok(!http || response.unavailableDates?.includes(t.day), 'alert lists the unavailable day')
      await landed(t, REQUEST_BUTTON, '409')
      await retained(t, { start: t.day, end: t.day, text: purpose })
    }],
    ['32.6 [FAIL-NOW] lost connection and a 500 leave focus on Request equipment', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await suite.fail(t, 'network')
      await t.submit({ injected: true })
      await landed(t, REQUEST_BUTTON, 'lost connection')
      await retained(t, { start: t.day, end: t.day, text: purpose })
      if (http) {
        await t.page.unroute('**/api/v1/bookings')
        await suite.fail(t, '500')
        await t.submit({ injected: true })
        await landed(t, REQUEST_BUTTON, '500')
        await retained(t, { start: t.day, end: t.day, text: purpose })
      }
    }],
    ['32.7 [FAIL-NOW] success focuses Request equipment once the availability refresh finished', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await t.submit({ success: true })
      assert.equal(await t.page.getByText('Updating availability…').count(), 0, 'refresh finished')
      assert.match(await t.page.locator('.booking-form .success-notice').innerText(), /Pending approval/)
      await landed(t, REQUEST_BUTTON, 'success')
    }],
    ['32.8 [FAIL-NOW] a 401 mid-submit focuses "Sign in again"', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await suite.revoke(t)
      await press(t)
      const link = t.page.getByRole('link', { name: 'Sign in again', exact: true })
      await link.waitFor()
      assert.equal(await t.page.locator('.service-notice').innerText().then(text => text.includes('Your session has ended. Sign in again to continue.')), true)
      await landed(t, { tag: 'A', name: 'Sign in again' }, '401')
      assert.equal(await link.evaluate(element => element === document.activeElement), true)
    }, { modes: ['http'] }],
    ['32.9 [GUARD] navigating away while pending does not steal focus on the new page', async t => {
      await t.dates(t.day, t.day)
      await t.purpose(purpose)
      await delayPosts(t, 1200)
      await press(t)
      await t.page.getByRole('button', { name: 'Submitting request…', exact: true }).waitFor()
      await t.page.evaluate(() => { location.hash = '/reservations' })
      await t.page.getByRole('heading', { name: 'My reservations', level: 1 }).waitFor()
      await pause(2000) // the delayed POST finishes while the new page is shown
      await assertFocus(t.page, { id: 'main-content', tag: 'H1', name: 'My reservations' }, '32.9 no steal')
    }, { modes: ['http'] }],
    ['32.10 [GUARD] focus the user moved elsewhere while pending is not taken back', async t => {
      await t.dates(t.day, t.day)
      await t.purpose('no')
      await delayPosts(t, 1200)
      await press(t)
      await t.page.getByRole('button', { name: 'Submitting request…', exact: true }).waitFor()
      await t.page.evaluate(() => document.querySelector('.skip-link').focus())
      await t.page.locator('#purpose-error').waitFor()
      await pause(600)
      await assertFocus(t.page, { tag: 'A', name: 'Skip to content' }, '32.10 stays on the skip link')
    }, { modes: ['http'] }],
    ['32.11 [GUARD] double Enter and double click send one request, disabled while pending, error associated', async t => {
      await t.dates(t.day, t.day)
      await t.purpose('no')
      const enter = await t.submit({ double: true, pending: true })
      await t.errors(enter.fields, ['purpose'])
      const click = await t.submit({ pointer: true, double: true, pending: true })
      await t.errors(click.fields, ['purpose'])
      assert.ok((await t.page.locator('#booking-purpose').getAttribute('aria-describedby')).split(/\s+/).includes('purpose-error'))
    }],
    ['32.12 [FAIL-NOW][MOCK] purpose failure, simulated conflict and simulated failure', async t => {
      await t.dates(t.day, t.day)
      await t.purpose('no')
      const response = await t.submit()
      await t.errors(response.fields, ['purpose'])
      await landed(t, { id: 'booking-purpose' }, 'mock purpose failure')
      await t.purpose(purpose)
      await suite.conflict(t)
      await t.submit({ conflict: true })
      await landed(t, REQUEST_BUTTON, 'mock conflict')
      await suite.fail(t)
      await t.submit({ injected: true })
      await landed(t, REQUEST_BUTTON, 'mock failure')
    }, { modes: ['mock'], maya: true }],
  ]
  defineCases(suite, cases)
}

// ---- #36: the calendar keeps its month across an availability refresh -----------------------------------------------------

export function issue36(suite) {
  const http = suite.mode === 'http'
  const header = t => t.page.locator('.calendar-header h3')
  const dayButton = (t, date, state) => t.page.getByRole('button', { name: `${date}: ${state}`, exact: true })
  const arrow = (t, direction) => t.page.getByRole('button', { name: `${direction} month`, exact: true })
  const press = async (t, locator) => { await locator.focus(); await t.page.keyboard.press('Enter') }
  /** Keyboard navigation to the planned month, asserting the heading before anything is submitted. */
  const toMonth = async (t, plan) => {
    for (let step = 0; step < plan.steps; step++) await press(t, arrow(t, 'Next'))
    assert.equal(await header(t).innerText(), plan.label, 'the calendar shows the planned month before the submit')
  }
  const fill = async (t, day) => { await t.dates(day, day); await t.purpose(purpose) }
  /** The refresh has finished (no status, calendar mounted), the heading is the retained month and the booked day is shown. */
  const keepsMonth = async (t, plan, day, label) => {
    await t.page.locator('.availability-calendar').waitFor()
    assert.equal(await t.page.getByText('Updating availability…').count(), 0, `${label}: refresh finished`)
    assert.equal(await header(t).innerText(), plan.label, `${label}: the calendar keeps ${plan.label}`)
    assert.equal(await dayButton(t, day, 'Occupied, unavailable, selected').isVisible(), true, `${label}: ${day} is shown occupied and selected`)
  }
  const currentMonth = t => monthLabel(t.today.slice(0, 7))
  const cases = [
    ['36.1 [FAIL-NOW] conflict keeps the chosen month and shows the occupied day', async t => {
      const plan = monthPlan(t.today), day = plan.days[0]
      await toMonth(t, plan)
      await fill(t, day)
      await suite.conflict(t, day)
      const response = await t.submit({ conflict: true })
      assert.ok(!http || response.unavailableDates?.includes(day), 'the alert lists the unavailable day')
      await keepsMonth(t, plan, day, 'conflict')
      assert.equal(await t.page.locator('#detail-startDate').inputValue(), day)
      assert.equal(await t.page.locator('#detail-endDate').inputValue(), day)
      assert.equal(await t.page.locator('#booking-purpose').inputValue(), purpose)
      assert.match(await t.page.locator('.booking-form [role=alert]').innerText(), new RegExp(day))
      await assertNoOverflow(t.page, '36.8 after the conflict refresh')
    }],
    ['36.2 [FAIL-NOW] success keeps the chosen month and shows the booked day', async t => {
      const plan = monthPlan(t.today), day = plan.days[1]
      await toMonth(t, plan)
      await fill(t, day)
      await t.submit({ success: true })
      await keepsMonth(t, plan, day, 'success')
      assert.match(await t.page.locator('.booking-form .success-notice').innerText(), /Pending approval/)
    }],
    ['36.3 [FAIL-NOW] the status stays while the refresh is in flight, then the month returns', async t => {
      const plan = monthPlan(t.today), day = plan.days[1]
      await toMonth(t, plan)
      await fill(t, day)
      await t.page.route('**/api/v1/assets/*/availability', async route => { await pause(1500); await route.fallback() })
      await pressRequest(t)
      const status = t.page.getByText('Updating availability…')
      await status.waitFor()
      assert.equal(await t.page.locator('.availability-calendar').count(), 0, 'no calendar, so no old availability presented as current')
      assert.equal(await dayButton(t, day, 'Available').count(), 0)
      await status.waitFor({ state: 'detached' })
      await t.page.getByRole('link', { name: 'View my reservations', exact: true }).waitFor()
      await settle(t.page)
      await keepsMonth(t, plan, day, 'after the delayed refresh')
      await assertNoOverflow(t.page, '36.8 after the delayed refresh')
    }, { modes: ['http'] }],
    ['36.4 [FAIL-NOW] the arrows reflect the retained month in the last horizon month', async t => {
      const plan = monthPlan(t.today, { lastMonth: true }), day = plan.days[0]
      await toMonth(t, plan)
      assert.equal(await arrow(t, 'Next').isDisabled(), true, 'Next month is disabled in the last horizon month')
      await fill(t, day)
      await t.submit({ success: true })
      await keepsMonth(t, plan, day, 'last month')
      assert.equal(await arrow(t, 'Previous').isDisabled(), false, 'Previous month is enabled')
      assert.equal(await arrow(t, 'Next').isDisabled(), true, 'Next month stays disabled')
      await press(t, arrow(t, 'Previous'))
      assert.equal(await header(t).innerText(), plan.previousLabel)
      assert.equal(await arrow(t, 'Next').isDisabled(), false, 'Next month is enabled again')
    }],
    ['36.5 [GUARD] the month is not kept for another asset, a new visit or a reload', async t => {
      const plan = monthPlan(t.today), day = plan.days[0]
      await toMonth(t, plan)
      await fill(t, day)
      await suite.conflict(t, day)
      await t.submit({ conflict: true })
      const other = await suite.otherAsset(t)
      await t.page.evaluate(id => { location.hash = `/assets/${id}` }, other)
      await t.page.getByRole('heading', { name: 'Check availability', level: 2 }).waitFor()
      await t.page.locator('.availability-calendar').waitFor()
      assert.equal(await header(t).innerText(), currentMonth(t), 'a different asset starts on the current month')
      await t.page.evaluate(() => { location.hash = '/explore' })
      await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
      await t.page.evaluate(id => { location.hash = `/assets/${id}` }, t.assetId)
      await t.page.locator('.availability-calendar').waitFor()
      assert.equal(await header(t).innerText(), currentMonth(t), 're-entering the page starts on the current month')
      await toMonth(t, plan)
      await t.page.reload()
      await t.page.locator('.availability-calendar').waitFor()
      assert.equal(await header(t).innerText(), currentMonth(t), 'a reload starts on the current month')
    }],
    ['36.6 [FAIL-NOW] keyboard path: the retained month is reachable without pressing Next month', async t => {
      const plan = monthPlan(t.today), day = plan.days[1]
      await toMonth(t, plan)
      await fill(t, day)
      await t.submit({ success: true })
      await keepsMonth(t, plan, day, 'before the keyboard path')
      // Shift+Tab from the Start date field enters the calendar at its last enabled day.
      await t.page.locator('#detail-startDate').focus()
      await t.page.keyboard.press('Shift+Tab')
      const info = await activeInfo(t.page)
      assert.match(info.name, /^\d{4}-\d{2}-\d{2}: /, `Shift+Tab reaches a calendar day (${describeActive(info)})`)
      const picked = info.name.slice(0, 10)
      assert.ok(picked.startsWith(plan.month), `the day reached by keyboard (${picked}) belongs to the retained month ${plan.month}`)
      await t.page.keyboard.press('Enter')
      assert.equal(await t.page.locator('#detail-startDate').inputValue(), picked)
      assert.equal(await t.page.locator('#detail-endDate').inputValue(), picked)
      assert.ok((await t.page.locator('.range-summary').innerText()).includes(formatCalendarDate(picked)), 'the summary follows the selected day')
      const typed = plan.days[0]
      await t.dates(typed, typed, true)
      assert.ok((await t.page.locator('.range-summary').innerText()).includes(formatCalendarDate(typed)), 'typed dates still update the summary')
    }],
    ['36.7 [FAIL-NOW] "Retry availability" returns on the same month and focuses the panel heading', async t => {
      const plan = monthPlan(t.today), day = plan.days[1]
      await toMonth(t, plan)
      await fill(t, day)
      await t.page.route('**/api/v1/assets/*/availability', route => route.abort('connectionreset'))
      await pressRequest(t)
      const retry = t.page.getByRole('button', { name: 'Retry availability', exact: true })
      await retry.waitFor()
      assert.equal(await t.page.getByText('Could not refresh availability.').isVisible(), true)
      assert.match(await t.page.locator('.booking-form .success-notice').innerText(), /Pending approval/, 'the request itself succeeded')
      assert.equal(await t.page.locator('.availability-calendar').count(), 0, 'no calendar while availability is unknown')
      await t.page.unroute('**/api/v1/assets/*/availability')
      await press(t, retry)
      await keepsMonth(t, plan, day, 'after Retry availability')
      await settle(t.page)
      await assertFocus(t.page, { id: 'availability-heading', tag: 'H2', name: 'Check availability' }, 'after a successful retry')
      await assertNoOverflow(t.page, '36.8 after the retry')
    }, { modes: ['http'] }],
    ['36.7 [FAIL-NOW] a failing retry leaves focus on "Retry availability"', async t => {
      const plan = monthPlan(t.today), day = plan.days[1]
      await toMonth(t, plan)
      await fill(t, day)
      await t.page.route('**/api/v1/assets/*/availability', route => route.abort('connectionreset'))
      await pressRequest(t)
      const retry = t.page.getByRole('button', { name: 'Retry availability', exact: true })
      await retry.waitFor()
      await press(t, retry)
      await settle(t.page, 800)
      await retry.waitFor()
      await assertFocus(t.page, { tag: 'BUTTON', name: 'Retry availability' }, 'after a failing retry')
      await t.page.unroute('**/api/v1/assets/*/availability')
      await press(t, retry)
      await keepsMonth(t, plan, day, 'after the second retry')
    }, { modes: ['http'] }],
    ['36.9 [FAIL-NOW][MOCK] the simulated conflict keeps the month shown before the submit', async t => {
      const month = shiftMonth(t.today.slice(0, 7), 2), day = `${month}-10`
      const plan = { label: monthLabel(month), steps: 2 }
      await toMonth(t, plan)
      await fill(t, day)
      await suite.conflict(t, day)
      await t.submit({ conflict: true })
      await keepsMonth(t, plan, day, 'simulated conflict')
    }, { modes: ['mock'] }],
  ]
  defineCases(suite, cases)
}

// ---- #37: long unbroken equipment text on the asset detail page -------------------------------------------------------------

/** Every box of the asset detail page that holds coordinator-entered text, measured in one browser round trip. */
function measureDetail(page) {
  return page.evaluate(() => {
    const textBox = element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0)
      return rects.length ? { left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)) } : null
    }
    const main = document.querySelector('main')
    const info = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      const hidden = []
      for (let ancestor = element.parentElement; ancestor && ancestor !== main.parentElement; ancestor = ancestor.parentElement) {
        if (['hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX)) hidden.push(ancestor.className || ancestor.tagName)
      }
      return {
        left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height, text: textBox(element), display: style.display,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, textContent: element.textContent, textOverflow: style.textOverflow,
        fontSize: style.fontSize, overflowWrap: style.overflowWrap, hidden,
      }
    }
    return {
      doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, innerWidth },
      identity: info('.asset-identity'), panel: info('.availability-panel'), heading: info('.asset-heading'), h2: info('.asset-heading h2'),
      eyebrow: info('.asset-heading .eyebrow'), description: info('p.asset-description'),
      specs: [...document.querySelectorAll('.asset-specs dd')].map((_, index) => info(`.asset-specs > div:nth-child(${index + 1}) dd`)),
      action: info('.booking-form button[type=submit], .availability-panel a.button.primary.full'),
    }
  })
}

/**
 * The QA 37.1-37.8 and 37.12 assertions for one unit on the asset detail page. Guards run first so that a failing case on
 * an unfixed tree names the overflow and not one of the properties that never changed; `unit` is the stored record.
 */
async function assertDetail(t, unit, { student }) {
  const m = await measureDetail(t.page)
  const label = `${t.name.split(' ')[0]} ${t.width}px ${student ? 'student' : 'visitor'}`
  // 37.12 column classification: one column up to 1099 px, two from 1100 px.
  const twoColumns = m.panel.left >= m.identity.right - 0.5
  assert.equal(twoColumns, t.width >= TWO_COLUMN_FROM, `${label}: expected ${t.width >= TWO_COLUMN_FROM ? 'two columns' : 'one column'}`)
  // 37.6 complete text, never truncated.
  assert.equal(m.h2.textContent, unit.name, `${label}: name text is complete`)
  assert.equal(m.description.textContent, unit.description, `${label}: description text is complete`)
  assert.equal(m.eyebrow.textContent, `${unit.category} / ${unit.inventoryCode}`, `${label}: eyebrow text is complete`)
  assert.deepEqual(m.specs.map(spec => spec.textContent), [unit.inventoryCode, unit.category, unit.location], `${label}: spec values are complete`)
  for (const [name, box] of Object.entries({ h2: m.h2, description: m.description, eyebrow: m.eyebrow, ...Object.fromEntries(m.specs.map((spec, index) => [`spec ${index + 1}`, spec])) })) {
    assert.notEqual(box.textOverflow, 'ellipsis', `${label}: ${name} must not truncate with an ellipsis`)
    assert.deepEqual(box.hidden, [], `${label}: ${name} has an ancestor that clips horizontally`)
  }
  // 37.7 sizes are the design-system sizes (wrap, never shrink).
  assert.equal(m.h2.fontSize, t.width <= 600 ? '28px' : '30px', `${label}: heading size`)
  assert.equal(m.description.fontSize, '15px', `${label}: description size`)
  // 37.8 the primary action stays reachable.
  assert.equal(m.action.textContent.trim(), student ? 'Request equipment' : 'Sign in to request equipment')
  assert.ok(m.action.height >= 44 && m.action.left >= 0 && m.action.right <= m.doc.innerWidth, `${label}: primary action ${JSON.stringify({ height: m.action.height, left: m.action.left, right: m.action.right })}`)
  // 37.1-37.4: no page overflow, and every text box stays in its own box and column and clear of the booking panel.
  assert.equal(m.doc.scrollWidth, m.doc.clientWidth, `${label}: horizontal page overflow ${JSON.stringify(m.doc)}`)
  const boxes = { heading: m.heading, h2: m.h2, description: m.description, eyebrow: m.eyebrow, ...Object.fromEntries(m.specs.map((spec, index) => [`spec ${index + 1}`, spec])) }
  for (const [name, box] of Object.entries(boxes)) {
    if (box.display !== 'inline') assert.ok(box.scrollWidth <= box.clientWidth, `${label}: ${name} content spills its own box (${box.scrollWidth} wide in ${box.clientWidth})`)
    assert.ok(box.text.right <= m.identity.right + 0.5, `${label}: ${name} text reaches ${Math.round(box.text.right)} past the column edge ${Math.round(m.identity.right)}`)
    if (twoColumns) assert.ok(box.text.right <= m.panel.left, `${label}: ${name} text overlaps the booking panel (${Math.round(box.text.right)} > ${Math.round(m.panel.left)})`)
  }
  return m
}

/** The rows of QA's data matrix; `unit` may be a function of the case serial so unique values can be built. */
const DETAIL_ROWS = [
  ['37.1', 'FAIL-NOW', 'description "Manual: " + an 80-character URL', () => ({ description: LONG.manualUrl80() })],
  ['37.2', 'FAIL-NOW', 'name of 40 x a', () => ({ name: 'a'.repeat(40) })],
  ['37.3', 'FAIL-NOW', 'name of 30 x a', () => ({ name: 'a'.repeat(30) })],
  ['37.4', 'FAIL-NOW', 'name of 100 x W', () => ({ name: 'W'.repeat(100) })],
  ['37.4', 'FAIL-NOW', 'description of "Manual: https://docs.example.org/" + 470 x a', () => ({ description: LONG.manualUrl470() })],
  ['37.4', 'FAIL-NOW', 'description of 2000 x a', () => ({ description: 'a'.repeat(2000) })],
  ['37.5', 'GUARD', 'code of 30 x W, location of 100 x W and a 2000-character description with spaces', n => ({ inventoryCode: `${'W'.repeat(26)}${String(1000 + n).slice(-4)}`, location: 'W'.repeat(100), description: LONG.spacedDescription2000().trim() })],
]

export function issue37(suite) {
  const cases = []
  for (const [id, tag, title, unit] of DETAIL_ROWS) {
    for (const student of [false, true]) {
      cases.push([`${id} [${tag}] ${title} (${student ? 'student' : 'visitor'})`, async t => { await assertDetail(t, t.unit, { student }) }, { unit, signedIn: student, widths: WRAP_WIDTHS, modes: ['http'] }])
    }
  }
  // 37.10: the mock repeats 37.1, 37.2 and 37.4 with units added through its Inventory form (signed in as the coordinator).
  for (const [id, , title, unit] of DETAIL_ROWS.filter(([id, , title]) => ['37.1', '37.2'].includes(id) || title.startsWith('name of 100'))) {
    cases.push([`37.10 [FAIL-NOW][MOCK] ${id} ${title}`, async t => { await assertDetail(t, t.unit, { student: true }) }, { unit, widths: [390, 1440], modes: ['mock'] }])
  }
  cases.push(['37.9 [GUARD] the nine catalogue and staff screens keep the long unit inside the page (asset detail is the fix)', async t => {
    const failures = await sweep(t, suite)
    assert.deepEqual(failures, [], `screens that overflow or clip at ${t.width}px:\n${failures.join('\n')}`)
  }, { unit: () => ({ name: 'W'.repeat(100), description: LONG.manualUrl470() }), widths: [390, 768, 1100, 1440], as: 'coordinator', modes: ['http'] }])
  // Found by the sweep and filed as #44: the Explore card clips a long unbroken name and location. Reported, not hidden.
  cases.push(['37.9 [TODO #44] the Explore card shows a 100 x W name and location without clipping', async t => {
    await t.page.evaluate(() => { location.hash = '/explore' })
    await t.page.locator('a.equipment-card').first().waitFor()
    await settle(t.page, 250)
    assert.deepEqual([...new Set(await clippedLongText(t.page, 'WWWWWWWWWWWWWWWWWWWW'))], [], 'Explore card text is clipped by the card')
  }, { unit: () => ({ name: 'W'.repeat(100), location: 'W'.repeat(100) }), widths: [390, 1440], modes: ['http'], todo: '#44 the Explore card clips long unbroken names and locations' }])
  defineCases(suite, cases)
}

/**
 * Text of the long unbroken test strings that is visible and runs past the viewport or past the clipping box of an
 * ancestor (`overflow: hidden|clip|auto|scroll`): the "clipped text" half of the sweep, which `scrollWidth` cannot see.
 */
function clippedLongText(page, marker) {
  return page.evaluate(token => {
    const found = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.includes(token)) continue
      const element = node.parentElement
      if (element.closest('.sr-only') || !element.checkVisibility()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0)
      if (!rects.length) continue
      const right = Math.max(...rects.map(rect => rect.right))
      let limit = innerWidth, limiter = 'the viewport'
      for (let ancestor = element; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        if (/(hidden|clip|auto|scroll)/.test(getComputedStyle(ancestor).overflowX)) {
          const edge = ancestor.getBoundingClientRect().right
          if (edge < limit) { limit = edge; limiter = `${ancestor.tagName.toLowerCase()}.${ancestor.className}` }
        }
      }
      if (right > limit + 0.5) found.push(`${element.tagName.toLowerCase()}.${element.className || '-'} text reaches ${Math.round(right)} but ${limiter} ends at ${Math.round(limit)}`)
    }
    return found
  }, marker)
}

/** QA 37.9: nine of the twelve screens (My reservations, its details and History belong to #38) with the long unit in them. */
async function sweep(t, suite) {
  const { page } = t
  const marker = 'WWWWWWWWWWWWWWWWWWWW'
  const failures = []
  const check = async (screen, ready, { clipping = true } = {}) => {
    await ready()
    await settle(page, 250)
    const sizes = await overflowInfo(page)
    if (sizes.scrollWidth !== sizes.clientWidth) failures.push(`${screen}: page scrolls sideways (${sizes.scrollWidth} > ${sizes.clientWidth})`)
    if (clipping) for (const clipped of new Set(await clippedLongText(page, marker))) failures.push(`${screen}: ${clipped}`)
  }
  const seeded = await suite.seedDesk(t)
  const go = hash => page.evaluate(next => { location.hash = next }, hash)
  const view = name => page.locator('#desk-views').getByRole('button', { name: new RegExp(`^${name}`) })
  // Explore's card clips long names and locations (#44); the clipping has its own todo case, the page overflow stays here.
  await check('Explore', async () => { await go('/explore'); await page.locator('a.equipment-card').first().waitFor() }, { clipping: false })
  await check('Desk queue (Pending requests)', async () => { await go('/desk'); await page.locator(`#review-${seeded.pending}`).waitFor() })
  await check('Pickups', async () => { await view('Pickups').click(); await page.locator(`#review-${seeded.approved}`).waitFor() })
  await check('Check-out form', async () => {
    await page.locator(`#review-${seeded.approved}`).click()
    await page.getByRole('button', { name: 'Check out equipment', exact: true }).click()
    await page.locator('form.staff-action-form').waitFor()
  })
  await check('Booking detail (pending request)', async () => {
    await go('/explore'); await go('/desk')
    await page.locator(`#review-${seeded.pending}`).click()
    await page.getByRole('heading', { name: 'Manage reservation', exact: true }).waitFor()
  })
  await check('History detail', async () => {
    await page.getByRole('button', { name: '← Back to queues', exact: true }).click()
    await view('History').click()
    await page.locator(`#review-${seeded.returned}`).click()
    await page.getByRole('heading', { name: 'Manage reservation', exact: true }).waitFor()
  })
  await check('Inventory', async () => { await go('/inventory'); await page.locator(`#edit-${t.assetId}`).waitFor() })
  await check('Inventory editor', async () => { await page.locator(`#edit-${t.assetId}`).click(); await page.getByRole('heading', { name: 'Edit equipment details', exact: true }).waitFor() })
  await check('Asset detail', async () => { await go(`/assets/${t.assetId}`); await page.getByRole('heading', { name: 'Check availability', level: 2 }).waitFor() })
  suite.records.push({ width: t.width, case: '37.9 sweep', failures })
  return failures
}

// ====================================================================================================================
// PART B SECTIONS: #33, #34, #35, #39, #40, #41, #43, #42
// ====================================================================================================================

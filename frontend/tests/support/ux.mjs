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

// ---- part B helpers: focus landings, activation, failure injection ---------------------------------------------------------

/** Landing assertion bound to a suite: waits the QA settle time (request finished plus 400 ms), then checks `document.activeElement`. */
export const landing = (suite) => async (t, expected, label) => {
  await settle(t.page)
  return assertFocus(t.page, expected, `${label} (${suite.mode} @${t.width})`)
}

/** Installs a `focusin` counter keyed by element id (read with `focusins`). Call it before the action under test. */
export const countFocusins = (page) => page.evaluate(() => {
  window.__focusIns = {}
  document.addEventListener('focusin', (event) => { const key = event.target.id || event.target.tagName; window.__focusIns[key] = (window.__focusIns[key] ?? 0) + 1 })
})
export const focusins = (page, key) => page.evaluate((key) => window.__focusIns?.[key] ?? 0, key)

/**
 * Activates a control the way the QA cases do: 'enter' and 'space' put keyboard focus on it first and press the key,
 * 'pointer' is a real mouse click. Returns after the key or click event was dispatched, not after anything settled.
 */
export async function activate(page, locator, how = 'enter') {
  if (how === 'pointer') return locator.click()
  await locator.focus()
  await page.keyboard.press(how === 'space' ? 'Space' : 'Enter')
}
export const HOWS = ['enter', 'space', 'pointer']

/**
 * Failure injection on a route glob: kind 'abort' (lost connection), '500' (fulfilled server error) or 'pass' (only delay).
 * `method` limits it to one HTTP method, `delay` waits first. Undo with `page.unroute(pattern)`.
 */
export function inject(page, pattern, kind, { method, delay = 0 } = {}) {
  return page.route(pattern, async (route) => {
    if (method && route.request().method() !== method) return route.fallback()
    if (delay) await pause(delay)
    if (kind === 'abort') return route.abort('connectionreset')
    if (kind === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Internal server error.' }) })
    return route.fallback()
  })
}

/** Polls `read()` until it returns something truthy (page-side counters, request sinks). */
export async function until(read, label, timeout = 8000) {
  const limit = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() > limit) throw new Error(`timed out waiting for ${label}`)
    await pause(50)
  }
}
export const gets = (t, url) => t.sink.requests.filter((request) => request.method === 'GET' && request.url === url).length
export const posts = (t, url) => t.sink.requests.filter((request) => request.method === 'POST' && request.url === url).length

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

// ---- #38: long unbroken equipment names on My reservations ------------------------------------------------------------------

export const LIST_WIDTHS = [390, 768, 1100, 1440]

/** Rows, their text boxes and the details panel of My reservations in one browser round trip. */
function measureReservations(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const textRight = element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0)
      return rects.length ? Math.max(...rects.map(rect => rect.right)) : null
    }
    const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height } }
    const hiddenAncestors = element => {
      const found = []
      for (let ancestor = element.parentElement; ancestor && ancestor !== main.parentElement; ancestor = ancestor.parentElement) {
        if (['hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX)) found.push(ancestor.className || ancestor.tagName)
      }
      return found
    }
    const heading = element => ({ ...box(element), textRight: textRight(element), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, textContent: element.textContent, textOverflow: getComputedStyle(element).textOverflow, hidden: hiddenAncestors(element) })
    const detail = document.querySelector('section.reservation-detail')
    return {
      doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, innerWidth },
      rows: [...document.querySelectorAll('.reservation-row')].map(row => {
        const button = row.querySelector('button')
        return {
          row: box(row), direction: getComputedStyle(row).flexDirection, h3: heading(row.querySelector('h3')),
          button: { ...box(button), name: button.textContent },
          lines: [...row.querySelectorAll('p, .availability-badge')].map(element => ({ ...box(element), text: element.textContent })),
        }
      }),
      detail: detail ? { ...box(detail), h3: heading(detail.querySelector(':scope > h3')) } : null,
      notices: [...document.querySelectorAll('.success-notice, .service-notice')].map(element => ({ ...box(element), text: element.textContent.slice(0, 60) })),
    }
  })
}

const openReservations = async (t, { history = false } = {}) => {
  await t.page.evaluate(() => { location.hash = '/reservations' })
  await t.page.getByRole('heading', { name: 'Plan. Collect. Create.', level: 2 }).waitFor()
  if (history) await t.page.getByRole('button', { name: 'History', exact: true }).click()
  await t.page.locator('.reservation-row').first().waitFor()
  await settle(t.page, 250)
}

/** QA 38.1-38.3, 38.5 and 38.7: every row stays inside the viewport and wraps its full name. */
async function assertRows(t, name, label) {
  const m = await measureReservations(t.page)
  // The real stack student has exactly this reservation; the mock's maya_student also has seeded ones, which must fit too.
  const own = m.rows.filter(row => row.h3.textContent === name)
  assert.equal(own.length, 1, `${label}: exactly one row shows the complete name "${name.slice(0, 12)}..." (rows: ${m.rows.map(row => row.h3.textContent.slice(0, 12)).join(', ')})`)
  for (const row of own) {
    // 38.7 complete names, no ellipsis, no clipping ancestor (first, they are guards).
    assert.notEqual(row.h3.textOverflow, 'ellipsis', `${label}: no ellipsis`)
    assert.deepEqual(row.h3.hidden, [], `${label}: no clipping ancestor`)
  }
  assert.equal(m.doc.scrollWidth, m.doc.clientWidth, `${label}: horizontal page overflow ${JSON.stringify(m.doc)}`)
  for (const row of m.rows) {
    assert.ok(row.row.left >= -0.5 && row.row.right <= m.doc.innerWidth + 0.5, `${label}: row ${Math.round(row.row.left)}-${Math.round(row.row.right)} leaves the ${m.doc.innerWidth}px viewport`)
    assert.ok(row.h3.scrollWidth <= row.h3.clientWidth, `${label}: the name spills its own box (${row.h3.scrollWidth} in ${row.h3.clientWidth})`)
    assert.ok(row.h3.textRight <= row.row.right, `${label}: the name runs to ${Math.round(row.h3.textRight)} past the row edge ${Math.round(row.row.right)}`)
  }
  return m
}

const LIST_ROWS = [
  ['38.1', 'FAIL-NOW', 'name of 40 x a', { name: 'a'.repeat(40) }],
  ['38.2', 'FAIL-NOW', 'name of 100 x W', { name: 'W'.repeat(100) }],
  ['38.3', 'GUARD', 'name of 30 x a', { name: 'a'.repeat(30) }],
  ['38.3', 'GUARD', 'normal-length name', { name: 'Normal Camera Body' }],
]

export function issue38(suite) {
  const longRows = LIST_ROWS.filter(([id]) => id !== '38.3')
  const cases = []
  for (const [id, tag, title, unit] of LIST_ROWS) {
    cases.push([`${id} [${tag}] Upcoming: ${title}`, async t => { await openReservations(t); await assertRows(t, unit.name, id) }, { unit, reserve: true, widths: LIST_WIDTHS, modes: ['http'] }])
  }
  for (const [, , title, unit] of longRows) {
    cases.push([`38.4 [FAIL-NOW] View details stays reachable and the row facts stay visible: ${title}`, async t => {
      await openReservations(t)
      await t.page.locator('#main-content').focus()
      const button = t.page.getByRole('button', { name: `View details for ${unit.name}`, exact: true })
      let reached = false
      for (let presses = 0; presses < 20 && !reached; presses++) {
        await t.page.keyboard.press('Tab')
        reached = await button.evaluate(element => element === document.activeElement)
      }
      assert.equal(reached, true, '"View details" is reachable by Tab from the page heading')
      const m = await measureReservations(t.page)
      const row = m.rows.find(candidate => candidate.h3.textContent === unit.name)
      assert.ok(row.button.left >= -0.5 && row.button.right <= m.doc.innerWidth + 0.5 && row.button.height >= 44, `"View details" ${JSON.stringify(row.button)} is inside the ${m.doc.innerWidth}px viewport and 44 px high`)
      assert.equal(row.lines.length, 3, 'date range, status badge and cancellation hint are shown')
      for (const line of row.lines) assert.ok(line.left >= -0.5 && line.right <= m.doc.innerWidth + 0.5, `"${line.text}" stays inside the viewport`)
      assert.match(row.lines.map(line => line.text).join(' '), /pending/)
      assert.match(row.lines.map(line => line.text).join(' '), /Cancellation available in details\./)
    }, { unit, reserve: true, widths: LIST_WIDTHS, modes: ['http'] }])
    cases.push([`38.5 [FAIL-NOW] History tab: ${title}`, async t => {
      await openReservations(t, { history: true })
      const m = await assertRows(t, unit.name, '38.5')
      assert.match(m.rows[0].lines.map(line => line.text).join(' '), /cancelled/)
    }, { unit, reserve: 'cancelled', widths: LIST_WIDTHS, modes: ['http'] }])
    cases.push([`38.6 [FAIL-NOW] details panel: ${title}`, async t => {
      await openReservations(t)
      await t.page.getByRole('button', { name: `View details for ${unit.name}`, exact: true }).click()
      await t.page.locator('section.reservation-detail').waitFor()
      await settle(t.page, 250)
      const m = await measureReservations(t.page)
      assert.equal(m.detail.h3.textContent, unit.name, 'the panel name is complete')
      assert.ok(m.detail.left >= -0.5 && m.detail.right <= m.doc.innerWidth + 0.5, `the details panel stays inside the ${m.doc.innerWidth}px viewport`)
      assert.ok(m.detail.h3.scrollWidth <= m.detail.h3.clientWidth && m.detail.h3.textRight <= m.detail.right, 'the panel name wraps without spilling')
      assert.equal(m.doc.scrollWidth, m.doc.clientWidth, `horizontal page overflow ${JSON.stringify(m.doc)}`)
      assert.deepEqual(await clippedLongText(t.page, unit.name.slice(0, 20)), [], 'no long text clipped')
    }, { unit, reserve: true, widths: LIST_WIDTHS, modes: ['http'] }])
  }
  // 38.8: the failure and success notices above a long-name list keep inside the viewport (390 px as in QA, and 1440 px).
  cases.push(['38.8 [GUARD] notices above a long-name list fit the viewport', async t => {
    const unit = t.unit
    await openReservations(t)
    await t.page.getByRole('button', { name: `View details for ${unit.name}`, exact: true }).click()
    await t.page.getByRole('button', { name: 'Cancel reservation', exact: true }).waitFor()
    await t.page.route('**/api/v1/bookings/*/cancel', route => route.abort('connectionreset'))
    await t.page.getByRole('button', { name: 'Cancel reservation', exact: true }).click()
    const retry = t.page.getByRole('button', { name: 'Retry reservations', exact: true })
    await retry.waitFor()
    await settle(t.page, 250)
    let m = await measureReservations(t.page)
    assert.ok(m.notices.length >= 1 && m.notices.every(notice => notice.left >= -0.5 && notice.right <= m.doc.innerWidth + 0.5), `retry alert ${JSON.stringify(m.notices)} fits the ${m.doc.innerWidth}px viewport`)
    await t.page.unroute('**/api/v1/bookings/*/cancel')
    await t.page.getByRole('button', { name: 'Cancel reservation', exact: true }).click()
    await t.page.getByText('Reservation cancelled. The dates have been released.').waitFor()
    await settle(t.page, 250)
    m = await measureReservations(t.page)
    assert.ok(m.notices.length >= 1 && m.notices.every(notice => notice.left >= -0.5 && notice.right <= m.doc.innerWidth + 0.5), `success notice ${JSON.stringify(m.notices)} fits the ${m.doc.innerWidth}px viewport`)
  }, { unit: { name: 'W'.repeat(100) }, reserve: true, widths: [390, 1440], modes: ['http'] }])
  // 38.9: the control row keeps its layout: side by side from 601 px, stacked up to 600 px.
  cases.push(['38.9 [GUARD] the normal-name row is side by side from 601 px and stacked up to 600 px', async t => {
    await openReservations(t)
    const m = await measureReservations(t.page)
    const [row] = m.rows
    const stacked = t.width <= 600
    assert.equal(row.direction, stacked ? 'column' : 'row', `flex-direction at ${t.width}px`)
    if (stacked) assert.ok(row.button.top >= row.h3.bottom, `the button (top ${Math.round(row.button.top)}) is below the name (bottom ${Math.round(row.h3.bottom)})`)
    else assert.ok(row.button.left >= row.h3.right - 0.5 && row.button.top < Math.max(...row.lines.map(line => line.bottom)), `the button (left ${Math.round(row.button.left)}) sits beside the text (right ${Math.round(row.h3.right)})`)
    assert.ok(row.button.height >= 44 && row.button.left >= row.row.left && row.button.right <= row.row.right, 'the 44 px button is inside the row')
    assert.equal(m.doc.scrollWidth, m.doc.clientWidth)
  }, { unit: { name: 'Normal Camera Body' }, reserve: true, widths: [390, 600, 601, 1440], modes: ['http'] }])
  // 38.10: the coordinator desk still wraps the same name (guard; the desk was never affected).
  cases.push(['38.10 [GUARD] coordinator desk row and booking detail keep a 100 x W name inside the page', async t => {
    const desk = await suite.coordinatorPage(t)
    try {
      await desk.goto(`${suite.base}/#/desk`)
      await desk.locator(`#review-${t.booking.id}`).waitFor()
      await settle(desk, 250)
      assert.deepEqual(await overflowInfo(desk).then(sizes => sizes.scrollWidth === sizes.clientWidth), true, 'desk queue overflows')
      assert.deepEqual(await clippedLongText(desk, 'WWWWWWWWWWWWWWWWWWWW'), [], 'desk queue clips text')
      await desk.locator(`#review-${t.booking.id}`).click()
      await desk.getByRole('heading', { name: 'Manage reservation', exact: true }).waitFor()
      await settle(desk, 250)
      assert.deepEqual(await overflowInfo(desk).then(sizes => sizes.scrollWidth === sizes.clientWidth), true, 'booking detail overflows')
      assert.deepEqual(await clippedLongText(desk, 'WWWWWWWWWWWWWWWWWWWW'), [], 'booking detail clips text')
    } finally { await desk.context().close() }
  }, { unit: { name: 'W'.repeat(100) }, reserve: true, widths: LIST_WIDTHS, modes: ['http'] }])
  // 38.11: the mock repeats 38.1 and 38.2 at 390 and 1440 px (units added through the Inventory form, requested as maya_student).
  for (const [id, , title, unit] of longRows) {
    cases.push([`38.11 [FAIL-NOW][MOCK] ${id} Upcoming: ${title}`, async t => { await openReservations(t); await assertRows(t, unit.name, '38.11') }, { unit, reserve: true, widths: [390, 1440], modes: ['mock'] }])
  }
  defineCases(suite, cases)
}

// ====================================================================================================================
// PART B SECTIONS: #33, #34, #35, #39, #40, #41, #43, #42
// ====================================================================================================================

// ---- #43: Retry detail on the asset detail load error ----------------------------------------------------------------------

const MAIN_HEADING = { id: 'main-content', tag: 'H1' }

export function issue43(suite) {
  const landed = landing(suite)
  const RETRY = { tag: 'BUTTON', name: 'Retry detail' }
  const calls = { asset: (t) => `**/api/v1/assets/${t.assetId}`, availability: (t) => `**/api/v1/assets/${t.assetId}/availability` }
  const path = { asset: (t) => `/api/v1/assets/${t.assetId}`, availability: (t) => `/api/v1/assets/${t.assetId}/availability` }
  const alertHeading = (t) => t.page.getByRole('heading', { name: 'Could not load this equipment.', level: 2 })
  const retryButton = (t) => t.page.getByRole('button', { name: 'Retry detail', exact: true })
  const loaded = (t) => t.page.getByRole('heading', { name: 'Check availability', level: 2 }).waitFor()
  /** Opens the detail page with one of its two calls failing: the load-error section with "Retry detail" and "Back to Explore". */
  const openFailing = async (t, which, kind) => {
    await inject(t.page, calls[which](t), kind)
    await t.page.reload()
    await alertHeading(t).waitFor()
    await retryButton(t).waitFor()
    await t.page.getByRole('link', { name: 'Back to Explore', exact: true }).waitFor()
  }
  /** Activates "Retry detail" and returns after the retry request was sent (the page is not settled yet). */
  const retry = async (t, which, how) => {
    const before = gets(t, path[which](t))
    await activate(t.page, retryButton(t), how)
    await until(() => gets(t, path[which](t)) > before, 'the retried request')
  }
  const cases = []
  for (const [which, success, failing] of [['asset', '43.1', '43.2'], ['availability', '43.3', '43.3']]) {
    cases.push([`${success} [FAIL-NOW] success after a failed ${which} call lands on the page heading`, async (t) => {
      await openFailing(t, which, 'abort')
      await t.page.unroute(calls[which](t))
      await retry(t, which, 'enter')
      await loaded(t)
      await landed(t, { ...MAIN_HEADING, name: 'Equipment detail' }, `${which} call restored`)
    }, { modes: ['http'] }])
    for (const kind of ['abort', '500']) {
      cases.push([`${failing} [FAIL-NOW] a retry that fails again (${which} call ${kind === 'abort' ? 'still aborted' : 'answered 500'}) lands on "Retry detail"`, async (t) => {
        await openFailing(t, which, 'abort')
        if (kind === '500') { await t.page.unroute(calls[which](t)); await inject(t.page, calls[which](t), '500') }
        await retry(t, which, 'enter')
        await landed(t, RETRY, `${which} retry fails again (${kind})`)
        assert.equal(await alertHeading(t).count(), 1, 'the alert is shown again')
        assert.equal(await retryButton(t).isEnabled(), true, 'the Retry detail button is enabled')
        // A further Enter, without touching the focus, retries once more and sends exactly one more request.
        const before = gets(t, path[which](t))
        await t.page.keyboard.press('Enter')
        await until(() => gets(t, path[which](t)) > before, 'one more request')
        await landed(t, RETRY, 'second retry fails again')
        assert.equal(gets(t, path[which](t)), before + 1, 'exactly one more request')
      }, { modes: ['http'] }])
    }
  }
  for (const how of ['space', 'pointer']) {
    for (const which of ['asset', 'availability']) {
      cases.push([`43.4 [FAIL-NOW] ${how} on "Retry detail" (${which} call): success and failing again`, async (t) => {
        await openFailing(t, which, 'abort')
        await retry(t, which, how)
        await landed(t, RETRY, `${how}: fails again`)
        await t.page.unroute(calls[which](t))
        await retry(t, which, how)
        await loaded(t)
        await landed(t, { ...MAIN_HEADING, name: 'Equipment detail' }, `${how}: success`)
      }, { modes: ['http'] }])
    }
  }
  cases.push(['43.5 [FAIL-NOW] one landing on the heading, no pull-back, Tab, Shift+Tab and typing move focus normally', async (t) => {
    await openFailing(t, 'asset', 'abort')
    await t.page.unroute(calls.asset(t))
    await countFocusins(t.page)
    await retry(t, 'asset', 'enter')
    await loaded(t)
    await landed(t, { ...MAIN_HEADING, name: 'Equipment detail' }, 'landing')
    assert.equal(await focusins(t.page, 'main-content'), 1, 'exactly one focusin on the heading')
    await t.page.keyboard.press('Tab')
    await pause(1000)
    const tabbed = await activeInfo(t.page)
    assert.ok(!tabbed.isBody && tabbed.id !== 'main-content', `Tab moved on (${describeActive(tabbed)})`)
    await t.page.keyboard.press('Shift+Tab')
    await pause(1000)
    const back = await activeInfo(t.page)
    assert.ok(!back.isBody && back.id !== 'main-content', `Shift+Tab moved normally (${describeActive(back)})`)
    await t.page.locator('#booking-purpose').focus()
    await t.page.keyboard.type('typing works')
    await pause(1000)
    assert.equal(await t.page.locator('#booking-purpose').inputValue(), 'typing works')
    await assertFocus(t.page, { id: 'booking-purpose' }, 'typing keeps focus where it is')
    assert.equal(await focusins(t.page, 'main-content'), 1, 'no rerender pulled focus back to the heading')
  }, { modes: ['http'] }])
  cases.push(['43.6 [GUARD] navigating away while the retry is pending does not steal focus on the new page', async (t) => {
    await openFailing(t, 'asset', 'abort')
    await t.page.unroute(calls.asset(t))
    await inject(t.page, calls.asset(t), 'pass', { delay: 1500 })
    await activate(t.page, retryButton(t), 'enter')
    await t.page.getByText('Loading equipment and calendar…').waitFor()
    await t.page.evaluate(() => { location.hash = '/reservations' })
    await t.page.getByRole('heading', { name: 'My reservations', level: 1 }).waitFor()
    await pause(2200) // the delayed call finishes while the new page is shown
    await assertFocus(t.page, { ...MAIN_HEADING, name: 'My reservations' }, 'no steal on the new page')
  }, { modes: ['http'] }])
  cases.push(['43.7 [GUARD] "Equipment not found." has no Retry, route changes still focus the heading', async (t) => {
    await t.page.evaluate(() => { location.hash = '/explore' })
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await t.page.evaluate(() => { location.hash = '/assets/does-not-exist-123' })
    await t.page.getByRole('heading', { name: 'Equipment not found.', level: 2 }).waitFor()
    assert.equal(await retryButton(t).count(), 0, 'no Retry detail button for a missing id')
    assert.equal(await t.page.getByRole('link', { name: 'Back to Explore', exact: true }).count(), 1)
    await landed(t, { ...MAIN_HEADING, name: 'Equipment detail' }, 'not found')
    await t.page.evaluate(() => { location.hash = '/explore' })
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await t.page.evaluate((id) => { location.hash = `/assets/${id}` }, t.assetId)
    await loaded(t)
    await landed(t, { ...MAIN_HEADING, name: 'Equipment detail' }, 'route change to a working detail page')
  }, { modes: ['http'] }])
  cases.push(['43.8 [GUARD] "Retry availability" after a request stays; "Retry detail" is not shown', async (t) => {
    await t.dates(t.day, t.day)
    await t.purpose(purpose)
    await inject(t.page, calls.availability(t), 'abort')
    await pressRequest(t)
    await t.page.getByText('Could not refresh availability.').waitFor()
    assert.equal(await t.page.getByRole('button', { name: 'Retry availability', exact: true }).count(), 1)
    assert.equal(await retryButton(t).count(), 0, 'Retry detail is not shown')
  }, { modes: ['http'] }])
  cases.push(['43.9 [GUARD] the error state has no overflow and both controls are 44 px high inside the viewport', async (t) => {
    await openFailing(t, 'asset', 'abort')
    await assertNoOverflow(t.page, 'error state')
    for (const control of [retryButton(t), t.page.getByRole('link', { name: 'Back to Explore', exact: true })]) {
      const box = await geometry(control)
      assert.ok(box.height >= 44 - 0.5, `${box.text.trim()} is ${box.height}px high`)
      assert.ok(box.left >= 0 && box.right <= box.innerWidth, `${box.text.trim()} ${Math.round(box.left)}-${Math.round(box.right)} is inside the ${box.innerWidth}px viewport`)
    }
  }, { modes: ['http'] }])
  cases.push(['43.11 [FAIL-NOW][MOCK] Error fixture: Retry detail fails again and focus stays on "Retry detail" (keyboard and pointer)', async (t) => {
    await t.page.goto(`${suite.base}/#/explore`)
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await t.page.locator('details.demo-controls summary').click()
    await t.page.locator('#demo-scenario').selectOption('error')
    await t.page.evaluate(() => { location.hash = '/assets/camera-01' })
    await alertHeading(t).waitFor()
    for (const how of ['enter', 'pointer']) {
      await activate(t.page, retryButton(t), how)
      // The mock answers after 250 ms: settled means the loading state came and the error section is back.
      await t.page.getByText('Loading equipment and calendar…').waitFor()
      await alertHeading(t).waitFor()
      await landed(t, RETRY, `mock Error fixture, ${how}`)
      assert.equal(await alertHeading(t).count(), 1, 'the alert is shown again')
      assert.match(await t.page.getByRole('alert').filter({ has: alertHeading(t) }).innerText(), /The demo service is unavailable\. Try again or choose the Normal fixture\./)
    }
  }, { modes: ['mock'], bare: true }])
  defineCases(suite, cases)
}

// ---- #33: My reservations, View details and Cancel reservation ---------------------------------------------------------------

export function issue33(suite) {
  const http = suite.mode === 'http'
  const landed = landing(suite)
  const HEADING = { id: 'reservation-detail-title', tag: 'H2', name: 'Reservation details' }
  const PAGE_HEADING = { id: 'main-content', tag: 'H1', name: 'My reservations' }
  const CANCEL = { tag: 'BUTTON', name: 'Cancel reservation' }
  const UNIT = { name: 'Directional Microphone' }
  const cancelPath = (t) => `/api/v1/bookings/${t.booking.id}/cancel`
  const view = (t, name = t.unit.name) => t.page.getByRole('button', { name: `View details for ${name}`, exact: true })
  const cancelButton = (t) => t.page.getByRole('button', { name: 'Cancel reservation', exact: true })
  const panel = (t) => t.page.locator('section.reservation-detail')
  const opened = (t, name) => t.page.locator('section.reservation-detail > h3', { hasText: name })
  const open = async (t) => {
    await t.page.evaluate(() => { location.hash = '/reservations' })
    await t.page.locator('.reservation-row').first().waitFor()
    await settle(t.page, 200)
  }
  const openDetails = async (t, how = 'enter', name = t.unit.name) => {
    await activate(t.page, view(t, name), how)
    await opened(t, name).waitFor()
  }
  const cancelled = async (t, how = 'enter') => {
    await activate(t.page, cancelButton(t), how)
    await t.page.getByText('Reservation cancelled. The dates have been released.').waitFor()
  }
  const cases = [
    ['33.1 [FAIL-NOW] View details lands on the details heading and the next Tab reaches "Cancel reservation"', async (t) => {
      await open(t)
      await openDetails(t)
      await landed(t, HEADING, 'View details')
      assert.equal(await t.page.locator('#reservation-detail-title').getAttribute('tabindex'), '-1', 'the heading is focusable but not a tab stop')
      await t.page.keyboard.press('Tab')
      await assertFocus(t.page, CANCEL, 'the next Tab')
    }, { unit: UNIT, reserve: true, modes: ['http'] }],
    ['33.2 [FAIL-NOW] switching to another booking moves focus to the new panel heading', async (t) => {
      const other = await suite.newUnit({ name: 'Second Camera Body' })
      await suite.book(t, other.id, 12)
      await open(t)
      await openDetails(t)
      await landed(t, HEADING, 'first booking')
      await openDetails(t, 'enter', 'Second Camera Body')
      await landed(t, HEADING, 'second booking')
      assert.equal(await opened(t, 'Second Camera Body').count(), 1, 'the panel shows the other booking')
      assert.equal(await panel(t).count(), 1, 'one panel')
    }, { unit: UNIT, reserve: true, modes: ['http'] }],
    ['33.3 [FAIL-NOW] cancel success lands on the details heading, one request under a double Enter, booking moves to History', async (t) => {
      await open(t)
      await openDetails(t)
      await activate(t.page, cancelButton(t), 'enter')
      await t.page.keyboard.press('Enter')
      await t.page.getByText('Reservation cancelled. The dates have been released.').waitFor()
      await landed(t, HEADING, 'cancel success')
      assert.equal(await t.page.locator('.success-notice[role="status"]').count(), 1, 'the status message keeps role=status')
      assert.equal(await panel(t).locator('p strong').first().innerText(), 'cancelled')
      assert.ok(await panel(t).locator('.event-timeline li').filter({ hasText: 'cancel' }).count() >= 1, 'the event history lists the cancellation')
      assert.equal(await t.page.locator('.reservation-row', { hasText: t.unit.name }).count(), 0, 'gone from Upcoming')
      assert.equal(posts(t, cancelPath(t)), 1, 'exactly one cancel request')
      await activate(t.page, t.page.getByRole('button', { name: 'History', exact: true }), 'enter')
      await t.page.locator('.reservation-row', { hasText: t.unit.name }).waitFor()
    }, { unit: UNIT, reserve: true, modes: ['http'] }],
    ['33.4 [FAIL-NOW] cancel failure (a) lost connection (b) stale 409 leaves focus on "Cancel reservation"', async (t) => {
      await open(t)
      await openDetails(t)
      await inject(t.page, '**/api/v1/bookings/*/cancel', 'abort', { method: 'POST' })
      await activate(t.page, cancelButton(t), 'enter')
      await t.page.getByRole('alert').waitFor()
      await landed(t, CANCEL, 'lost connection')
      assert.equal(await cancelButton(t).isEnabled(), true)
      assert.equal(await panel(t).locator('p strong').first().innerText(), 'pending', 'not shown as cancelled')
      assert.equal(await t.page.locator('.success-notice').count(), 0, 'no success text')
      await t.page.unroute('**/api/v1/bookings/*/cancel')
      const approved = await suite.staff(`/api/v1/staff/bookings/${t.booking.id}/approve`, { expectedVersion: t.booking.version })
      assert.equal(approved.status, 200, JSON.stringify(approved.json))
      await activate(t.page, cancelButton(t), 'enter')
      await t.page.getByText('This reservation changed. Re-read it before continuing.').waitFor()
      await landed(t, CANCEL, 'stale version')
      assert.equal(await panel(t).locator('p strong').first().innerText(), 'pending', 'the panel still shows the old status')
      assert.equal(await t.page.locator('.success-notice').count(), 0, 'no success text')
    }, { unit: UNIT, reserve: true, modes: ['http'] }],
    ['33.5 [FAIL-NOW] View details failure leaves focus on the button that was activated', async (t) => {
      await open(t)
      await inject(t.page, '**/api/v1/bookings/*', 'abort', { method: 'GET' })
      await activate(t.page, view(t), 'enter')
      await t.page.getByRole('alert').waitFor()
      await landed(t, { tag: 'BUTTON', name: `View details for ${t.unit.name}` }, 'view details failed')
      assert.equal(await panel(t).count(), 0, 'no panel')
    }, { unit: UNIT, reserve: true, modes: ['http'] }],
    ['33.6 [FAIL-NOW] Retry reservations lands on the page heading, or on itself when it fails again', async (t) => {
      await inject(t.page, '**/api/v1/bookings', 'abort', { method: 'GET' })
      await t.page.evaluate(() => { location.hash = '/reservations' })
      const retry = t.page.getByRole('button', { name: 'Retry reservations', exact: true })
      await retry.waitFor()
      const before = gets(t, '/api/v1/bookings')
      await activate(t.page, retry, 'enter')
      await until(() => gets(t, '/api/v1/bookings') > before, 'the retried list request')
      await landed(t, { tag: 'BUTTON', name: 'Retry reservations' }, 'retry fails again')
      await t.page.unroute('**/api/v1/bookings')
      await activate(t.page, retry, 'enter')
      await t.page.locator('.reservation-row').first().waitFor()
      await landed(t, PAGE_HEADING, 'retry succeeds')
    }, { unit: UNIT, reserve: true, modes: ['http'] }],
  ]
  for (const how of ['space', 'pointer']) {
    cases.push([`33.7 [FAIL-NOW] ${how} on "View details" and "Cancel reservation" lands on the details heading`, async (t) => {
      await open(t)
      await openDetails(t, how)
      await landed(t, HEADING, `${how}: View details`)
      await cancelled(t, how)
      await landed(t, HEADING, `${how}: cancel success`)
    }, { unit: UNIT, reserve: true, modes: ['http'] }])
  }
  cases.push(['33.8 [FAIL-NOW] one landing on the heading, no pull-back, Tab, Shift+Tab and typing move focus normally', async (t) => {
    await open(t)
    await countFocusins(t.page)
    await openDetails(t)
    await landed(t, HEADING, 'landing')
    assert.equal(await focusins(t.page, 'reservation-detail-title'), 1, 'one landing')
    await t.page.keyboard.press('Tab')
    await pause(1000)
    await assertFocus(t.page, CANCEL, 'Tab')
    await t.page.keyboard.press('Shift+Tab')
    await pause(1000)
    // The heading is not a tab stop: Shift+Tab from "Cancel reservation" goes to the previous one, the row's "View details".
    await assertFocus(t.page, { tag: 'BUTTON', name: `View details for ${t.unit.name}` }, 'Shift+Tab moves normally')
    assert.equal(await focusins(t.page, 'reservation-detail-title'), 1, 'Tab and Shift+Tab are not pulled back to the heading')
    await t.page.keyboard.type('x')
    await pause(1000)
    assert.equal(await focusins(t.page, 'reservation-detail-title'), 1, 'typing and rerenders never reclaim focus')
  }, { unit: UNIT, reserve: true, modes: ['http'] }])
  cases.push(['33.8 [GUARD] the History tab keeps its own focus when activated by keyboard', async (t) => {
    await open(t)
    await openDetails(t)
    await activate(t.page, t.page.getByRole('button', { name: 'History', exact: true }), 'enter')
    await pause(600)
    await assertFocus(t.page, { tag: 'BUTTON', name: 'History' }, 'the History tab keeps its own focus')
    assert.equal(await panel(t).count(), 0, 'switching tabs closes the panel')
    await activate(t.page, t.page.getByRole('button', { name: 'Upcoming', exact: true }), 'enter')
    await pause(600)
    await assertFocus(t.page, { tag: 'BUTTON', name: 'Upcoming' }, 'the Upcoming tab keeps its own focus')
  }, { unit: UNIT, reserve: true, modes: ['http'] }])
  cases.push(['33.9 [GUARD] panel semantics, status role, one cancel request, no overflow', async (t) => {
    await open(t)
    await assertNoOverflow(t.page, 'list')
    await openDetails(t)
    assert.equal(await panel(t).getAttribute('aria-labelledby'), 'reservation-detail-title')
    assert.equal(await t.page.locator('#reservation-detail-title').innerText(), 'Reservation details')
    assert.ok(await panel(t).locator('ol.event-timeline li').count() >= 1, 'event timeline')
    await assertNoOverflow(t.page, 'details')
    await cancelled(t)
    assert.equal(await t.page.locator('[role="status"]', { hasText: 'Reservation cancelled.' }).count(), 1)
    assert.equal(posts(t, cancelPath(t)), 1, 'one cancel request')
    await assertNoOverflow(t.page, 'after cancel')
  }, { unit: UNIT, reserve: true, modes: ['http'] }])
  cases.push(['33.10 [GUARD] navigating away while the cancel is pending does not steal focus', async (t) => {
    await open(t)
    await openDetails(t)
    await inject(t.page, '**/api/v1/bookings/*/cancel', 'pass', { method: 'POST', delay: 1200 })
    await activate(t.page, cancelButton(t), 'enter')
    await t.page.getByRole('button', { name: 'Cancelling…', exact: true }).waitFor()
    await t.page.evaluate(() => { location.hash = '/explore' })
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await pause(2000)
    await assertFocus(t.page, { id: 'main-content', tag: 'H1', name: 'Explore' }, 'no steal on Explore')
  }, { unit: UNIT, reserve: true, modes: ['http'] }])
  cases.push(['33.11 [FAIL-NOW][MOCK] maya_student: View details and a successful cancel land on the details heading', async (t) => {
    await t.h.signIn('maya_student', 'StudentDemo42!', 'reservations')
    const row = t.page.locator('.reservation-row', { hasText: 'Cancellation available in details.' }).first()
    await row.waitFor()
    const name = await row.locator('h3').innerText()
    await activate(t.page, row.getByRole('button'), 'enter')
    await opened(t, name).waitFor()
    await landed(t, HEADING, 'mock View details')
    await cancelled(t)
    await landed(t, HEADING, 'mock cancel success')
  }, { modes: ['mock'], bare: true }])
  defineCases(suite, cases)
}

// ---- #34: Inventory, Set maintenance / Make active ------------------------------------------------------------------------

export function issue34(suite) {
  const http = suite.mode === 'http'
  const landed = landing(suite)
  const toggle = (t, code, verb) => t.page.getByRole('button', { name: `${verb} for ${code}`, exact: true })
  const button = (code, verb) => ({ tag: 'BUTTON', name: `${verb} for ${code}` })
  const BLOCKED = 'Maintenance is blocked by an active loan or pending/approved reservation ending today or later.'
  const statePath = (id) => `/api/v1/staff/assets/${id}/state`
  const stateRoute = '**/api/v1/staff/assets/*/state'
  const row = (t, id) => t.page.locator(`tr[data-asset-id="${id}"]`)
  const open = async (t) => {
    await t.page.evaluate(() => { location.hash = '/inventory' })
    await t.page.getByRole('heading', { name: 'Every unit. Accounted for.', level: 2 }).waitFor()
    await t.page.locator('table.inventory-table').waitFor()
  }
  const statusText = (t) => t.page.locator('.success-notice[role="status"]')
  const COORDINATOR = { as: 'coordinator', modes: ['http'] }
  const cases = []
  for (const how of ['enter', 'pointer']) {
    const tag = how === 'enter' ? '34.1' : '34.9'
    cases.push([`${tag} [FAIL-NOW] ${how}: Set maintenance on a unit without commitments keeps focus on its toggle, now "Make active"`, async (t) => {
      const x = await suite.newUnit()
      await open(t)
      await activate(t.page, toggle(t, x.inventoryCode, 'Set maintenance'), how)
      await t.page.getByText(`${x.inventoryCode} is now maintenance.`).waitFor()
      await landed(t, button(x.inventoryCode, 'Make active'), 'maintenance set')
      assert.match(await statusText(t).innerText(), new RegExp(`${x.inventoryCode} is now maintenance\\.`))
      assert.equal((await row(t, x.id).locator('.status-pill').innerText()).toLowerCase(), 'maintenance')
    }, COORDINATOR])
    cases.push([`${tag === '34.1' ? '34.2' : '34.9'} [FAIL-NOW] ${how}: Make active reverses it and keeps focus on the same button, now "Set maintenance"`, async (t) => {
      const x = await suite.newUnit()
      const done = await suite.staff(statePath(x.id), { state: 'maintenance' }, 'PUT')
      assert.equal(done.status, 200, JSON.stringify(done.json))
      await open(t)
      await activate(t.page, toggle(t, x.inventoryCode, 'Make active'), how)
      await t.page.getByText(`${x.inventoryCode} is now active.`).waitFor()
      await landed(t, button(x.inventoryCode, 'Set maintenance'), 'made active')
      assert.equal((await row(t, x.id).locator('.status-pill').innerText()).toLowerCase(), 'active')
    }, COORDINATOR])
    cases.push([`${tag === '34.1' ? '34.3' : '34.9'} [FAIL-NOW] ${how}: a maintenance conflict keeps focus on the unit's enabled "Set maintenance"`, async (t) => {
      await open(t)
      await activate(t.page, toggle(t, t.unit.inventoryCode, 'Set maintenance'), how)
      await t.page.getByText(BLOCKED, { exact: false }).waitFor()
      await landed(t, button(t.unit.inventoryCode, 'Set maintenance'), 'conflict')
      assert.equal(await toggle(t, t.unit.inventoryCode, 'Set maintenance').isEnabled(), true)
      assert.equal((await row(t, t.unit.id).locator('.status-pill').innerText()).toLowerCase(), 'active', 'still active')
      assert.equal(await t.page.locator('.success-notice').count(), 0, 'no success text')
    }, { ...COORDINATOR, reserve: true }])
  }
  cases.push(['34.4 [FAIL-NOW] lost connection keeps the state and focus on the unit\'s toggle', async (t) => {
    const x = await suite.newUnit()
    await open(t)
    await inject(t.page, stateRoute, 'abort', { method: 'PUT' })
    await activate(t.page, toggle(t, x.inventoryCode, 'Set maintenance'), 'enter')
    await t.page.getByRole('alert').waitFor()
    await landed(t, button(x.inventoryCode, 'Set maintenance'), 'lost connection')
    assert.equal((await row(t, x.id).locator('.status-pill').innerText()).toLowerCase(), 'active', 'unit state unchanged')
    assert.equal(await t.page.locator('.success-notice').count(), 0, 'no success text')
  }, COORDINATOR])
  cases.push(['34.5 [FAIL-NOW] with a search filter the focus lands on the same unit\'s toggle, filter and list unchanged', async (t) => {
    const x = await suite.newUnit()
    await open(t)
    await t.page.locator('#inventory-search').fill(x.inventoryCode)
    assert.equal(await t.page.locator('tbody tr').count(), 1)
    await activate(t.page, toggle(t, x.inventoryCode, 'Set maintenance'), 'enter')
    await t.page.getByText(`${x.inventoryCode} is now maintenance.`).waitFor()
    await landed(t, button(x.inventoryCode, 'Make active'), 'filtered list')
    assert.equal(await t.page.locator('#inventory-search').inputValue(), x.inventoryCode, 'search value unchanged')
    assert.equal(await t.page.locator('tbody tr').count(), 1, 'list unchanged')
  }, COORDINATOR])
  cases.push(['34.6 [GUARD] every toggle is disabled while pending; a double Enter and a double click send one request each', async (t) => {
    const x = await suite.newUnit()
    await open(t)
    await inject(t.page, stateRoute, 'pass', { method: 'PUT', delay: 800 })
    await activate(t.page, toggle(t, x.inventoryCode, 'Set maintenance'), 'enter')
    await t.page.keyboard.press('Enter')
    await until(() => t.page.locator('tr[data-asset-id] button[disabled]').count().then((count) => count > 0), 'disabled row buttons')
    assert.equal(await t.page.locator('tbody button:not([disabled])').count(), 0, 'every row button is disabled while pending')
    await t.page.getByText(`${x.inventoryCode} is now maintenance.`).waitFor()
    assert.equal(t.sink.requests.filter((request) => request.method === 'PUT' && request.url === statePath(x.id)).length, 1, 'one request under a double Enter')
    await toggle(t, x.inventoryCode, 'Make active').dblclick()
    await t.page.getByText(`${x.inventoryCode} is now active.`).waitFor()
    assert.equal(t.sink.requests.filter((request) => request.method === 'PUT' && request.url === statePath(x.id)).length, 2, 'one more request under a double click')
  }, COORDINATOR])
  cases.push(['34.7 [GUARD] Add, Edit, Back, Discard and field errors keep their focus handling', async (t) => {
    await open(t)
    const add = t.page.locator('#add-equipment')
    await activate(t.page, add, 'enter')
    await landed(t, { id: 'inventory-editor-title', tag: 'H2' }, 'Add opens the editor on its heading')
    await activate(t.page, t.page.getByRole('button', { name: '← Back to inventory', exact: true }), 'enter')
    await landed(t, { id: 'add-equipment' }, 'Back restores Add equipment')
    await activate(t.page, add, 'enter')
    await activate(t.page, t.page.getByRole('button', { name: 'Add physical unit', exact: true }), 'enter')
    await t.page.locator('#inventory-name-error').waitFor()
    await landed(t, { id: 'inventory-name', tag: 'INPUT' }, 'a field error focuses the first invalid field')
    const code = `UX-ED${Date.now().toString(36)}`.toUpperCase().slice(0, 30)
    await t.page.locator('#inventory-name').fill('Editor flow unit')
    await t.page.locator('#inventory-inventoryCode').fill(code)
    await t.page.locator('#inventory-location').fill('Club desk')
    await activate(t.page, t.page.getByRole('button', { name: 'Add physical unit', exact: true }), 'enter')
    await t.page.getByText('Equipment added.', { exact: false }).waitFor()
    await landed(t, { id: 'add-equipment' }, 'Add saved restores Add equipment')
    await t.page.locator('#inventory-search').fill(code)
    const edit = t.page.locator('tbody [id^="edit-"]')
    const editId = await edit.getAttribute('id')
    await activate(t.page, edit, 'enter')
    await landed(t, { id: 'inventory-editor-title', tag: 'H2' }, 'Edit opens the editor on its heading')
    await activate(t.page, t.page.getByRole('button', { name: 'Discard changes', exact: true }), 'enter')
    await landed(t, { id: editId }, 'Discard restores the Edit button')
    await activate(t.page, edit, 'enter')
    await t.page.locator('#inventory-name').fill('Editor flow unit renamed')
    await activate(t.page, t.page.getByRole('button', { name: 'Save equipment details', exact: true }), 'enter')
    await t.page.getByText('Equipment details saved.', { exact: false }).waitFor()
    await landed(t, { id: editId }, 'Edit saved restores the Edit button')
  }, COORDINATOR])
  cases.push(['34.8 [FAIL-NOW] Retry inventory lands on the page heading, or on itself when it fails again', async (t) => {
    await inject(t.page, '**/api/v1/staff/assets', 'abort', { method: 'GET' })
    await t.page.evaluate(() => { location.hash = '/inventory' })
    const retry = t.page.getByRole('button', { name: 'Retry inventory', exact: true })
    await retry.waitFor()
    const before = gets(t, '/api/v1/staff/assets')
    await activate(t.page, retry, 'enter')
    await until(() => gets(t, '/api/v1/staff/assets') > before, 'the retried list request')
    await landed(t, { tag: 'BUTTON', name: 'Retry inventory' }, 'retry fails again')
    await t.page.unroute('**/api/v1/staff/assets')
    await activate(t.page, retry, 'enter')
    await t.page.locator('table.inventory-table').waitFor()
    await landed(t, { id: 'main-content', tag: 'H1', name: 'Inventory' }, 'retry succeeds')
  }, COORDINATOR])
  cases.push(['34.10 [FAIL-NOW][MOCK] alex_coordinator: a unit without commitments toggles and a unit with an open request is blocked, focus stays on the toggle', async (t) => {
    await t.h.signIn('alex_coordinator', 'CoordinatorDemo42!', 'inventory')
    await t.page.locator('table.inventory-table').waitFor()
    await activate(t.page, toggle(t, 'ACC-003', 'Set maintenance'), 'enter')
    await t.page.getByText('ACC-003 is now maintenance.').waitFor()
    await landed(t, button('ACC-003', 'Make active'), 'mock maintenance set')
    await activate(t.page, toggle(t, 'ACC-003', 'Make active'), 'enter')
    await t.page.getByText('ACC-003 is now active.').waitFor()
    await landed(t, button('ACC-003', 'Set maintenance'), 'mock made active')
    for (const how of ['enter', 'pointer']) {
      await activate(t.page, toggle(t, 'CAM-001', 'Set maintenance'), how)
      await t.page.getByText(BLOCKED, { exact: false }).waitFor()
      await landed(t, button('CAM-001', 'Set maintenance'), `mock conflict (${how})`)
    }
  }, { modes: ['mock'], bare: true }])
  cases.push(['34.11 [GUARD] no overflow, and at 390 px both row buttons stay inside the viewport', async (t) => {
    await open(t)
    await assertNoOverflow(t.page, 'inventory')
    for (const verb of ['Edit', 'Set maintenance']) {
      const target = verb === 'Edit' ? row(t, t.unit.id).locator('[id^="edit-"]') : toggle(t, t.unit.inventoryCode, verb)
      const box = await geometry(target)
      assert.ok(box.left >= 0 && box.right <= box.innerWidth, `${verb} ${Math.round(box.left)}-${Math.round(box.right)} is inside the ${box.innerWidth}px viewport`)
      assert.ok(box.height >= 44 - 0.5, `${verb} is ${box.height}px high`)
    }
  }, COORDINATOR])
  defineCases(suite, cases)
}


// ---- #35: coordinator desk, a failed staff action --------------------------------------------------------------------------

export function issue35(suite) {
  const landed = landing(suite)
  const ACTIONS = { approve: 'Approve request', reject: 'Reject request', cancel: 'Cancel reservation', checkout: 'Check out equipment', return: 'Record return' }
  const CONFIRM = { approve: 'Confirm approve request', reject: 'Confirm reject request', cancel: 'Confirm cancel reservation', checkout: 'Confirm check out equipment', return: 'Confirm record return' }
  const QUEUE = { approve: 'Pending requests', reject: 'Pending requests', cancel: 'Pending requests', checkout: 'Pickups', return: 'Active loans' }
  const NOTES = { reject: 'Not available for this project', checkout: 'Kit complete and in good condition', return: 'Returned complete and clean' }
  const STALE = 'This reservation changed. Re-read it before continuing.'
  const OFFLINE = 'Could not reach the GearShare server. Check your connection and try again.'
  const BOOKING_HEADING = { id: 'staff-booking-title', tag: 'H2', name: 'Manage reservation' }
  const confirmButton = (t) => t.page.locator('.staff-action-form button[type="submit"]')
  const refreshDesk = (t) => t.page.getByRole('button', { name: 'Refresh desk', exact: true })
  const keepButton = (t) => t.page.getByRole('button', { name: 'Keep reservation unchanged', exact: true })
  // Cancelling is one endpoint for students and staff; the other four actions are staff routes.
  const staffPath = (id, action) => (action === 'cancel' ? `/api/v1/bookings/${id}/cancel` : `/api/v1/staff/bookings/${id}/${action}`)
  const desk = async (t, queue = 'Pending requests') => {
    await t.page.evaluate(() => { location.hash = '/desk' })
    await t.page.locator('#desk-views').waitFor()
    if (queue !== 'Pending requests') await t.page.getByRole('button', { name: new RegExp(`^${queue}`) }).click()
  }
  /** Opens a booking's detail on the desk and then its action form (with the note typed unless `note` is null). */
  const openAction = async (t, id, action, { queue = QUEUE[action], note = NOTES[action] } = {}) => {
    await desk(t, queue)
    await activate(t.page, t.page.locator(`#review-${id}`), 'enter')
    await t.page.getByRole('heading', { name: 'Manage reservation', level: 2 }).waitFor()
    await t.page.getByRole('button', { name: ACTIONS[action], exact: true }).click()
    await t.page.locator('.staff-action-form').waitFor()
    if (NOTES[action] && note !== null) await t.page.locator('#staff-note').fill(note)
  }
  const staffStep = async (id, action, version, note) => {
    const done = await suite.staff(staffPath(id, action), { expectedVersion: version, ...(note ? { note } : {}) })
    assert.equal(done.status, 200, `${action}: ${JSON.stringify(done.json)}`)
  }
  /**
   * The booking each action needs, and `stale()`, which changes it behind the open page's back so the page's version is old:
   * a pending request (the case reservation; the student cancels it), an approved pickup for today (staff cancel), or a
   * checked-out loan (staff records the return).
   */
  const prepare = async (t, action, { approved = false } = {}) => {
    if (action === 'checkout' || approved) {
      const booking = await suite.book(t, t.assetId, approved ? 5 : 0)
      await staffStep(booking.id, 'approve', 1)
      return { booking, stale: () => suite.staff(staffPath(booking.id, 'cancel'), { expectedVersion: 2 }) }
    }
    if (action === 'return') {
      const booking = await suite.book(t, t.assetId, 0)
      await staffStep(booking.id, 'approve', 1)
      await staffStep(booking.id, 'checkout', 2, NOTES.checkout)
      return { booking, stale: () => suite.staff(staffPath(booking.id, 'return'), { expectedVersion: 3, note: NOTES.return }) }
    }
    return { booking: t.booking, stale: () => suite.as(t.token, `/api/v1/bookings/${t.booking.id}/cancel`, { expectedVersion: t.booking.version }) }
  }
  const COORDINATOR = { as: 'coordinator', modes: ['http'], reserve: true }
  const cases = []
  // 35.1 / 35.2: the stale-version 409 of the six action variants.
  for (const [id, label, action, approved] of [
    ['35.1', 'approve', 'approve'], ['35.2', 'reject', 'reject'], ['35.2', 'cancel of a pending booking', 'cancel'],
    ['35.2', 'cancel of an approved booking', 'cancel', true], ['35.2', 'check out', 'checkout'], ['35.2', 'record return', 'return'],
  ]) {
    cases.push([`${id} [FAIL-NOW] stale-version 409 on ${label} lands on its enabled Confirm button, alert and note kept`, async (t) => {
      const { booking, stale } = await prepare(t, action, { approved })
      await openAction(t, booking.id, action, { queue: approved ? 'Pickups' : QUEUE[action] })
      const behind = await stale()
      assert.equal(behind.status, 200, `the change behind the page's back: ${behind.status} ${JSON.stringify(behind.json)}`)
      await activate(t.page, confirmButton(t), 'enter')
      await t.page.getByText(STALE).waitFor()
      await landed(t, { tag: 'BUTTON', name: CONFIRM[action] }, `stale 409 (${label})`)
      assert.equal(await confirmButton(t).isEnabled(), true, 'Confirm is enabled')
      assert.equal(await refreshDesk(t).count(), 1, 'Refresh desk is shown')
      if (NOTES[action]) assert.equal(await t.page.locator('#staff-note').inputValue(), NOTES[action], 'the note is retained')
    }, COORDINATOR])
  }
  // 35.3 / 35.4: lost connection, and the retry by Enter alone.
  for (const action of ['approve', 'reject', 'return']) {
    cases.push([`${action === 'approve' ? '35.3/35.4' : '35.3'} [FAIL-NOW] lost connection on ${action} lands on Confirm, booking unchanged${NOTES[action] ? ', note retained' : '; Enter alone retries once and succeeds'}`, async (t) => {
      const { booking } = await prepare(t, action)
      await openAction(t, booking.id, action)
      const route = `**${staffPath(booking.id, action)}`
      await inject(t.page, route, 'abort', { method: 'POST' })
      await activate(t.page, confirmButton(t), 'enter')
      await t.page.getByText(OFFLINE).waitFor()
      await landed(t, { tag: 'BUTTON', name: CONFIRM[action] }, `lost connection (${action})`)
      if (NOTES[action]) assert.equal(await t.page.locator('#staff-note').inputValue(), NOTES[action], 'the note is retained')
      const fresh = await suite.as(t.token, `/api/v1/bookings/${booking.id}`, undefined, 'GET')
      assert.equal(fresh.json.state, action === 'return' ? 'checked_out' : 'pending', 'the booking is unchanged on a fresh read')
      if (action !== 'approve') return
      // 35.4: restore the connection and press Enter straight away, without any other focus action.
      await t.page.unroute(route)
      const before = posts(t, staffPath(booking.id, 'approve'))
      await t.page.keyboard.press('Enter')
      await t.page.keyboard.press('Enter')
      await t.page.getByText('Request approved.', { exact: false }).waitFor()
      await landed(t, BOOKING_HEADING, 'success after the retry')
      assert.equal(posts(t, staffPath(booking.id, 'approve')), before + 1, 'exactly one request for the retry, also under a double Enter')
    }, COORDINATOR])
  }
  // 35.5: a note that is too short is a field failure and keeps focus on the note.
  for (const action of ['reject', 'checkout', 'return']) {
    cases.push([`35.5 [GUARD] note "ab" on ${action} keeps focus on #staff-note, not on the button`, async (t) => {
      const { booking } = await prepare(t, action)
      await openAction(t, booking.id, action, { note: 'ab' })
      await activate(t.page, confirmButton(t), 'enter')
      await t.page.locator('#staff-note-error').waitFor()
      await landed(t, { id: 'staff-note', tag: 'TEXTAREA' }, `field failure (${action})`)
      assert.equal(await t.page.locator('#staff-note').getAttribute('aria-invalid'), 'true')
    }, COORDINATOR])
  }
  cases.push(['35.6 [GUARD] 401 mid-action lands on "Sign in again" (shared with #32)', async (t) => {
    const { booking } = await prepare(t, 'approve')
    await openAction(t, booking.id, 'approve')
    const ended = await suite.as(t.sessionToken, '/api/v1/auth/logout')
    assert.ok([200, 204].includes(ended.status), `logout status ${ended.status}`)
    await activate(t.page, confirmButton(t), 'enter')
    await t.page.getByRole('link', { name: 'Sign in again', exact: true }).waitFor()
    assert.ok(await t.page.getByText('Your session has ended. Sign in again to continue.').count() >= 1, 'session-ended alert')
    await landed(t, { tag: 'A', name: 'Sign in again' }, '401 mid-action')
  }, { ...COORDINATOR, as: 'coordinator-session' }])
  cases.push(['35.7 [GUARD] recovery controls: DOM order, Shift+Tab twice from Confirm reaches Refresh desk, Tab reaches Keep reservation unchanged, Enter on Refresh desk focuses the heading', async (t) => {
    const { booking, stale } = await prepare(t, 'approve')
    await openAction(t, booking.id, 'approve')
    assert.equal((await stale()).status, 200)
    await activate(t.page, confirmButton(t), 'enter')
    await t.page.getByText(STALE).waitFor()
    await settle(t.page)
    const order = await t.page.evaluate(() => [...document.querySelectorAll('main button, main a')].map((element) => element.textContent.trim().replace(/\s+/g, ' ')))
    const wanted = ['Refresh desk', '← Back to queues', 'Confirm approve request', 'Keep reservation unchanged']
    const indexes = wanted.map((name) => order.indexOf(name))
    assert.ok(indexes.every((index, at) => index >= 0 && (at === 0 || index > indexes[at - 1])), `DOM order ${JSON.stringify(indexes)} of ${wanted.join(' | ')} in ${JSON.stringify(order)}`)
    // From the Confirm landing; put there by hand so this guard also passes before the fix.
    await confirmButton(t).focus()
    await t.page.keyboard.press('Shift+Tab')
    await assertFocus(t.page, { tag: 'BUTTON', name: '← Back to queues' }, 'Shift+Tab once')
    await t.page.keyboard.press('Shift+Tab')
    await assertFocus(t.page, { tag: 'BUTTON', name: 'Refresh desk' }, 'Shift+Tab twice')
    await confirmButton(t).focus()
    await t.page.keyboard.press('Tab')
    await assertFocus(t.page, { tag: 'BUTTON', name: 'Keep reservation unchanged' }, 'Tab from Confirm')
    await activate(t.page, refreshDesk(t), 'enter')
    await t.page.getByText(STALE).waitFor({ state: 'detached' })
    await landed(t, BOOKING_HEADING, 'Refresh desk')
  }, COORDINATOR])
  cases.push(['35.8 [GUARD] Back to queues, Keep reservation unchanged, opening an action, one request per Confirm, no overflow', async (t) => {
    await desk(t)
    const rowButton = t.page.locator(`#review-${t.booking.id}`)
    await activate(t.page, rowButton, 'enter')
    await landed(t, BOOKING_HEADING, 'opening a booking')
    await assertNoOverflow(t.page, 'booking detail')
    await activate(t.page, t.page.getByRole('button', { name: '← Back to queues', exact: true }), 'enter')
    await landed(t, { id: `review-${t.booking.id}` }, 'Back to queues restores the row button')
    await activate(t.page, rowButton, 'enter')
    await t.page.getByRole('button', { name: ACTIONS.approve, exact: true }).click()
    await landed(t, { id: 'staff-action-title', tag: 'H3' }, 'opening Approve')
    await activate(t.page, keepButton(t), 'enter')
    await landed(t, BOOKING_HEADING, 'Keep reservation unchanged')
    await t.page.getByRole('button', { name: ACTIONS.reject, exact: true }).click()
    await landed(t, { id: 'staff-note', tag: 'TEXTAREA' }, 'opening Reject')
    await activate(t.page, keepButton(t), 'enter')
    await t.page.getByRole('button', { name: ACTIONS.approve, exact: true }).click()
    await activate(t.page, confirmButton(t), 'enter')
    await t.page.keyboard.press('Enter')
    await t.page.getByText('Request approved.', { exact: false }).waitFor()
    await landed(t, BOOKING_HEADING, 'success')
    assert.equal(posts(t, staffPath(t.booking.id, 'approve')), 1, 'one request under a double Enter')
    await assertNoOverflow(t.page, 'after approve')
  }, COORDINATOR])
  cases.push(['35.9 [GUARD][MOCK] mock desk: field failure and the opening/Back/Keep focus rules (the mock cannot produce a 409 or a lost connection)', async (t) => {
    await t.h.signIn('alex_coordinator', 'CoordinatorDemo42!', 'desk')
    await t.page.locator('#desk-views').waitFor()
    await activate(t.page, t.page.locator('#review-fixture-pending'), 'enter')
    await landed(t, BOOKING_HEADING, 'mock opening a booking')
    await activate(t.page, t.page.getByRole('button', { name: '← Back to queues', exact: true }), 'enter')
    await landed(t, { id: 'review-fixture-pending' }, 'mock Back to queues')
    await activate(t.page, t.page.locator('#review-fixture-pending'), 'enter')
    await t.page.getByRole('button', { name: ACTIONS.reject, exact: true }).click()
    await landed(t, { id: 'staff-note', tag: 'TEXTAREA' }, 'mock opening Reject')
    await t.page.locator('#staff-note').fill('ab')
    await activate(t.page, confirmButton(t), 'enter')
    await t.page.locator('#staff-note-error').waitFor()
    await landed(t, { id: 'staff-note', tag: 'TEXTAREA' }, 'mock field failure')
    await activate(t.page, keepButton(t), 'enter')
    await landed(t, BOOKING_HEADING, 'mock Keep reservation unchanged')
    await t.page.getByRole('button', { name: ACTIONS.approve, exact: true }).click()
    await landed(t, { id: 'staff-action-title', tag: 'H3' }, 'mock opening Approve')
    await activate(t.page, confirmButton(t), 'enter')
    await t.page.keyboard.press('Enter')
    await t.page.getByText('Request approved.', { exact: false }).waitFor()
    await landed(t, BOOKING_HEADING, 'mock success')
    await assertNoOverflow(t.page, 'mock desk')
  }, { modes: ['mock'], bare: true }])
  defineCases(suite, cases)
}

// ---- #39: Sign in / Register, a form-level failure ----------------------------------------------------------------------------

export function issue39(suite) {
  const http = suite.mode === 'http'
  const landed = landing(suite)
  const WRONG = 'wrong-password-xyz'
  const BAD = 'Username or password is incorrect.'
  const SUBMIT = { signin: 'Sign in', register: 'Create student account' }
  const HEADING = { signin: 'Sign in to GearShare', register: 'Create your account' }
  const ROUTE = { signin: '**/api/v1/auth/login', register: '**/api/v1/auth/register' }
  const PATH = { signin: '/api/v1/auth/login', register: '/api/v1/auth/register' }
  const submitButton = (t) => t.page.locator('form button[type="submit"]')
  const open = async (t, route) => {
    await t.page.evaluate((target) => { location.hash = `/${target}` }, route)
    await t.page.getByRole('heading', { name: HEADING[route], level: 2 }).waitFor()
  }
  const enter = async (t, { username, password }) => {
    await t.page.locator('#username').fill(username)
    await t.page.locator('#password').fill(password)
  }
  /** Starts the submit with Enter in #password, or with a pointer click on the submit button. */
  const start = async (t, how) => {
    if (how === 'pointer') await submitButton(t).click()
    else { await t.page.locator('#password').focus(); await t.page.keyboard.press('Enter') }
  }
  /** The settled form-level failure: alert, focus on the enabled submit button, #24's rule (no field marked, values kept, no session). */
  const assertFormLevel = async (t, route, values, label) => {
    await t.page.locator('.form-alert').waitFor()
    await landed(t, { tag: 'BUTTON', name: SUBMIT[route] }, label)
    assert.equal(await submitButton(t).isEnabled(), true, `${label}: the submit button is enabled`)
    for (const id of ['username', 'password']) {
      assert.equal(await t.page.locator(`#${id}`).getAttribute('aria-invalid'), 'false', `${label}: #${id} is not marked invalid`)
      assert.equal(await t.page.locator(`#${id}`).isEnabled(), true, `${label}: #${id} is enabled`)
    }
    assert.equal(await t.page.locator('.field-error').count(), 0, `${label}: no field error`)
    assert.equal(await t.page.locator('#username').inputValue(), values.username, `${label}: username retained`)
    assert.equal((await t.page.locator('#password').inputValue()).length, values.password.length, `${label}: password length retained`)
    assert.equal(await t.h.token(), null, `${label}: no session`)
    assert.equal(await t.page.locator('.success-notice').count(), 0, `${label}: no success text`)
  }
  const VISITOR = { signedIn: false, modes: ['http'] }
  const cases = []
  for (const how of ['enter', 'pointer']) {
    cases.push([`${how === 'enter' ? '39.1' : '39.5'} [FAIL-NOW] ${how}: a wrong password lands on the enabled "Sign in" button, no field marked, values and no session as before`, async (t) => {
      await open(t, 'signin')
      const values = { username: t.student.username, password: WRONG }
      await enter(t, values)
      await start(t, how)
      await assertFormLevel(t, 'signin', values, `wrong password (${how})`)
      assert.equal(await t.page.locator('.form-alert').innerText(), BAD)
    }, VISITOR])
    for (const kind of ['abort', '500']) {
      cases.push([`${how === 'enter' ? '39.3' : '39.5'} [FAIL-NOW] ${how}: sign in with ${kind === 'abort' ? 'a lost connection' : 'a server error'} lands on "Sign in", values retained`, async (t) => {
        await open(t, 'signin')
        const values = { username: t.student.username, password: t.student.password }
        await enter(t, values)
        await inject(t.page, ROUTE.signin, kind, { method: 'POST' })
        await start(t, how)
        await assertFormLevel(t, 'signin', values, `sign in ${kind} (${how})`)
        assert.notEqual(await t.page.locator('.form-alert').innerText(), BAD)
      }, VISITOR])
      cases.push([`${how === 'enter' ? '39.4' : '39.5'} [FAIL-NOW] ${how}: Register with ${kind === 'abort' ? 'a lost connection' : 'a server error'} lands on "Create student account", no account created`, async (t) => {
        const fresh = newStudent('ux39reg')
        await open(t, 'register')
        await enter(t, fresh)
        await inject(t.page, ROUTE.register, kind, { method: 'POST' })
        await start(t, how)
        await assertFormLevel(t, 'register', fresh, `register ${kind} (${how})`)
        const login = await suite.as(undefined, PATH.signin, fresh)
        assert.equal(login.status, 401, 'no account was created: a login with those credentials is refused')
      }, VISITOR])
    }
  }
  cases.push(['39.2 [FAIL-NOW] after the landing Shift+Tab reaches #password, Tab goes to the button and then to "Create an account"; typing does not pull focus back', async (t) => {
    await open(t, 'signin')
    const values = { username: t.student.username, password: WRONG }
    await enter(t, values)
    await start(t, 'enter')
    await assertFormLevel(t, 'signin', values, 'wrong password')
    await t.page.keyboard.press('Shift+Tab')
    await assertFocus(t.page, { id: 'password', tag: 'INPUT' }, 'Shift+Tab from the button')
    await t.page.keyboard.type('ABC')
    await settle(t.page, 1000)
    await assertFocus(t.page, { id: 'password', tag: 'INPUT' }, 'typing in #password')
    // Keyboard focus selects the field's text, so the typed characters replace it; what matters is that they reached the field.
    assert.ok((await t.page.locator('#password').inputValue()).endsWith('ABC'), 'typed characters reached the password field')
    await t.page.keyboard.press('Tab')
    await assertFocus(t.page, { tag: 'BUTTON', name: 'Sign in' }, 'Tab to the button')
    await t.page.keyboard.press('Tab')
    await assertFocus(t.page, { tag: 'A', name: 'Create an account' }, 'Tab to the Create an account link')
    await t.page.keyboard.press('Shift+Tab')
    await t.page.keyboard.press('Shift+Tab')
    await t.page.keyboard.press('Shift+Tab')
    await assertFocus(t.page, { id: 'username', tag: 'INPUT' }, 'Shift+Tab back to #username')
    await t.page.keyboard.type('x')
    await settle(t.page, 1000)
    await assertFocus(t.page, { id: 'username', tag: 'INPUT' }, 'typing in #username')
  }, VISITOR])
  cases.push(['39.6 [FAIL-NOW] after a lost connection Enter alone retries once (also under a double Enter with the response delayed 800 ms) and signs in on "Explore"', async (t) => {
    await open(t, 'signin')
    const values = { username: t.student.username, password: t.student.password }
    await enter(t, values)
    await inject(t.page, ROUTE.signin, 'abort', { method: 'POST' })
    await start(t, 'enter')
    await assertFormLevel(t, 'signin', values, 'lost connection')
    await t.page.unroute(ROUTE.signin)
    await inject(t.page, ROUTE.signin, 'pass', { method: 'POST', delay: 800 })
    const before = posts(t, PATH.signin)
    await t.page.keyboard.press('Enter')
    await t.page.keyboard.press('Enter')
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await landed(t, { id: 'main-content', tag: 'H1', name: 'Explore' }, 'signed in by the retry')
    assert.equal(posts(t, PATH.signin), before + 1, 'exactly one login request for the retry, also under a double Enter')
    assert.notEqual(await t.h.token(), null, 'a session exists')
  }, VISITOR])
  cases.push(['39.7 [GUARD] #24: field-level failures still focus the first invalid control, and typing does not steal focus again', async (t) => {
    await open(t, 'register')
    const submit = async () => { await t.page.locator('#password').focus(); await t.page.keyboard.press('Enter') }
    // Empty submit: both fields invalid, #username first.
    await submit()
    await t.page.locator('.field-error').first().waitFor()
    await landed(t, { id: 'username', tag: 'INPUT' }, 'empty submit')
    assert.equal(await t.page.locator('.field-error').count(), 2)
    // Only the password invalid.
    await t.page.locator('#username').fill(newStudent('ux39pw').username)
    await t.page.locator('#password').fill('short')
    await submit()
    await t.page.locator('#password-error').waitFor()
    await landed(t, { id: 'password', tag: 'INPUT' }, 'password only')
    await t.page.keyboard.type('Z')
    await settle(t.page, 1000)
    await assertFocus(t.page, { id: 'password', tag: 'INPUT' }, 'typing in #password')
    // Both invalid again: #username first.
    await t.page.locator('#username').fill('a')
    await submit()
    await t.page.locator('#username-error').waitFor()
    await landed(t, { id: 'username', tag: 'INPUT' }, 'both invalid')
    await t.page.keyboard.type('b')
    await settle(t.page, 1000)
    await assertFocus(t.page, { id: 'username', tag: 'INPUT' }, 'typing in #username')
    // A taken username in a different case.
    await t.page.locator('#username').fill(t.student.username.toUpperCase())
    await t.page.locator('#password').fill(t.student.password)
    await submit()
    await t.page.locator('#username-error').waitFor()
    await landed(t, { id: 'username', tag: 'INPUT' }, 'duplicate username in another case')
  }, VISITOR])
  cases.push(['39.8 [GUARD] the submit button is at least 44 px high and fully visible and nothing overflows in the failure state', async (t) => {
    await open(t, 'signin')
    await enter(t, { username: t.student.username, password: WRONG })
    await start(t, 'enter')
    await t.page.locator('.form-alert').waitFor()
    await settle(t.page)
    await submitButton(t).scrollIntoViewIfNeeded()
    const box = await geometry(submitButton(t))
    assert.ok(box.height >= 44 - 0.5, `submit button is ${box.height}px high`)
    assert.ok(box.left >= 0 && box.right <= box.innerWidth, `submit button ${Math.round(box.left)}-${Math.round(box.right)} is inside the ${box.innerWidth}px viewport`)
    assert.ok(box.top >= 0 && box.bottom <= 900, `submit button ${Math.round(box.top)}-${Math.round(box.bottom)} is inside the 900px viewport`)
    await assertNoOverflow(t.page, 'sign in failure state')
  }, VISITOR])
  cases.push(['39.10 [GUARD] navigating away while the login is pending: Explore keeps focus after the response', async (t) => {
    await open(t, 'signin')
    await enter(t, { username: t.student.username, password: WRONG })
    await inject(t.page, ROUTE.signin, 'pass', { method: 'POST', delay: 800 })
    await start(t, 'enter')
    await until(() => t.page.locator('form button[type="submit"]:disabled').count().then((count) => count > 0), 'the pending state')
    await t.page.evaluate(() => { location.hash = '/explore' })
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await settle(t.page, 1500)
    await assertFocus(t.page, { id: 'main-content', tag: 'H1' }, 'after the delayed response')
  }, VISITOR])
  cases.push(['39.9 [FAIL-NOW][MOCK] maya_student with a wrong password lands on "Sign in", fields not invalid', async (t) => {
    await t.page.evaluate(() => { location.hash = '/signin' })
    await t.page.getByRole('heading', { name: HEADING.signin, level: 2 }).waitFor()
    const values = { username: 'maya_student', password: WRONG }
    await enter(t, values)
    await start(t, 'enter')
    await assertFormLevel(t, 'signin', values, 'mock wrong password')
    assert.ok((await t.page.locator('.form-alert').innerText()).startsWith(BAD), 'wrong-credentials alert')
    await start(t, 'pointer')
    await t.page.waitForTimeout(600)
    await assertFormLevel(t, 'signin', values, 'mock wrong password again (pointer)')
  }, { modes: ['mock'], bare: true }])
  defineCases(suite, cases)
}

// ---- #40: Explore, "Clear all filters" and "Retry equipment" -------------------------------------------------------------------

export function issue40(suite) {
  const landed = landing(suite)
  const EXPLORE_HEADING = { id: 'main-content', tag: 'H1', name: 'Explore' }
  const NO_MATCH = 'zzzz-no-match'
  const cardCount = (t) => t.page.locator('a.equipment-card').count()
  const clearAll = (t) => t.page.getByRole('button', { name: 'Clear all filters', exact: true })
  const chip = (t, name) => t.page.getByRole('button', { name, exact: true })
  const openExplore = async (t) => {
    await t.page.evaluate(() => { location.hash = '/explore' })
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await t.page.locator('a.equipment-card').first().waitFor()
    return cardCount(t)
  }
  const noMatch = async (t) => {
    await t.page.locator('#equipment-search').fill(NO_MATCH)
    await t.page.getByRole('heading', { name: 'No equipment to show.', level: 2 }).waitFor()
  }
  /** The reset the activation must produce: all three filters cleared and the whole list back. */
  const assertReset = async (t, unfiltered, label) => {
    await until(() => cardCount(t).then((count) => count === unfiltered), `${label}: the unfiltered list (${unfiltered} units) back`)
    assert.equal(await t.page.locator('#equipment-search').inputValue(), '', `${label}: search is empty`)
    assert.equal(await chip(t, 'All equipment').getAttribute('aria-pressed'), 'true', `${label}: All equipment is pressed`)
    assert.equal(await t.page.locator('#catalogue-startDate').inputValue(), '', `${label}: start date is empty`)
    assert.equal(await t.page.locator('#catalogue-endDate').inputValue(), '', `${label}: end date is empty`)
  }
  /** Activates Clear all filters and samples the focus right away, 50 ms later and when the grid is back. */
  const clearAndSample = async (t, how, unfiltered, label) => {
    await activate(t.page, clearAll(t), how)
    await assertFocus(t.page, EXPLORE_HEADING, `${label}: immediately after the activation`)
    await settle(t.page, 50)
    await assertFocus(t.page, EXPLORE_HEADING, `${label}: 50 ms later`)
    await assertReset(t, unfiltered, label)
    await landed(t, EXPLORE_HEADING, `${label}: the grid has rendered`)
  }
  const VISITOR = { signedIn: false, modes: ['http'] }
  const cases = []
  for (const how of ['enter', 'pointer']) {
    cases.push([`${how === 'enter' ? '40.1/40.2' : '40.6'} [FAIL-NOW] ${how}: Clear all filters after a no-match search lands on h1 "Explore" at once, 50 ms later and when the grid is back; all three filters reset`, async (t) => {
      const unfiltered = await openExplore(t)
      await noMatch(t)
      await clearAndSample(t, how, unfiltered, `no-match search (${how})`)
    }, VISITOR])
  }
  cases.push(['40.3 [FAIL-NOW] the same landing from a category plus no-match search', async (t) => {
    const unfiltered = await openExplore(t)
    await chip(t, 'Cameras').click()
    await noMatch(t)
    assert.equal(await chip(t, 'Cameras').getAttribute('aria-pressed'), 'true')
    await clearAndSample(t, 'enter', unfiltered, 'category plus search')
  }, VISITOR])
  cases.push(['40.3 [FAIL-NOW] the same landing from a date range that has no available unit', async (t) => {
    const unfiltered = await openExplore(t)
    const stub = '**/api/v1/assets?*'
    await t.page.route(stub, async (route) => {
      const response = await route.fetch()
      const json = await response.json()
      await route.fulfill({ response, json: { ...json, items: [] } })
    })
    await t.page.locator('#catalogue-startDate').fill(t.day)
    await t.page.locator('#catalogue-endDate').fill(t.day)
    await t.page.getByRole('heading', { name: 'No equipment to show.', level: 2 }).waitFor()
    await t.page.unroute(stub)
    await clearAndSample(t, 'enter', unfiltered, 'date range')
  }, VISITOR])
  cases.push(['40.4 [FAIL-NOW] after the landing a single Tab goes where it goes after "Skip to content"; typing works and the reload does not move focus again', async (t) => {
    const unfiltered = await openExplore(t)
    // Reference: where Tab goes from h1#main-content, reached with the skip link.
    await t.page.reload()
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await t.page.locator('a.equipment-card').first().waitFor()
    await t.page.keyboard.press('Tab')
    await assertFocus(t.page, { tag: 'A', name: 'Skip to content' }, 'first Tab')
    await t.page.keyboard.press('Enter')
    await assertFocus(t.page, EXPLORE_HEADING, 'skip link target')
    await t.page.keyboard.press('Tab')
    const expected = await activeInfo(t.page)
    assert.equal(expected.isBody, false, 'the reference Tab reaches a control')
    await noMatch(t)
    await clearAndSample(t, 'enter', unfiltered, 'before Tab')
    await t.page.keyboard.press('Tab')
    const actual = await activeInfo(t.page)
    assert.deepEqual({ tag: actual.tag, id: actual.id, name: actual.name }, { tag: expected.tag, id: expected.id, name: expected.name }, 'a Tab after the landing goes where a Tab after the skip link goes')
    await t.page.locator('#equipment-search').focus()
    await t.page.keyboard.type('cam')
    await settle(t.page, 1000)
    assert.equal(await t.page.locator('#equipment-search').inputValue(), 'cam', 'typing reached the search field')
    await assertFocus(t.page, { id: 'equipment-search', tag: 'INPUT' }, 'typing and the reload do not move focus')
  }, VISITOR])
  cases.push(['40.5 [FAIL-NOW] Retry equipment: still failing it stays on the new Retry button; after a success focus is h1 "Explore"', async (t) => {
    const patterns = ['**/api/v1/assets', '**/api/v1/assets?*']
    for (const pattern of patterns) await inject(t.page, pattern, 'abort', { method: 'GET' })
    await t.page.evaluate(() => { location.hash = '/explore' })
    const retry = t.page.getByRole('button', { name: 'Retry equipment', exact: true })
    await retry.waitFor()
    await activate(t.page, retry, 'enter')
    await t.page.getByText('Finding equipment…').waitFor({ state: 'detached' })
    await landed(t, { tag: 'BUTTON', name: 'Retry equipment' }, 'the retry fails again')
    for (const pattern of patterns) await t.page.unroute(pattern)
    await t.page.keyboard.press('Enter')
    await t.page.locator('a.equipment-card').first().waitFor()
    await landed(t, EXPLORE_HEADING, 'the retry succeeds')
  }, VISITOR])
  cases.push(['40.7 [GUARD] category chips and Clear dates keep focus; the date alert and inline errors are unchanged; the skip link focuses h1', async (t) => {
    await openExplore(t)
    await activate(t.page, chip(t, 'Cameras'), 'enter')
    await landed(t, { tag: 'BUTTON', name: 'Cameras' }, 'category chip')
    assert.equal(await chip(t, 'Cameras').getAttribute('aria-pressed'), 'true')
    await t.page.locator('#catalogue-startDate').fill(t.day)
    await t.page.locator('#catalogue-endDate').fill(t.day)
    await t.page.locator('a.equipment-card').first().waitFor()
    await activate(t.page, t.page.getByRole('button', { name: 'Clear dates', exact: true }), 'enter')
    await landed(t, { tag: 'BUTTON', name: 'Clear dates' }, 'Clear dates')
    assert.equal(await t.page.locator('#catalogue-startDate').inputValue(), '')
    await t.page.locator('#catalogue-startDate').fill(addDays(t.day, 5))
    await t.page.locator('#catalogue-endDate').fill(t.day)
    await t.page.locator('#catalogue-endDate-error').waitFor()
    assert.equal(await t.page.getByText('Check your dates.').count() >= 1, true, 'the date alert is shown')
    await t.page.reload()
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await t.page.keyboard.press('Tab')
    await assertFocus(t.page, { tag: 'A', name: 'Skip to content' }, 'first Tab')
    await t.page.keyboard.press('Enter')
    await assertFocus(t.page, EXPLORE_HEADING, 'the skip link target')
  }, VISITOR])
  cases.push(['40.8 [GUARD] no horizontal overflow in the empty state and after clearing', async (t) => {
    const unfiltered = await openExplore(t)
    await noMatch(t)
    await assertNoOverflow(t.page, 'empty state')
    await activate(t.page, clearAll(t), 'enter')
    await assertReset(t, unfiltered, 'after clearing')
    await assertNoOverflow(t.page, 'after clearing')
  }, VISITOR])
  cases.push(['40.9 [FAIL-NOW][MOCK] mock Explore: Clear all filters lands on h1 "Explore" and resets all three filters', async (t) => {
    await t.page.locator('a.equipment-card').first().waitFor()
    const unfiltered = await cardCount(t)
    await noMatch(t)
    await clearAndSample(t, 'enter', unfiltered, 'mock no-match search')
    await chip(t, 'Cameras').click()
    await noMatch(t)
    await clearAndSample(t, 'pointer', unfiltered, 'mock category plus search')
  }, { modes: ['mock'], bare: true }])
  defineCases(suite, cases)
}

// ---- #41: Sign out, and Retry session --------------------------------------------------------------------------------------

export function issue41(suite) {
  const landed = landing(suite)
  const EXPLORE_HEADING = { id: 'main-content', tag: 'H1', name: 'Explore' }
  const SIGNED_OUT = /^Signed out\. Your (demo )?session has ended\.$/
  const UNCONFIRMED = 'You are signed out on this device, but the server could not be reached, so it was not told to end the session. It stays valid on the server for up to 24 hours from sign-in.'
  const signOut = (t) => t.page.getByRole('button', { name: 'Sign out', exact: true })
  const headerSignIn = (t) => t.page.locator('.account-area').getByRole('link', { name: 'Sign in' })
  const sidebar = (t) => t.page.locator('nav[aria-label="Main navigation"] a').allInnerTexts().then((texts) => texts.map((text) => text.trim()))
  const openRoute = async (t, route, heading) => {
    await t.page.evaluate((target) => { location.hash = target }, route)
    await t.page.getByRole('heading', { name: heading, level: 1 }).waitFor()
    await signOut(t).waitFor()
  }
  /** The signed-out state every sign-out ends in: header, sidebar, no session token, no Sign out button. */
  const assertSignedOut = async (t, sidebarItems, label) => {
    assert.equal(await headerSignIn(t).count(), 1, `${label}: the header shows the Sign in link`)
    assert.equal(await signOut(t).count(), 0, `${label}: there is no Sign out button`)
    assert.deepEqual(await sidebar(t), sidebarItems, `${label}: sidebar`)
    assert.equal(await t.h.token(), null, `${label}: the local token is removed`)
  }
  const STUDENT_NAV = ['Explore', 'My reservations']
  const COORDINATOR_NAV = ['Explore', 'My reservations', 'Coordinator desk', 'Inventory']
  const COORDINATOR = { as: 'coordinator-session', modes: ['http'] }
  const STUDENT = { modes: ['http'] }
  const cases = []
  for (const how of ['enter', 'pointer']) {
    cases.push([`${how === 'enter' ? '41.1' : '41.6'} [FAIL-NOW] ${how}: a student signing out on Explore lands on h1 "Explore"; header, sidebar and the old token as before`, async (t) => {
      await openRoute(t, '/explore', 'Explore')
      await activate(t.page, signOut(t), how)
      await t.page.getByText('Signed out. Your session has ended.').waitFor()
      await landed(t, EXPLORE_HEADING, `sign out (${how})`)
      await assertSignedOut(t, STUDENT_NAV, `student sign out (${how})`)
      assert.equal((await suite.as(t.token, '/api/v1/auth/me', undefined, 'GET')).status, 401, 'the old token is refused')
    }, STUDENT])
  }
  cases.push(['41.2 [FAIL-NOW] a coordinator signing out on Explore lands on h1 "Explore"; the sidebar loses Coordinator desk and Inventory', async (t) => {
    await openRoute(t, '/explore', 'Explore')
    assert.deepEqual(await sidebar(t), COORDINATOR_NAV)
    await activate(t.page, signOut(t), 'enter')
    await t.page.getByText('Signed out. Your session has ended.').waitFor()
    await landed(t, EXPLORE_HEADING, 'coordinator sign out')
    await assertSignedOut(t, STUDENT_NAV, 'coordinator sign out')
    assert.equal((await suite.as(t.sessionToken, '/api/v1/auth/me', undefined, 'GET')).status, 401, 'the old token is refused')
  }, COORDINATOR])
  for (const [route, heading, options, who] of [
    ['/reservations', 'My reservations', STUDENT, 'student'], ['/assets/ASSET', 'Equipment detail', STUDENT, 'student'],
    ['/desk', 'Coordinator desk', COORDINATOR, 'coordinator'], ['/inventory', 'Inventory', COORDINATOR, 'coordinator'],
  ]) {
    cases.push([`41.3 [GUARD] ${who} signing out from ${route.replace('/ASSET', '/<id>')} ends on #/explore with h1 "Explore" focused`, async (t) => {
      await openRoute(t, route.replace('ASSET', t.assetId), heading)
      await activate(t.page, signOut(t), 'enter')
      await t.page.getByText('Signed out. Your session has ended.').waitFor()
      await landed(t, EXPLORE_HEADING, `sign out from ${route}`)
      assert.match(await t.page.evaluate(() => location.hash), /^#\/explore/)
      await assertSignedOut(t, STUDENT_NAV, `sign out from ${route}`)
    }, options])
  }
  // 41.4a-c (and 41.9, the reachability record: after any failed logout there is no Sign out button, the header shows Sign in).
  for (const [id, label, kind] of [['41.4a', 'aborted', 'abort'], ['41.4b', 'answered 500', '500'], ['41.4c', 'answered 401 (the session was already revoked)', '401']]) {
    cases.push([`${id}/41.9 [FAIL-NOW] a logout ${label} on Explore ends the local session and lands on h1 "Explore"; no Sign out button remains`, async (t) => {
      await openRoute(t, '/explore', 'Explore')
      if (kind === '401') {
        const revoked = await suite.as(t.token, '/api/v1/auth/logout')
        assert.ok([200, 204].includes(revoked.status), `logout status ${revoked.status}`)
      } else await inject(t.page, '**/api/v1/auth/logout', kind, { method: 'POST' })
      await activate(t.page, signOut(t), 'enter')
      if (kind === '401') await t.page.getByText('Signed out. Your session has ended.').waitFor()
      else {
        await t.page.getByRole('alert').filter({ hasText: UNCONFIRMED }).waitFor()
        assert.equal(await t.page.locator('.service-notice[role="alert"]').innerText(), UNCONFIRMED, 'the unconfirmed-logout notice')
      }
      await landed(t, EXPLORE_HEADING, `logout ${label}`)
      await assertSignedOut(t, STUDENT_NAV, `logout ${label}`)
      if (kind === '401') assert.equal(await t.page.getByText(UNCONFIRMED).count(), 0, 'the unconfirmed notice is not shown for an already revoked session')
    }, STUDENT])
  }
  cases.push(['41.5 [FAIL-NOW] Retry session: still failing it stays on the new Retry button; after a success focus is h1 "Explore" and the header is signed in', async (t) => {
    await inject(t.page, '**/api/v1/auth/me', 'abort', { method: 'GET' })
    await t.page.reload()
    const retry = t.page.getByRole('button', { name: 'Retry session', exact: true })
    await retry.waitFor()
    await activate(t.page, retry, 'enter')
    await t.page.getByText('Loading your workspace…').waitFor({ state: 'detached' })
    await landed(t, { tag: 'BUTTON', name: 'Retry session' }, 'the retry fails again')
    await t.page.unroute('**/api/v1/auth/me')
    await t.page.keyboard.press('Enter')
    await signOut(t).waitFor()
    await landed(t, { id: 'main-content', tag: 'H1' }, 'the retry succeeds')
  }, STUDENT])
  cases.push(['41.7 [GUARD] the skip link and sign-in success still end on h1; no horizontal overflow after signing out', async (t) => {
    await openRoute(t, '/explore', 'Explore')
    await activate(t.page, signOut(t), 'enter')
    await t.page.getByText('Signed out. Your session has ended.').waitFor()
    await settle(t.page)
    await assertNoOverflow(t.page, 'after sign out')
    await t.page.reload()
    await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
    await t.page.keyboard.press('Tab')
    await assertFocus(t.page, { tag: 'A', name: 'Skip to content' }, 'first Tab')
    await t.page.keyboard.press('Enter')
    await assertFocus(t.page, EXPLORE_HEADING, 'the skip link target')
    await t.page.evaluate(() => { location.hash = '/signin' })
    await t.page.getByRole('heading', { name: 'Sign in to GearShare', level: 2 }).waitFor()
    await t.page.locator('#username').fill(t.student.username)
    await t.page.locator('#password').fill(t.student.password)
    await t.page.locator('#password').focus()
    await t.page.keyboard.press('Enter')
    await t.page.getByText(`Signed in as ${t.student.username}.`).waitFor()
    await landed(t, EXPLORE_HEADING, 'sign-in success')
  }, STUDENT])
  cases.push(['41.8 [FAIL-NOW][MOCK] mock: signing out on Explore as maya_student and as alex_coordinator lands on h1 "Explore"', async (t) => {
    for (const [username, password, nav] of [['maya_student', 'StudentDemo42!', STUDENT_NAV], ['alex_coordinator', 'CoordinatorDemo42!', COORDINATOR_NAV]]) {
      await t.h.signIn(username, password, 'explore')
      await t.page.getByRole('heading', { name: 'Explore', level: 1 }).waitFor()
      assert.deepEqual(await sidebar(t), nav, `${username}: sidebar`)
      await activate(t.page, signOut(t), 'enter')
      await t.page.getByText('Signed out. Your demo session has ended.').waitFor()
      await landed(t, EXPLORE_HEADING, `mock sign out (${username})`)
      assert.equal(await headerSignIn(t).count(), 1, `${username}: the header shows Sign in`)
    }
  }, { modes: ['mock'], bare: true }])
  defineCases(suite, cases)
}

// Cheap checks for the #15 usability regressions and their shared helpers (support/ux.mjs). The browser suites are
// http.ux.browser.mjs (real stack) and ux.mock.browser.mjs (mock adapter); this file needs no browser or server.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { addDays } from './support/browserKit.mjs'
import { ALLOW_LIST, DATA_EYEBROWS, FONT_FLOOR, KICKER_EYEBROW, declarationsFor, fontSizesUnder, horizonEnd, monthLabel, monthPlan, monthsBetween, parseCss, selectedIssue, selectorAllowed, shiftMonth, wrapChain, wrapsAnywhere } from './support/ux.mjs'

describe('support/ux.mjs helpers', () => {
  it('UX_ISSUES filters issue blocks and an empty filter runs every block', () => {
    const saved = process.env.UX_ISSUES
    try {
      delete process.env.UX_ISSUES
      assert.equal(selectedIssue(32), true)
      process.env.UX_ISSUES = ''
      assert.equal(selectedIssue(36), true)
      process.env.UX_ISSUES = '31, 32'
      assert.deepEqual([31, 32, 36].map(selectedIssue), [true, true, false])
      process.env.UX_ISSUES = '36,37'
      assert.deepEqual([31, 36, 37, 38].map(selectedIssue), [false, true, true, false])
    } finally {
      if (saved === undefined) delete process.env.UX_ISSUES; else process.env.UX_ISSUES = saved
    }
  })

  it('month arithmetic crosses years and labels the heading like the calendar', () => {
    assert.equal(shiftMonth('2026-12', 1), '2027-01')
    assert.equal(shiftMonth('2027-01', -1), '2026-12')
    assert.equal(monthsBetween('2026-10', '2027-01'), 3)
    assert.equal(monthLabel('2027-01'), 'January 2027')
    assert.equal(horizonEnd('2026-10-25'), '2027-01-23')
  })

  it('monthPlan picks free days inside a month that is fully inside the horizon, for every club date of two years', () => {
    for (let offset = 0; offset < 730; offset++) {
      const today = addDays('2026-01-01', offset)
      const end = horizonEnd(today)
      const plan = monthPlan(today)
      assert.ok(plan.steps >= 1 && plan.steps <= 3, `${today}: steps ${plan.steps}`)
      assert.ok(plan.first > today.slice(0, 7) && plan.days.length >= 2, `${today}: later month with days`)
      assert.equal(new Set(plan.days).size, plan.days.length, `${today}: distinct days`)
      for (const day of plan.days) assert.ok(day.startsWith(plan.month) && day >= plan.first && day <= plan.last && day > today && day <= end, `${today}: ${day} in ${plan.month}`)
      assert.equal(plan.days[0], Number(plan.last.slice(8)) >= 11 ? addDays(plan.last, -10) : plan.last, `${today}: D`)
      const lastMonth = monthPlan(today, { lastMonth: true })
      assert.equal(lastMonth.month, end.slice(0, 7), `${today}: last month plan uses the horizon-end month`)
      assert.equal(lastMonth.isLastMonth, true)
      for (const day of lastMonth.days) assert.ok(day.startsWith(lastMonth.month) && day <= end && day > today, `${today}: last-month day ${day}`)
    }
    const plan = monthPlan('2026-10-25')
    assert.deepEqual({ month: plan.month, label: plan.label, steps: plan.steps, days: plan.days.slice(0, 2) }, { month: '2027-01', label: 'January 2027', steps: 3, days: ['2027-01-13', '2027-01-16'] })
  })

  it('parseCss reads rules, @media rules and nested parentheses; wrapsAnywhere accepts the wrapping declarations', () => {
    const rules = parseCss(`
      /* comment */ .a, .b { overflow-wrap: anywhere; min-width: 0 }
      .c { background: url(data:image/svg+xml;utf8,<svg/>); width: calc(100% - 4px) }
      @media (max-width: 600px) { .a { word-break: break-word } .d { display: none } }
      @media (min-width: 601px) and (max-width: 900px) { .e { gap: 4px } }
    `)
    assert.deepEqual(declarationsFor(rules, '.b'), { 'overflow-wrap': 'anywhere', 'min-width': '0' })
    assert.equal(declarationsFor(rules, '.c').width, 'calc(100% - 4px)')
    assert.deepEqual(declarationsFor(rules, '.a', { media: '@media (max-width: 600px)' }), { 'word-break': 'break-word' })
    assert.deepEqual(declarationsFor(rules, '.d'), {})
    assert.equal(wrapsAnywhere(declarationsFor(rules, '.a')), true)
    assert.equal(wrapsAnywhere(declarationsFor(rules, '.a', { media: '@media (max-width: 600px)' })), true)
    assert.equal(wrapsAnywhere({ 'overflow-wrap': 'normal' }), false)
    assert.equal(wrapsAnywhere({ 'text-overflow': 'ellipsis' }), false)
    assert.equal(rules.find(rule => rule.selectors.includes('.e')).media, '@media (min-width: 601px) and (max-width: 900px)')
  })
})

// The shared wrapping rule of design-system.md "User-entered text wrapping": text typed by people wraps at any character
// inside its container, and the grid or flex child that holds it can shrink (min-width: 0). These stylesheet checks are the
// cheap half of each wrapping bug; the browser suites measure the real layout.
const styles = parseCss(readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8'))

describe('user-entered text wrapping in styles.css', () => {
  it('37.11 asset detail: name, description and eyebrow wrap at any character, and their grid column can shrink', () => {
    for (const chain of [['.asset-heading h2', '.asset-heading', '.asset-identity'], ['.asset-description', '.asset-identity'], ['.asset-heading .eyebrow', '.asset-heading', '.asset-identity']]) {
      const found = wrapChain(styles, chain)
      assert.equal(found.ok, true, `${chain[0]}: no wrapping declaration along ${chain.join(' < ')} (found ${found.selector})`)
    }
    assert.equal(declarationsFor(styles, '.asset-identity')['min-width'], '0', '.asset-identity is a grid item and must be allowed to shrink')
    assert.equal(declarationsFor(styles, '.asset-detail-grid', { media: '@media (max-width: 1099px)' })['grid-template-columns'], 'minmax(0, 1fr)', 'the one-column layout (up to 1099 px) uses minmax(0, 1fr)')
  })

  it('38 My reservations: the list track and the row text column can shrink, and the name wraps at any character', () => {
    const found = wrapChain(styles, ['.reservation-row h3', '.reservation-row > div', '.reservation-row'])
    assert.equal(found.ok, true, `.reservation-row h3: no wrapping declaration along .reservation-row h3 < .reservation-row > div < .reservation-row (found ${found.selector})`)
    assert.equal(declarationsFor(styles, '.reservation-row > div')['min-width'], '0', 'the flex child that holds the text must be allowed to shrink')
    assert.match(declarationsFor(styles, '.reservation-list')['grid-template-columns'] ?? '', /^minmax\(0, 1fr\)$/, 'the list is a grid whose single track must not grow with a long name')
    // The side-by-side (601 px and up) and stacked (600 px and below) row layouts stay as they were.
    assert.equal(declarationsFor(styles, '.reservation-row')['flex-direction'] ?? 'row', 'row')
    assert.equal(declarationsFor(styles, '.reservation-row', { media: '@media (max-width: 600px)' })['flex-direction'], 'column')
  })
})

// ---- #42: the stylesheet half of the informational-text floor ----------------------------------------------------------------
// design-system.md "Minimum size for informational text": no `font-size` under 12 px (or 0.75rem) outside the closed allow-list,
// including inside every @media block. The browser scan in the UX suites measures the real screens; this check covers what a
// scan can miss (pending-only text, error variants, rules for states that are hard to reach) and never replaces it.
const designSystem = readFileSync(new URL('../../_docs/design-system.md', import.meta.url), 'utf8')

describe('#42 informational text floor in styles.css', () => {
  it('42.9 no font-size under 12 px or 0.75rem outside the closed allow-list, in the base rules and in every @media block', () => {
    const offenders = fontSizesUnder(styles, FONT_FLOOR).filter((found) => !selectorAllowed(found.selector))
    assert.deepEqual(offenders.map((found) => `${found.media ?? 'base'} :: ${found.selector} { font-size: ${found.size} }`), [])
  })

  it('the checker sees what it must: base and @media sizes, rem, the font shorthand and pseudo-elements, and honors the allow-list', () => {
    const rules = parseCss('.a { font-size: 10px } .b::before { font-size: 11px } @media (max-width: 719px) { .c { font-size: .7rem } .d { font: 600 9px/1.2 sans-serif } .e { font-size: 12px } .f { font-size: 0.75rem } }')
    assert.deepEqual(fontSizesUnder(rules).map((found) => `${found.media ?? 'base'} ${found.selector}`), ['base .a', 'base .b::before', '@media (max-width: 719px) .c', '@media (max-width: 719px) .d'])
    assert.equal(selectorAllowed('.page-footer'), true)
    assert.equal(selectorAllowed('.brand small'), true)
    assert.equal(selectorAllowed('.auth-story .eyebrow'), true, 'a kicker eyebrow')
    assert.equal(selectorAllowed('.credential-row code'), true, 'the mock harness')
    for (const selector of DATA_EYEBROWS) assert.equal(selectorAllowed(selector), false, `${selector} shows data and is not exempt`)
    for (const selector of ['.account-name', '.account-name small', '.field-hint', '.staff-table td::before', '.calendar-week', '.day-unavailable-icon']) assert.equal(selectorAllowed(selector), false, `${selector} is checked`)
  })

  it('the allow-list array is the list in design-system.md, so the stylesheet check and the browser scan cannot drift from it', () => {
    const section = designSystem.slice(designSystem.indexOf('### Minimum size for informational text'))
    const listed = section.slice(section.indexOf('everything else is checked:'), section.indexOf('An eyebrow that shows')).match(/`[^`]+`/g).map((token) => token.slice(1, -1))
    assert.deepEqual(listed, [...ALLOW_LIST, KICKER_EYEBROW])
    for (const selector of DATA_EYEBROWS.filter((entry) => entry.startsWith('.asset-heading'))) assert.ok(section.includes(`\`${selector}\``), `${selector} is named as not exempt`)
    assert.ok(section.includes('descendants of `.demo-banner`') && section.includes('`.credentials`'), 'the mock harness exemption is the one in the rule')
  })

  it('the harness-only classes are rendered only inside the harness', () => {
    const demo = readFileSync(new URL('../src/components/DemoControls.tsx', import.meta.url), 'utf8')
    assert.match(demo, /className="demo-banner"/, 'DemoControls renders inside .demo-banner')
    for (const root of ['demo-badge', 'demo-controls', 'club-date']) {
      const users = ['App.tsx', 'pages/AuthPage.tsx', 'pages/AssetDetailPage.tsx', 'pages/CataloguePage.tsx', 'pages/CoordinatorPage.tsx', 'pages/InventoryPage.tsx', 'pages/ReservationsPage.tsx'].filter((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').includes(root))
      assert.deepEqual(users, [], `${root} is used outside DemoControls.tsx: ${users.join(', ')}`)
    }
    const auth = readFileSync(new URL('../src/pages/AuthPage.tsx', import.meta.url), 'utf8')
    assert.ok(auth.indexOf('credential-row') > auth.indexOf('className="credentials"'), '.credential-row is inside the .credentials block')
  })
})

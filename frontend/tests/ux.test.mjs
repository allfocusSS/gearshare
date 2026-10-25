// Cheap checks for the #15 usability regressions and their shared helpers (support/ux.mjs). The browser suites are
// http.ux.browser.mjs (real stack) and ux.mock.browser.mjs (mock adapter); this file needs no browser or server.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addDays } from './support/browserKit.mjs'
import { declarationsFor, horizonEnd, monthLabel, monthPlan, monthsBetween, parseCss, selectedIssue, shiftMonth, wrapsAnywhere } from './support/ux.mjs'

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

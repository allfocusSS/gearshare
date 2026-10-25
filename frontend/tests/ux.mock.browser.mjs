import { spawn } from 'node:child_process'
import { after, before, describe } from 'node:test'
import { frontendDir, launchBrowser, outputFolder, writeJson } from './support/stack.mjs'
import { addDays, clubToday, createHelpers, newStudent } from './support/browserKit.mjs'
import { issue31, selectedIssue } from './support/ux.mjs'
const suite = { mode: 'mock', base: 'http://127.0.0.1:6243', output: outputFolder('mock-ux'), records: [] }
let server, browser
before(async () => {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '6243', '--strictPort'], { cwd: frontendDir, stdio: 'ignore', env: { ...process.env, VITE_GEARSHARE_SERVICE: 'mock' } })
  for (let i = 0; i < 100; i++) { try { if ((await fetch(suite.base)).ok) break } catch {} await new Promise(resolve => setTimeout(resolve, 100)) }
  browser = await launchBrowser()
})
after(async () => { writeJson(suite.output, 'evidence.json', suite.records); await browser?.close(); server?.kill() })
suite.fresh = async (width, name) => {
  // Every fresh browser context has its own isolated mock store, fresh unit and student.
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Almaty' })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  const h = createHelpers(page, suite.base)
  const student = newStudent('ux31mock')
  if (name.startsWith('31.10 ')) {
    await page.goto(`${suite.base}/#/signin?returnTo=assets/camera-01`)
    await page.getByRole('button', { name: 'Fill student credentials', exact: true }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  } else await h.register(student.username, student.password, 'assets/camera-01')
  await page.getByRole('button', { name: 'Request equipment', exact: true }).waitFor()
  // Observe the real mock adapter without replacing its behavior or manufacturing error fields.
  await page.evaluate(async () => {
    const { gearShareService } = await import('/src/services/index.ts')
    const requestBooking = gearShareService.requestBooking.bind(gearShareService)
    window.__uxBookingProbe = { calls: 0, results: [] }
    gearShareService.requestBooking = async input => {
      window.__uxBookingProbe.calls += 1
      const result = await requestBooking(input)
      window.__uxBookingProbe.results.push(result)
      return result
    }
  })
  const today = clubToday()
  return { page, context, width, name, today, day: addDays(today, 20) }
}
suite.conflict = async t => t.page.getByRole('button', { name: 'Simulate next-request conflict', exact: true }).click()
suite.fail = async t => t.page.getByRole('button', { name: 'Simulate next-request failure', exact: true }).click()
describe('issue #31 — mock shared date validation (includes 31.10)', { skip: !selectedIssue(31), concurrency: false }, () => issue31(suite))

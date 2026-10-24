/** #26: fresh contexts, unfiltered diagnostics, real icon delivery in dev and preview. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../test-results/resources/', import.meta.url)
const results = []
await mkdir(output, { recursive: true })
// This suite checks the local icon in the explicit mock build (HTTP mode would call a backend that is not running here).
// Build it into an ignored folder so the normal dist/ is untouched.
const mockEnv = { ...process.env, VITE_GEARSHARE_SERVICE: 'mock' }
const previewDist = 'test-results/resources/dist'
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', previewDist, '--emptyOutDir'], { cwd: frontend, env: mockEnv, stdio: 'pipe' })
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  for (const [mode, port] of [['dev', 5173], ['dev', 5196], ['preview', 5197]]) {
    const base = `http://127.0.0.1:${port}`
    const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(mode === 'preview' ? ['preview', '--outDir', previewDist] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: frontend, stdio: ['ignore', 'pipe', 'pipe'], env: mockEnv })
    let log = ''
    server.stdout.on('data', chunk => { log += chunk })
    server.stderr.on('data', chunk => { log += chunk })
    try {
      let ready = false
      for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw new Error(`Server exited: ${log}`)
        try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      assert.ok(ready, log)
      for (const width of [390, 1440]) {
        for (const [route, heading] of [['explore', 'Explore'], ['signin', 'Sign in'], ['register', 'Create an account']]) {
          const context = await browser.newContext({ viewport: { width, height: 1000 } })
          try {
            const page = await context.newPage()
            const errors = [], failedRequests = [], failedResponses = [], iconResponses = []
            page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
            page.on('pageerror', error => errors.push(error.message))
            page.on('requestfailed', request => failedRequests.push(request.url()))
            // CDP also observes browser-initiated icon requests.
            const cdp = await context.newCDPSession(page)
            await cdp.send('Network.enable')
            cdp.on('Network.responseReceived', ({ response }) => {
              if (response.status >= 400) failedResponses.push({ url: response.url, status: response.status })
              if (/favicon\.(svg|ico)(?:\?|$)/.test(response.url)) iconResponses.push({ url: response.url, status: response.status, type: response.mimeType })
            })
            await page.goto(`${base}/#/${route}`)
            await page.getByRole('heading', { name: heading, exact: true }).waitFor()
            const icon = await page.locator('link[rel="icon"]').evaluate(element => element.href)
            assert.equal(icon, `${base}/favicon.svg`)
            const response = await context.request.get(icon)
            assert.equal(response.status(), 200)
            assert.match(response.headers()['content-type'], /image\/svg\+xml/)
            const body = await response.body()
            assert.ok(body.length > 0)
            assert.match(body.toString(), /<svg[^>]+viewBox="0 0 64 64"/)
            // Decode it as an image too: an HTML fallback or malformed SVG must fail.
            const image = await page.evaluate(async url => {
              const image = new Image(); image.src = url; await image.decode()
              return { width: image.naturalWidth, height: image.naturalHeight }
            }, icon)
            assert.ok(image.width > 0 && image.height > 0)
            await page.waitForTimeout(300)
            assert.ok(iconResponses.some(response => response.status === 200 && response.type === 'image/svg+xml'), 'Browser must successfully load the icon')
            assert.deepEqual(errors, [])
            assert.deepEqual(failedRequests, [])
            assert.deepEqual(failedResponses, [])
            const result = { mode, port, width, route, status: response.status(), bytes: body.length, contentType: response.headers()['content-type'], image, iconResponses, errors, failedRequests, failedResponses }
            results.push(result)
            console.log(`PASS ${mode}:${port} ${width}px /#/${route}: icon 200, ${body.length} bytes; no errors`)
          } finally { await context.close() }
        }
      }
    } finally {
      server.kill('SIGTERM')
      if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve))
    }
  }
} finally {
  await browser.close()
  await writeFile(new URL('results.json', output), JSON.stringify(results, null, 2))
}

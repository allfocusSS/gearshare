// Real-stack harness for the HTTP browser suites: a temp-file SQLite database migrated with Alembic, a trusted coordinator,
// the real FastAPI app under Uvicorn (GEARSHARE_STORE=sqlalchemy) and the real Vite dev server with its /api proxy.
// Nothing here is mocked. Ports default into 6200-6299; everything is stopped and the temp directory removed on stop().
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

export const frontendDir = fileURLToPath(new URL('../../', import.meta.url))
export const backendDir = fileURLToPath(new URL('../../../backend/', import.meta.url))
const seedScript = fileURLToPath(new URL('./seed_coordinator.py', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(url, label, owner, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (owner.exited) throw new Error(`${label} exited early (code ${owner.code}):\n${owner.log()}`)
    try { if ((await fetch(url)).ok) return } catch { /* not listening yet */ }
    await sleep(150)
  }
  throw new Error(`${label} did not become ready at ${url}:\n${owner.log()}`)
}

function supervise(command, args, options) {
  // A new process group lets stop() end `uv run` together with the Python process it starts.
  const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const state = { child, exited: false, code: null, text: '' }
  const collect = (chunk) => { state.text = (state.text + chunk).slice(-20_000) }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.on('exit', (code) => { state.exited = true; state.code = code })
  state.log = () => state.text
  state.stop = async () => {
    if (state.exited) return
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
    for (let i = 0; i < 100 && !state.exited; i++) await sleep(50)
    if (!state.exited) { try { process.kill(-child.pid, 'SIGKILL') } catch { /* gone */ } for (let i = 0; i < 40 && !state.exited; i++) await sleep(50) }
  }
  return state
}

export async function startStack({ backendPort = Number(process.env.GEARSHARE_HTTP_BACKEND_PORT ?? 6201), vitePort = Number(process.env.GEARSHARE_HTTP_VITE_PORT ?? 6202), viteEnv = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gearshare-http-'))
  const databaseUrl = `sqlite:///${join(dir, 'gearshare.sqlite3')}`
  const coordinator = { username: `desk_${randomBytes(3).toString('hex')}`, password: `Cd-${randomBytes(9).toString('hex')}` }
  const backendUrl = `http://127.0.0.1:${backendPort}`
  const frontendUrl = `http://127.0.0.1:${vitePort}`
  const backendEnv = { ...process.env, GEARSHARE_STORE: 'sqlalchemy', GEARSHARE_DATABASE_URL: databaseUrl }
  // Migrate an empty file-backed database, then add the trusted coordinator (see seed_coordinator.py).
  execFileSync('uv', ['run', '--locked', 'alembic', 'upgrade', 'head'], { cwd: backendDir, env: backendEnv, stdio: 'pipe' })
  execFileSync('uv', ['run', '--locked', 'python', seedScript], { cwd: backendDir, env: { ...backendEnv, PYTHONPATH: '.', E2E_COORDINATOR_USERNAME: coordinator.username, E2E_COORDINATOR_PASSWORD: coordinator.password }, stdio: 'pipe' })

  const stack = { dir, databaseUrl, coordinator, backendUrl, frontendUrl, backend: null, vite: null }
  stack.startBackend = async () => {
    const backend = supervise('uv', ['run', '--locked', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(backendPort), '--log-level', 'warning'], { cwd: backendDir, env: backendEnv })
    stack.backend = backend
    await waitFor(`${backendUrl}/health`, 'backend', backend)
  }
  stack.stopBackend = async () => { await stack.backend?.stop(); stack.backend = null }
  stack.restartBackend = async () => { await stack.stopBackend(); await stack.startBackend() }

  // HTTP is the default adapter: the selector variables are removed so the suite proves the default.
  const viteEnvironment = { ...process.env, GEARSHARE_API_PROXY_TARGET: backendUrl, ...viteEnv }
  delete viteEnvironment.VITE_GEARSHARE_SERVICE
  delete viteEnvironment.VITE_API_BASE_URL
  stack.startVite = async () => {
    const vite = supervise(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: frontendDir, env: viteEnvironment })
    stack.vite = vite
    await waitFor(frontendUrl, 'vite', vite)
  }
  stack.stop = async () => {
    await stack.vite?.stop()
    await stack.stopBackend()
    rmSync(dir, { recursive: true, force: true })
  }
  stack.logs = () => ({ backend: stack.backend?.log() ?? '', vite: stack.vite?.log() ?? '' })
  try {
    await stack.startBackend()
    await stack.startVite()
  } catch (error) {
    await stack.stop()
    throw error
  }
  return stack
}

/** Direct HTTP to the backend, bypassing the browser and Vite: used to check server policy independently of the UI. */
export async function api(stack, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${stack.backendUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* leave null */ }
  return { status: response.status, json, headers: Object.fromEntries(response.headers) }
}

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
}

/** Ignored output folder with screenshots, results and failure logs. */
export function outputFolder(name) {
  const folder = join(frontendDir, 'test-results', name)
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  return folder
}

export function writeJson(folder, name, value) { writeFileSync(join(folder, name), JSON.stringify(value, null, 2)) }

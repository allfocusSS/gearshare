import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { parse } from 'yaml'
import { SESSION_STORAGE_KEY, createTokenStore } from '../src/services/httpClient.ts'
import { createHttpService } from '../src/services/httpService.ts'
import { TOKEN, createFakeFetch, errorBody, memoryStorage, reply } from './support/fakeFetch.mjs'

// #13/#14 conformance: every request the HTTP adapter makes is checked against the versioned root openapi.yml
// (method, path template, query parameters, JSON request body schema, security), using the 93 wire samples the QA-passed
// mock produced. The same samples are fed back as server answers: the adapter must return what the mock returned.
const repo = new URL('../../', import.meta.url)
const spec = parse(readFileSync(new URL('openapi.yml', repo), 'utf8'))
const samples = JSON.parse(readFileSync(new URL('./fixtures/contract-samples.json', import.meta.url), 'utf8')).samples

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false })
ajv.addSchema({ $id: 'https://gearshare.test/openapi', ...spec })
const schema = (ref) => ajv.compile({ $ref: `https://gearshare.test/openapi#/components/schemas/${ref}` })
const component = (name) => spec.components.schemas[name]
const resolve = (node) => (node?.$ref ? component(node.$ref.split('/').at(-1)) : node)

const operations = []
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!op['x-service-method']) continue
    const body = op.requestBody?.content?.['application/json']?.schema
    operations.push({
      method: method.toUpperCase(), path, op, name: op['x-service-method'],
      regex: new RegExp(`^${path.replace(/\{[^}]+\}/g, '([^/?]+)')}$`),
      bearer: (op.security ?? []).length > 0,
      queryNames: (op.parameters ?? []).filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name),
      bodySchema: body ? { name: body.$ref.split('/').at(-1), validate: schema(body.$ref.split('/').at(-1)), properties: Object.keys(resolve(body).properties) } : null,
    })
  }
}

const argsFor = {
  listAssets: (r) => [r.query ?? {}], getAsset: (r) => [r.path.assetId], getAssetAvailability: (r) => [r.path.assetId],
  login: (r) => [r.body], register: (r) => [r.body], logout: () => [], currentUser: () => [],
  requestBooking: (r) => [r.body], listBookings: () => [], getBooking: (r) => [r.path.bookingId], cancelBooking: (r) => [r.path.bookingId, r.body],
  listStaffBookings: () => [], approveBooking: (r) => [r.path.bookingId, r.body], rejectBooking: (r) => [r.path.bookingId, r.body],
  checkoutBooking: (r) => [r.path.bookingId, r.body], returnBooking: (r) => [r.path.bookingId, r.body],
  listInventory: () => [], addAsset: (r) => [r.body], editAsset: (r) => [r.path.assetId, r.body], setAssetState: (r) => [r.path.assetId, r.body.state],
}

/** `x-trimmed` fields are checked after trimming, exactly as the contract describes (api.md "Text trimming"). */
function trimmed(body, definition) {
  const properties = resolve(definition).properties
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === 'string' && properties[key]?.['x-trimmed'] ? value.trim() : value]))
}

function locate(call) {
  const url = new URL(call.url, 'http://adapter.test')
  const matches = operations.filter((operation) => operation.method === call.method && operation.regex.test(url.pathname))
  assert.equal(matches.length, 1, `${call.method} ${url.pathname} must match exactly one openapi.yml operation`)
  return { operation: matches[0], url, params: matches[0].regex.exec(url.pathname).slice(1).map(decodeURIComponent) }
}

function checkRequest(call, expected, invalidInput) {
  const { operation, url, params } = locate(call)
  assert.equal(operation.name, expected, `${call.method} ${url.pathname} is operation ${operation.name}, not ${expected}`)
  for (const name of url.searchParams.keys()) assert.ok(operation.queryNames.includes(name), `${expected}: undeclared query parameter ${name}`)
  assert.equal(call.headers.Authorization !== undefined, operation.bearer && call.hadToken, `${expected}: bearer token only on secured operations`)
  assert.equal(call.headers.Accept, 'application/json')
  if (operation.bodySchema) {
    assert.ok(call.body && typeof call.body === 'object', `${expected}: request body required`)
    assert.equal(call.headers['Content-Type'], 'application/json')
    const extra = Object.keys(call.body).filter((key) => !operation.bodySchema.properties.includes(key))
    assert.deepEqual(extra, [], `${expected}: only ${operation.bodySchema.name} properties may be sent`)
    if (!invalidInput) {
      const body = trimmed(call.body, { $ref: `#/components/schemas/${operation.bodySchema.name}` })
      assert.equal(operation.bodySchema.validate(body), true, `${expected}: body violates ${operation.bodySchema.name}: ${JSON.stringify(operation.bodySchema.validate.errors)}`)
    }
  } else {
    assert.equal(call.body, undefined, `${expected}: no request body`)
    assert.equal(call.headers['Content-Type'], undefined)
  }
  return { operation, params, url }
}

function adapter(handler, { token = true } = {}) {
  const fake = createFakeFetch((call, index) => { call.hadToken = token; return handler(call, index) })
  const storage = memoryStorage(token ? { [SESSION_STORAGE_KEY]: TOKEN } : {})
  const { service } = createHttpService({ fetch: fake.fetch, tokens: createTokenStore(() => storage), timeoutMs: 2000 })
  return { service, calls: fake.calls }
}

test('the adapter implements exactly the operations of openapi.yml, one method each', () => {
  const { service } = adapter(() => reply(200, {}))
  assert.equal(operations.length, 20)
  assert.deepEqual(Object.keys(service).sort(), operations.map((operation) => operation.name).sort())
  assert.equal(new Set(operations.map((operation) => `${operation.method} ${operation.path}`)).size, 20)
})

for (const [index, entry] of samples.entries()) {
  test(`contract sample ${index} ${entry.method}${entry.label ? ` / ${entry.label}` : ''} (${entry.status}): request conforms to openapi.yml and the answer maps like the mock`, async () => {
    const anonymous = /anonymous/.test(entry.label)
    const wire = (entry.method === 'login' || entry.method === 'register') && entry.status < 300
      ? { token: TOKEN, expiresAt: '2026-10-25T08:00:00.000000Z', user: entry.body }
      : entry.body
    const { service, calls } = adapter(() => (entry.status === 204 ? reply(204) : reply(entry.status, wire)), { token: !anonymous })
    const result = await service[entry.method](...argsFor[entry.method](entry.request))
    assert.equal(calls.length, 1)
    const { params } = checkRequest(calls[0], entry.method, entry.schemaInvalid === true)
    const pathValues = Object.values(entry.request.path ?? {})
    assert.deepEqual(params, pathValues, 'path parameters are the identifiers the caller supplied')
    const query = Object.fromEntries(new URL(calls[0].url, 'http://adapter.test').searchParams)
    const wanted = Object.fromEntries(Object.entries(entry.request.query ?? {}).filter(([, value]) => value !== '' && value !== undefined))
    assert.deepEqual(query, wanted)

    if (entry.status < 300) {
      assert.equal(result.ok, true, JSON.stringify(result))
      assert.deepEqual(result.data, entry.method === 'logout' ? null : entry.body)
    } else {
      assert.equal(result.ok, false)
      assert.equal(result.error.code, entry.body.code)
      assert.equal(result.error.message, entry.body.message)
      assert.equal(result.error.status, entry.status)
      assert.deepEqual(result.error.fields, entry.body.fields)
      assert.deepEqual(result.error.unavailableDates, entry.body.unavailableDates)
    }
  })
}

test('every sample operation is exercised with a successful answer, so all 20 are covered', () => {
  const covered = new Set(samples.filter((entry) => entry.status < 300).map((entry) => entry.method))
  assert.deepEqual([...covered].sort(), operations.map((operation) => operation.name).sort())
})

test('every documented error status of every operation maps to its documented code with the status preserved', async () => {
  const codeFor = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_ERROR', 503: 'SERVICE_UNAVAILABLE' }
  let checked = 0
  for (const operation of operations) {
    for (const status of Object.keys(operation.op.responses).filter((key) => /^\d+$/.test(key) && Number(key) >= 400).map(Number)) {
      const code = operation.name === 'login' && status === 401 ? 'INVALID_CREDENTIALS' : operation.name === 'register' && status === 409 ? 'USERNAME_TAKEN' : codeFor[status]
      const { service, calls } = adapter(() => reply(status, errorBody(code, 'Documented error.')))
      const result = await service[operation.name](...(argsFor[operation.name](exampleRequest(operation)) ?? []))
      assert.equal(calls.length, 1)
      checkRequest(calls[0], operation.name, true)
      if (status === 401 && (operation.name === 'logout' || operation.name === 'currentUser')) {
        // Documented adapter behavior (api.md): no/invalid session is "signed out", not an error.
        assert.deepEqual(result, { ok: true, data: null }, `${operation.name} 401`)
      } else {
        assert.equal(result.ok, false, `${operation.name} ${status}`)
        assert.deepEqual([result.error.code, result.error.status], [code, status], `${operation.name} ${status}`)
      }
      checked += 1
    }
  }
  assert.ok(checked >= 60, `expected to sweep every documented error response, swept ${checked}`)
})

function exampleRequest(operation) {
  const path = { assetId: 'asset-1', bookingId: 'booking-1' }
  const bodies = {
    login: { username: 'maya_student', password: 'StudentDemo42!' }, register: { username: 'maya_student', password: 'StudentDemo42!' },
    requestBooking: { assetId: 'asset-1', startDate: '2026-10-24', endDate: '2026-10-24', purpose: 'Student club film' },
    cancelBooking: { expectedVersion: 1 }, approveBooking: { expectedVersion: 1 }, rejectBooking: { expectedVersion: 1, note: 'Not available' },
    checkoutBooking: { expectedVersion: 2, note: 'Complete kit' }, returnBooking: { expectedVersion: 3, note: 'Complete kit' },
    addAsset: { name: 'Studio camera', inventoryCode: 'NEW-001', category: 'Cameras', location: 'Club store', description: '' },
    editAsset: { name: 'Studio camera', inventoryCode: 'NEW-001', category: 'Cameras', location: 'Club store', description: '' }, setAssetState: { state: 'maintenance' },
  }
  return { path, query: {}, body: bodies[operation.name] }
}

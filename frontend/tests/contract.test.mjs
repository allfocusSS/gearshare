import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { buildSamples, SAMPLES_PATH, STATUS_BY_CODE } from './contract-samples.mjs'

// #6: the versioned OpenAPI contract is a repository deliverable that must keep describing the shared frontend
// service. Full schema validation lives in backend/tests/test_openapi_contract.py (real openapi-spec-validator);
// these checks need no YAML parser and fail early when the frontend and the contract drift apart.
const repo = new URL('../../', import.meta.url)
const specText = readFileSync(new URL('openapi.yml', repo), 'utf8')
const typesText = readFileSync(new URL('frontend/src/services/types.ts', repo), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

function serviceMethods() {
  const start = typesText.indexOf('export interface GearShareService')
  const body = typesText.slice(typesText.indexOf('{', start) + 1, typesText.indexOf('\n}', start))
  return [...body.matchAll(/^\s{2}(\w+)\(/gm)].map(match => match[1])
}

test('openapi.yml exists at the repository root as a versioned OpenAPI 3.1 document', () => {
  assert.equal(existsSync(new URL('openapi.yml', repo)), true)
  assert.match(specText, /^openapi: 3\.1\.0$/m)
  assert.match(specText, /^info:\n(?:.*\n)*?  version: \d+\.\d+\.\d+$/m)
  assert.match(specText, /^ {2}\/health:$/m)
})

test('every GearShareService method maps to exactly one x-service-method operation, and nothing else does', () => {
  const methods = serviceMethods()
  assert.equal(methods.length, 20)
  assert.equal(new Set(methods).size, methods.length)
  const mapped = [...specText.matchAll(/^\s+x-service-method: (\w+)$/gm)].map(match => match[1])
  for (const name of methods) assert.equal(mapped.filter(value => value === name).length, 1, `${name} must map to exactly one operation`)
  assert.deepEqual([...mapped].sort(), [...methods].sort())
})

test('the contract declares the concurrency fields the shared types and mock use', () => {
  assert.match(typesText, /export interface Booking extends DateRange \{[^}]*\bversion: number;/)
  for (const name of ['approveBooking', 'cancelBooking']) assert.match(typesText, new RegExp(`${name}\\(id: string, input: BookingPrecondition\\)`))
  for (const name of ['rejectBooking', 'checkoutBooking', 'returnBooking']) assert.match(typesText, new RegExp(`${name}\\(id: string, input: BookingTransitionInput\\)`))
  assert.match(specText, /^ {4}BookingPrecondition:$/m)
  assert.equal([...specText.matchAll(/^\s+expectedVersion:$/gm)].length >= 2, true)
  assert.match(typesText, /export interface Session \{ token: string; expiresAt: string; user: User \}/)
})

test('committed contract samples are exactly what the mock produces, so the backend contract test validates real payloads', async () => {
  const committed = JSON.parse(readFileSync(SAMPLES_PATH, 'utf8')).samples
  const fresh = await buildSamples()
  assert.equal(fresh.length, committed.length)
  assert.deepEqual(fresh, committed, 'run `node tests/contract-samples.mjs --write` from frontend/ and review the diff')
})

test('samples cover every service method and map every ServiceErrorCode to its documented HTTP status', async () => {
  const samples = await buildSamples()
  const covered = new Set(samples.filter(sample => sample.status < 300).map(sample => sample.method))
  assert.deepEqual([...covered].sort(), [...serviceMethods()].sort())
  const seen = new Map()
  for (const sample of samples.filter(sample => sample.status >= 400)) {
    assert.equal(sample.status, STATUS_BY_CODE[sample.body.code], `${sample.method}: ${sample.body.code}`)
    assert.equal('status' in sample.body, false, 'the HTTP status line is not repeated in the body')
    seen.set(sample.body.code, sample.status)
  }
  assert.deepEqual([...seen.keys()].sort(), Object.keys(STATUS_BY_CODE).sort())
  const registered = samples.find(sample => sample.method === 'register' && sample.status === 201)
  assert.deepEqual(Object.keys(registered.body).sort(), ['id', 'role', 'username'])
  assert.equal(registered.mapsTo, 'Session.user')
})

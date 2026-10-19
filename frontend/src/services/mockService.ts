import { CATEGORIES } from './types.ts'
import type { Asset, Credentials, GearShareService, ServiceError, ServiceResult, User } from './types.ts'
import { addDays, clubToday, validateDateRange } from './dates.ts'
import { catalogueFixtures } from './fixtures.ts'

export type DemoScenario = 'normal' | 'loading' | 'empty' | 'error'

export const DEMO_ACCOUNTS = {
  student: { username: 'maya_student', password: 'StudentDemo42!' },
  coordinator: { username: 'alex_coordinator', password: 'CoordinatorDemo42!' },
} as const

interface MockAccount {
  user: User
  // Fictional browser-only demo values. This adapter provides no real authentication security.
  demoPassword: string
}

interface MockOptions {
  scenario?: DemoScenario
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => Date
}

export const normalizeUsername = (username: string) => username.trim().toLowerCase()

function validate(credentials: Credentials): ServiceError | null {
  const fields: ServiceError['fields'] = {}
  if (!/^[A-Za-z0-9_]{3,30}$/.test(credentials.username.trim())) {
    fields.username = 'Use 3–30 ASCII letters, digits or underscores.'
  }
  if (credentials.password.length < 10 || credentials.password.length > 128) {
    fields.password = 'Use a password with 10–128 characters.'
  }
  return Object.keys(fields).length ? {
    code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', fields,
  } : null
}

const failure = <T>(error: ServiceError): ServiceResult<T> => ({ ok: false, error })
const success = <T>(data: T): ServiceResult<T> => ({ ok: true, data })

export function createMockService(options: MockOptions = {}) {
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const today = () => clubToday(options.now?.() ?? new Date())
  let scenario: DemoScenario = options.scenario ?? 'normal'
  let accounts: MockAccount[] = []
  let signedIn: User | null = null
  let nextId = 1
  let generation = 0
  let assets: Asset[] = []
  let occupied = new Map<string, Set<string>>()

  function reset(next: DemoScenario) {
    scenario = next
    signedIn = null
    nextId = 1
    generation += 1
    const fixture = catalogueFixtures(today())
    assets = next === 'empty' ? [] : fixture.assets
    occupied = next === 'empty' ? new Map() : fixture.occupied
    accounts = next === 'empty' ? [] : [
      { user: { id: 'student-demo', username: DEMO_ACCOUNTS.student.username, role: 'student' }, demoPassword: DEMO_ACCOUNTS.student.password },
      { user: { id: 'coordinator-demo', username: DEMO_ACCOUNTS.coordinator.username, role: 'coordinator' }, demoPassword: DEMO_ACCOUNTS.coordinator.password },
    ]
  }
  reset(scenario)

  async function ready(): Promise<ServiceError | null> {
    const startedAt = generation
    await sleep(scenario === 'loading' ? 1600 : 250)
    if (scenario === 'error' || startedAt !== generation) {
      return { code: 'SERVICE_UNAVAILABLE', message: 'The demo service is unavailable. Try again or choose the Normal fixture.' }
    }
    return null
  }

  const publicUser = (user: User): User => ({ ...user })
  const publicAsset = (asset: Asset): Asset => ({ ...asset })
  const missing = { code: 'NOT_FOUND', message: 'This equipment could not be found. Return to Explore to choose another physical unit.' } as const
  const service: GearShareService = {
    async currentUser() {
      const error = await ready()
      return error ? failure(error) : success(signedIn ? publicUser(signedIn) : null)
    },
    async login(credentials) {
      const error = await ready() ?? validate(credentials)
      if (error) return failure(error)
      const account = accounts.find((item) => item.user.username === normalizeUsername(credentials.username) && item.demoPassword === credentials.password)
      if (!account) return failure({ code: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect. Try the fictional demo credentials below.' })
      signedIn = account.user
      return success(publicUser(signedIn))
    },
    async register(credentials) {
      const error = await ready() ?? validate(credentials)
      if (error) return failure(error)
      const username = normalizeUsername(credentials.username)
      if (accounts.some((item) => item.user.username === username)) {
        return failure({ code: 'USERNAME_TAKEN', message: 'That username is already in use.', fields: { username: 'Choose a different username.' } })
      }
      // Role is fixed here; an extra runtime role/ID field is never read or copied.
      const user: User = { id: `student-${nextId++}`, username, role: 'student' }
      accounts.push({ user, demoPassword: credentials.password })
      signedIn = user
      return success(publicUser(user))
    },
    async logout() {
      const error = await ready()
      if (error) return failure(error)
      signedIn = null
      return success(null)
    },
    async listAssets(filters = {}) {
      const error = await ready() ?? validateDateRange(filters.startDate ?? '', filters.endDate ?? '', today())
      if (error) return failure(error)
      if (filters.category && !CATEGORIES.includes(filters.category)) return failure({ code: 'VALIDATION_ERROR', message: 'Choose a listed category.', fields: { category: 'Choose a listed category.' } })
      const search = (filters.search ?? '').trim().toLowerCase()
      const range = filters.startDate && filters.endDate ? { startDate: filters.startDate, endDate: filters.endDate } : null
      const items = assets.filter((asset) => {
        if (filters.category && asset.category !== filters.category) return false
        if (search && ![asset.name, asset.inventoryCode, asset.category, asset.description, asset.location].join(' ').toLowerCase().includes(search)) return false
        if (range && (asset.state === 'maintenance' || [...(occupied.get(asset.id) ?? [])].some((day) => day >= range.startDate && day <= range.endDate))) return false
        return true
      }).map(publicAsset)
      return success({ items, range, today: today(), horizonEnd: addDays(today(), 90) })
    },
    async getAsset(id) {
      const error = await ready()
      if (error) return failure(error)
      const asset = assets.find((item) => item.id === id)
      return asset ? success(publicAsset(asset)) : failure(missing)
    },
    async getAssetAvailability(id) {
      const error = await ready()
      if (error) return failure(error)
      const asset = assets.find((item) => item.id === id)
      if (!asset) return failure(missing)
      const current = today()
      return success({ assetId: id, today: current, horizonEnd: addDays(current, 90), timeZone: 'Asia/Almaty', days: Array.from({ length: 91 }, (_, offset) => {
        const date = addDays(current, offset)
        return { date, state: asset.state === 'maintenance' ? 'maintenance' : occupied.get(id)?.has(date) ? 'occupied' : 'available' }
      }) })
    },
  }

  return { service, demo: { setScenario: reset } }
}

import { CATEGORIES } from './types.ts'
import type { Asset, Booking, BookingRequest, BookingState, Credentials, GearShareService, ServiceError, ServiceResult, User } from './types.ts'
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
  let bookings: Booking[] = []
  let conflictNext = false
  let failNext = false
  let occupied = new Map<string, Set<string>>()

  function reset(next: DemoScenario) {
    scenario = next
    signedIn = null
    nextId = 1
    generation += 1
    const fixture = catalogueFixtures(today())
    assets = next === 'empty' ? [] : fixture.assets
    occupied = next === 'empty' ? new Map() : fixture.occupied
    bookings = []
    conflictNext = false
    failNext = false
    if (next !== 'empty') {
      const states: BookingState[] = ['pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned']
      states.forEach((state, index) => {
        const startDate = addDays(today(), state === 'checked_out' ? -3 : state === 'pending' ? 2 : state === 'approved' ? 1 : -10 - index)
        const endDate = addDays(startDate, state === 'pending' || state === 'approved' ? 2 : 1)
        const asset = fixture.assets[state === 'checked_out' ? 3 : index]
        const booking: Booking = { id: `fixture-${state}`, assetId: asset.id, assetName: asset.name, userId: 'student-demo', purpose: 'Fictional club production', startDate, endDate, state, events: [{ id: `event-${state}-create`, actorId: 'student-demo', action: 'create', priorState: null, newState: 'pending', timestamp: `${addDays(startDate, -1)}T06:00:00Z`, note: 'Fictional club production' }] }
        if (state !== 'pending') booking.events.push({ id: `event-${state}`, actorId: 'coordinator-demo', action: state, priorState: state === 'returned' ? 'checked_out' : state === 'checked_out' ? 'approved' : 'pending', newState: state, timestamp: `${startDate}T06:00:00Z`, note: 'Fictional condition / decision note' })
        bookings.push(booking)
      })
    }
    // Pending/approved fixtures own these original schedule slots, so cancellation releases them.
    occupied.delete('camera-01'); occupied.delete('camera-02')
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
  const cloneBooking = (booking: Booking): Booking => ({ ...booking, events: booking.events.map(event => ({ ...event })) })
  const reserved = (id: string, date: string) => occupied.get(id)?.has(date) || bookings.some(b => b.assetId === id && ['pending', 'approved', 'checked_out'].includes(b.state) && b.startDate <= date && b.endDate >= date)
  const privateBooking = (id: string) => bookings.find(b => b.id === id && signedIn && (b.userId === signedIn.id || signedIn.role === 'coordinator'))
  const unauthorized = { code: 'UNAUTHENTICATED', status: 401, message: 'Sign in to manage your reservations.' } as const
  const hidden = { code: 'NOT_FOUND', status: 404, message: 'Reservation not found or unavailable to this account.' } as const
  const service: GearShareService = {
    async requestBooking(input: BookingRequest) {
      const error = await ready()
      if (failNext) { failNext = false; return failure({ code: 'SERVICE_UNAVAILABLE', message: 'The request could not be sent. Your entries are retained; submit again to retry.' }) }
      if (error) return failure(error)
      if (!signedIn) return failure(unauthorized)
      const dateError = validateDateRange(input.startDate, input.endDate, today())
      const purpose = input.purpose.trim()
      const fields = { ...dateError?.fields, ...(!input.startDate ? { startDate: 'Choose a start date.' } : {}), ...(!input.endDate ? { endDate: 'Choose an end date.' } : {}), ...(purpose.length < 5 || purpose.length > 500 ? { purpose: 'Use 5–500 characters describing your project.' } : {}) }
      if (Object.keys(fields).length) return failure({ code: 'VALIDATION_ERROR', message: 'Check the highlighted request fields.', fields })
      const asset = assets.find(a => a.id === input.assetId)
      if (!asset) return failure(missing)
      if (asset.state === 'maintenance') return failure({ code: 'CONFLICT', status: 409, message: 'This unit is in maintenance and cannot be requested.', unavailableDates: [] })
      if (conflictNext) {
        conflictNext = false
        const dates = occupied.get(asset.id) ?? new Set<string>()
        dates.add(input.startDate); occupied.set(asset.id, dates)
      }
      const unavailableDates: string[] = []
      for (let day = input.startDate; day <= input.endDate; day = addDays(day, 1)) if (reserved(asset.id, day)) unavailableDates.push(day)
      if (unavailableDates.length) return failure({ code: 'CONFLICT', status: 409, message: 'These dates were reserved. Review the refreshed calendar and choose another range.', unavailableDates })
      const id = `booking-${nextId++}`
      const booking: Booking = { id, assetId: asset.id, assetName: asset.name, userId: signedIn.id, purpose, startDate: input.startDate, endDate: input.endDate, state: 'pending', events: [{ id: `${id}-create`, actorId: signedIn.id, action: 'create', priorState: null, newState: 'pending', timestamp: (options.now?.() ?? new Date()).toISOString(), note: purpose }] }
      bookings.push(booking)
      return success(cloneBooking(booking))
    },
    async listBookings() {
      const error = await ready()
      if (error) return failure(error)
      if (!signedIn) return failure(unauthorized)
      return success(bookings.filter(b => b.userId === signedIn!.id).map(cloneBooking))
    },
    async getBooking(id) {
      const error = await ready()
      if (error) return failure(error)
      if (!signedIn) return failure(unauthorized)
      const booking = privateBooking(id)
      return booking ? success(cloneBooking(booking)) : failure(hidden)
    },
    async cancelBooking(id) {
      const error = await ready()
      if (error) return failure(error)
      if (!signedIn) return failure(unauthorized)
      const booking = privateBooking(id)
      if (!booking) return failure(hidden)
      if (!['pending', 'approved'].includes(booking.state)) return failure({ code: 'CONFLICT', status: 409, message: 'Only pending or approved reservations can be cancelled.' })
      const priorState = booking.state
      booking.state = 'cancelled'
      booking.events.push({ id: `${id}-cancel`, actorId: signedIn.id, action: 'cancel', priorState, newState: 'cancelled', timestamp: (options.now?.() ?? new Date()).toISOString(), note: 'Reservation cancelled; reserved dates released.' })
      return success(cloneBooking(booking))
    },
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
        if (range && (asset.state === 'maintenance' || Array.from({ length: 91 }, (_, i) => addDays(today(), i)).some(day => day >= range.startDate && day <= range.endDate && reserved(asset.id, day)))) return false
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
        return { date, state: asset.state === 'maintenance' ? 'maintenance' : reserved(id, date) ? 'occupied' : 'available' }
      }) })
    },
  }

  return { service, demo: { setScenario: reset, simulateConflict: () => { conflictNext = true }, simulateFailure: () => { failNext = true } } }
}

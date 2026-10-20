import { CATEGORIES } from './types.ts'
import type { Asset, AssetInput, Booking, BookingAction, BookingRequest, BookingState, Credentials, GearShareService, ServiceError, ServiceResult, User } from './types.ts'
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

/** Largest accepted `expectedVersion` (signed 32-bit, as frozen in openapi.yml). */
export const MAX_VERSION = 2_147_483_647

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


  function reset(next: DemoScenario) {
    scenario = next
    signedIn = null
    nextId = 1
    generation += 1
    const fixture = catalogueFixtures()
    assets = next === 'empty' ? [] : fixture.assets
    bookings = []
    conflictNext = false
    failNext = false
    if (next !== 'empty') {
      // Complete chronological histories; future reservations were created and approved in the past.
      const seed = (id: string, state: BookingState, assetIndex: number, from: number, through: number, userId = 'student-demo') => {
        const asset = fixture.assets[assetIndex]
        const startDate = addDays(today(), from), endDate = addDays(today(), through)
        const booking: Booking = { id, assetId: asset.id, assetName: asset.name, userId, purpose: 'Fictional club production', startDate, endDate, state, version: 1, events: [] }
        const event = (action: BookingAction, priorState: BookingState | null, newState: BookingState, date: string, actorId: string, note: string) => booking.events.push({ id: `${id}-${action}`, bookingId: id, actorId, action, priorState, newState, timestamp: `${date}T06:00:00.000Z`, note })
        const created = addDays(today(), Math.min(from - 3, -3))
        event('create', null, 'pending', created, userId, booking.purpose)
        if (['approved', 'checked_out', 'returned'].includes(state)) event('approve', 'pending', 'approved', addDays(created, 1), 'coordinator-demo', 'Reservation approved.')
        if (['checked_out', 'returned'].includes(state)) event('checkout', 'approved', 'checked_out', startDate, 'coordinator-demo', 'Complete kit; tested and working.')
        if (state === 'returned') event('return', 'checked_out', 'returned', endDate, 'coordinator-demo', 'Complete kit returned in good condition.')
        if (state === 'rejected') event('reject', 'pending', 'rejected', addDays(created, 1), 'coordinator-demo', 'Equipment inspection required.')
        if (state === 'cancelled') event('cancel', 'pending', 'cancelled', addDays(created, 1), userId, 'Reservation cancelled; reserved dates released.')
        // Every create/transition writes exactly one event and bumps the version once, so a coherent chain has version === events.length.
        booking.version = booking.events.length
        bookings.push(booking)
      }
      // Preserve the owner's six-state history and every existing public occupied-date pattern.
      seed('fixture-pending', 'pending', 0, 2, 4)
      seed('fixture-approved', 'approved', 1, 1, 3)
      seed('fixture-checked_out', 'checked_out', 3, -3, -2)
      seed('fixture-rejected', 'rejected', 2, -13, -12)
      seed('fixture-cancelled', 'cancelled', 4, -14, -13)
      seed('fixture-returned', 'returned', 5, -15, -14)
      seed('fixture-next-pickup', 'approved', 3, 0, 1, 'student-other')
      seed('fixture-audio-request', 'pending', 4, 7, 8, 'student-other')
      seed('fixture-screening-request', 'pending', 5, 10, 12, 'student-other')
      seed('fixture-light-pickup', 'approved', 8, 5, 5, 'student-other')
    }
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
  const reserved = (id: string, date: string) => bookings.some(b => b.assetId === id && ['pending', 'approved', 'checked_out'].includes(b.state) && b.startDate <= date && b.endDate >= date)
  const privateBooking = (id: string) => bookings.find(b => b.id === id && signedIn && (b.userId === signedIn.id || signedIn.role === 'coordinator'))
  const unauthorized = { code: 'UNAUTHENTICATED', status: 401, message: 'Sign in to manage your reservations.' } as const
  const hidden = { code: 'NOT_FOUND', status: 404, message: 'Reservation not found or unavailable to this account.' } as const
  const staffDenied = (): ServiceError | null => !signedIn ? unauthorized : signedIn.role !== 'coordinator' ? { code: 'FORBIDDEN', status: 403, message: 'Coordinator access is required for this action.' } : null
  const conflict = (message: string): ServiceError => ({ code: 'CONFLICT', status: 409, message })
  /** Shape check, then compare against the current version. Runs after authorization/privacy (401/403/404) and before any state rule; never mutates. */
  function versionError(input: unknown, booking: Booking): ServiceError | null {
    const expected = (input as { expectedVersion?: unknown } | null | undefined)?.expectedVersion
    if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 1 || expected > MAX_VERSION) {
      return { code: 'VALIDATION_ERROR', message: 'Check the reservation version before continuing.', fields: { expectedVersion: 'Send the positive integer version of the reservation snapshot you acted on.' } }
    }
    if (expected !== booking.version) {
      return { ...conflict('This reservation changed after you opened it. Refresh to review its current state; nothing was changed.'), fields: { expectedVersion: 'Stale: the reservation is no longer at the version you acted on.' } }
    }
    return null
  }
  const onLoan = (assetId: string) => bookings.some(b => b.assetId === assetId && b.state === 'checked_out')
  async function transition(id: string, action: 'approve' | 'reject' | 'checkout' | 'return', input: { expectedVersion?: unknown; note?: string } | undefined): Promise<ServiceResult<Booking>> {
    const error = await ready() ?? staffDenied()
    if (error) return failure(error)
    const booking = bookings.find(b => b.id === id)
    if (!booking) return failure(hidden)
    const stale = versionError(input, booking)
    if (stale) return failure(stale)
    const rules = { approve: ['pending', 'approved'], reject: ['pending', 'rejected'], checkout: ['approved', 'checked_out'], return: ['checked_out', 'returned'] } as const
    const [required, next] = rules[action]
    if (booking.state !== required) return failure(conflict(`Cannot ${action === 'checkout' ? 'check out' : action} a ${booking.state.replaceAll('_', ' ')} reservation. Refresh the desk to review its current state.`))
    const note = typeof input?.note === 'string' ? input.note.trim() : ''
    if (action !== 'approve' && (note.length < 3 || note.length > 500)) return failure({ code: 'VALIDATION_ERROR', message: 'Check the note before continuing.', fields: { note: 'Use 3–500 characters after trimming whitespace.' } })
    if (action === 'approve' && booking.endDate < today()) return failure(conflict('The booked end date has passed. Reject or cancel this request instead.'))
    if (action === 'checkout' && (today() < booking.startDate || today() > booking.endDate)) return failure(conflict('Check out only within the inclusive booked dates in Asia/Almaty.'))
    if (action === 'checkout' && onLoan(booking.assetId)) return failure(conflict('This physical unit is still on loan. Record its return before checking it out again, including any overdue loan.'))
    // No await between validation and commit; competing mock operations observe committed state.
    booking.state = next
    booking.version += 1
    booking.events.push({ id: `${id}-${action}`, bookingId: id, actorId: signedIn!.id, action, priorState: required, newState: next, timestamp: (options.now?.() ?? new Date()).toISOString(), note: action === 'approve' ? 'Reservation approved.' : note })
    return success(cloneBooking(booking))
  }
  function assetValues(input: AssetInput): AssetInput {
    // Explicit editable fields: never copy IDs, state, owners or audit fields from input.
    return { name: input.name.trim(), inventoryCode: input.inventoryCode.trim().toUpperCase(), category: input.category, location: input.location.trim(), description: input.description.trim() }
  }
  function assetError(values: AssetInput, exceptId?: string): ServiceError | null {
    const fields: NonNullable<ServiceError['fields']> = {}
    if (values.name.length < 2 || values.name.length > 100) fields.name = 'Use 2–100 characters.'
    if (values.inventoryCode.length < 2 || values.inventoryCode.length > 30) fields.inventoryCode = 'Use 2–30 characters.'
    if (values.location.length < 2 || values.location.length > 100) fields.location = 'Use 2–100 characters.'
    if (values.description.length > 2000) fields.description = 'Use at most 2,000 characters.'
    if (!CATEGORIES.includes(values.category)) fields.category = 'Choose one of the four listed categories.'
    if (Object.keys(fields).length) return { code: 'VALIDATION_ERROR', message: 'Check the highlighted equipment fields.', fields }
    if (assets.some(a => a.id !== exceptId && a.inventoryCode.toUpperCase() === values.inventoryCode)) return { ...conflict('This inventory code is already in use. Choose a unique code for this physical unit.'), fields: { inventoryCode: 'This code is already in use.' } }
    return null
  }
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
        if (!reserved(asset.id, input.startDate)) {
          const id = `competing-${nextId++}`
          bookings.push({ id, assetId: asset.id, assetName: asset.name, userId: 'student-other', purpose: 'Another fictional club project', startDate: input.startDate, endDate: input.startDate, state: 'pending', version: 1, events: [{ id: `${id}-create`, bookingId: id, actorId: 'student-other', action: 'create', priorState: null, newState: 'pending', timestamp: (options.now?.() ?? new Date()).toISOString(), note: 'Another fictional club project' }] })
        }
      }
      const unavailableDates: string[] = []
      for (let day = input.startDate; day <= input.endDate; day = addDays(day, 1)) if (reserved(asset.id, day)) unavailableDates.push(day)
      if (unavailableDates.length) return failure({ code: 'CONFLICT', status: 409, message: 'These dates were reserved. Review the refreshed calendar and choose another range.', unavailableDates })
      const id = `booking-${nextId++}`
      const booking: Booking = { id, assetId: asset.id, assetName: asset.name, userId: signedIn.id, purpose, startDate: input.startDate, endDate: input.endDate, state: 'pending', version: 1, events: [{ id: `${id}-create`, bookingId: id, actorId: signedIn.id, action: 'create', priorState: null, newState: 'pending', timestamp: (options.now?.() ?? new Date()).toISOString(), note: purpose }] }
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
    async cancelBooking(id, input) {
      const error = await ready()
      if (error) return failure(error)
      if (!signedIn) return failure(unauthorized)
      const booking = privateBooking(id)
      if (!booking) return failure(hidden)
      const stale = versionError(input, booking)
      if (stale) return failure(stale)
      if (!['pending', 'approved'].includes(booking.state)) return failure({ code: 'CONFLICT', status: 409, message: 'Only pending or approved reservations can be cancelled.' })
      const priorState = booking.state
      booking.state = 'cancelled'
      booking.version += 1
      booking.events.push({ id: `${id}-cancel`, bookingId: id, actorId: signedIn.id, action: 'cancel', priorState, newState: 'cancelled', timestamp: (options.now?.() ?? new Date()).toISOString(), note: 'Reservation cancelled; reserved dates released.' })
      return success(cloneBooking(booking))
    },
    async listStaffBookings() {
      const error = await ready() ?? staffDenied()
      if (error) return failure(error)
      const current = today()
      return success({ today: current, timeZone: 'Asia/Almaty', counts: {
        pending: bookings.filter(b => b.state === 'pending').length,
        dueToday: bookings.filter(b => b.state === 'checked_out' && b.endDate === current).length,
        overdue: bookings.filter(b => b.state === 'checked_out' && b.endDate < current).length,
      }, bookings: bookings.map(b => {
        const asset = assets.find(a => a.id === b.assetId)!
        return { ...cloneBooking(b), borrower: accounts.find(a => a.user.id === b.userId)?.user.username ?? 'sam_student', inventoryCode: asset.inventoryCode, location: asset.location, currentlyOnLoan: onLoan(b.assetId), overdue: b.state === 'checked_out' && b.endDate < current }
      }) })
    },
    approveBooking: (id, input) => transition(id, 'approve', input),
    rejectBooking: (id, input) => transition(id, 'reject', input),
    checkoutBooking: (id, input) => transition(id, 'checkout', input),
    returnBooking: (id, input) => transition(id, 'return', input),
    async listInventory() {
      const error = await ready() ?? staffDenied()
      return error ? failure(error) : success(assets.map(publicAsset))
    },
    async addAsset(input) {
      const error = await ready() ?? staffDenied()
      if (error) return failure(error)
      const values = assetValues(input), invalid = assetError(values)
      if (invalid) return failure(invalid)
      const asset: Asset = { ...values, id: `asset-${nextId++}`, state: 'active' }
      assets.push(asset)
      return success(publicAsset(asset))
    },
    async editAsset(id, input) {
      const error = await ready() ?? staffDenied()
      if (error) return failure(error)
      const asset = assets.find(a => a.id === id)
      if (!asset) return failure(missing)
      const values = assetValues(input), invalid = assetError(values, id)
      if (invalid) return failure(invalid)
      Object.assign(asset, values)
      return success(publicAsset(asset))
    },
    async setAssetState(id, state) {
      const error = await ready() ?? staffDenied()
      if (error) return failure(error)
      const asset = assets.find(a => a.id === id)
      if (!asset) return failure(missing)
      if (state !== 'active' && state !== 'maintenance') return failure({ code: 'VALIDATION_ERROR', message: 'Choose active or maintenance.', fields: { state: 'Choose active or maintenance.' } })
      if (asset.state === state) return failure(conflict(`This unit is already ${state}.`))
      if (state === 'maintenance' && bookings.some(b => b.assetId === id && (b.state === 'checked_out' || (['pending', 'approved'].includes(b.state) && b.endDate >= today())))) return failure(conflict('Maintenance is blocked by an active loan or pending/approved reservation ending today or later. Record active returns and reject or cancel unresolved reservations at the coordinator desk first.'))
      asset.state = state
      return success(publicAsset(asset))
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

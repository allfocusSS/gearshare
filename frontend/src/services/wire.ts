import { CATEGORIES } from './types.ts'
import type {
  Asset, AssetAvailability, Booking, BookingAction, BookingEvent, BookingState, CatalogueResult, DateRange, ServiceError,
  ServiceErrorCode, Session, StaffBooking, StaffDesk, User,
} from './types.ts'

/**
 * Defensive parsers for HTTP response bodies. Each returns a fresh object holding only the contract fields, or `null`
 * when the payload does not have the documented shape. Unknown extra properties are dropped, so nothing the server did
 * not promise can reach the UI. `null` is turned into a retryable SERVICE_UNAVAILABLE by the client, never into data.
 */
type Json = Record<string, unknown>

export const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(value)
const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

const BOOKING_STATES: readonly BookingState[] = ['pending', 'approved', 'checked_out', 'rejected', 'cancelled', 'returned']
const BOOKING_ACTIONS: readonly BookingAction[] = ['create', 'approve', 'reject', 'cancel', 'checkout', 'return']
const ERROR_CODES: readonly ServiceErrorCode[] = ['VALIDATION_ERROR', 'INVALID_CREDENTIALS', 'USERNAME_TAKEN', 'SERVICE_UNAVAILABLE', 'NOT_FOUND', 'UNAUTHENTICATED', 'FORBIDDEN', 'CONFLICT']
const FIELD_KEYS = ['username', 'password', 'assetId', 'startDate', 'endDate', 'category', 'purpose', 'note', 'name', 'inventoryCode', 'location', 'description', 'state', 'expectedVersion'] as const

export function parseUser(value: unknown): User | null {
  if (!isRecord(value) || !isNonEmpty(value.id) || !isNonEmpty(value.username)) return null
  if (value.role !== 'student' && value.role !== 'coordinator') return null
  return { id: value.id, username: value.username, role: value.role }
}

export function parseSession(value: unknown): Session | null {
  if (!isRecord(value) || !isNonEmpty(value.token) || !isTimestamp(value.expiresAt)) return null
  const user = parseUser(value.user)
  return user ? { token: value.token, expiresAt: value.expiresAt, user } : null
}

export function parseAsset(value: unknown): Asset | null {
  if (!isRecord(value)) return null
  const { id, inventoryCode, name, category, description, location, state } = value
  if (!isNonEmpty(id) || !isNonEmpty(inventoryCode) || !isNonEmpty(name) || !isString(description) || !isNonEmpty(location)) return null
  if (!CATEGORIES.includes(category as Asset['category'])) return null
  if (state !== 'active' && state !== 'maintenance') return null
  return { id, inventoryCode, name, category: category as Asset['category'], description, location, state }
}

export function parseArray<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const items: T[] = []
  for (const entry of value) {
    const parsed = parseItem(entry)
    if (parsed === null) return null
    items.push(parsed)
  }
  return items
}

function parseRange(value: unknown): DateRange | null {
  return isRecord(value) && isDate(value.startDate) && isDate(value.endDate) ? { startDate: value.startDate, endDate: value.endDate } : null
}

export function parseCatalogue(value: unknown): CatalogueResult | null {
  if (!isRecord(value) || !isDate(value.today) || !isDate(value.horizonEnd)) return null
  const items = parseArray(value.items, parseAsset)
  if (!items) return null
  if (value.range === null) return { items, range: null, today: value.today, horizonEnd: value.horizonEnd }
  const range = parseRange(value.range)
  return range ? { items, range, today: value.today, horizonEnd: value.horizonEnd } : null
}

export function parseAvailability(value: unknown): AssetAvailability | null {
  if (!isRecord(value) || !isNonEmpty(value.assetId) || !isDate(value.today) || !isDate(value.horizonEnd) || value.timeZone !== 'Asia/Almaty') return null
  const days = parseArray(value.days, (day): AssetAvailability['days'][number] | null => {
    if (!isRecord(day) || !isDate(day.date)) return null
    return day.state === 'available' || day.state === 'occupied' || day.state === 'maintenance' ? { date: day.date, state: day.state } : null
  })
  return days && days.length > 0 ? { assetId: value.assetId, today: value.today, horizonEnd: value.horizonEnd, timeZone: 'Asia/Almaty', days } : null
}

function parseEvent(value: unknown): BookingEvent | null {
  if (!isRecord(value)) return null
  const { id, bookingId, actorId, action, priorState, newState, timestamp, note } = value
  if (!isNonEmpty(id) || !isNonEmpty(bookingId) || !isNonEmpty(actorId) || !isTimestamp(timestamp) || !isString(note)) return null
  if (!BOOKING_ACTIONS.includes(action as BookingAction) || !BOOKING_STATES.includes(newState as BookingState)) return null
  if (priorState !== null && !BOOKING_STATES.includes(priorState as BookingState)) return null
  return { id, bookingId, actorId, action: action as BookingAction, priorState: priorState as BookingState | null, newState: newState as BookingState, timestamp, note }
}

export function parseBooking(value: unknown): Booking | null {
  if (!isRecord(value)) return null
  const { id, assetId, assetName, userId, purpose, startDate, endDate, state, version } = value
  if (!isNonEmpty(id) || !isNonEmpty(assetId) || !isString(assetName) || !isNonEmpty(userId) || !isString(purpose)) return null
  if (!isDate(startDate) || !isDate(endDate) || !BOOKING_STATES.includes(state as BookingState) || !isVersion(version)) return null
  const events = parseArray(value.events, parseEvent)
  if (!events) return null
  return { id, assetId, assetName, userId, purpose, startDate, endDate, state: state as BookingState, version, events }
}

function parseStaffBooking(value: unknown): StaffBooking | null {
  const booking = parseBooking(value)
  if (!booking || !isRecord(value)) return null
  const { borrower, inventoryCode, location, currentlyOnLoan, overdue } = value
  if (!isNonEmpty(borrower) || !isNonEmpty(inventoryCode) || !isNonEmpty(location) || typeof currentlyOnLoan !== 'boolean' || typeof overdue !== 'boolean') return null
  return { ...booking, borrower, inventoryCode, location, currentlyOnLoan, overdue }
}

export function parseStaffDesk(value: unknown): StaffDesk | null {
  if (!isRecord(value) || !isDate(value.today) || value.timeZone !== 'Asia/Almaty' || !isRecord(value.counts)) return null
  const { pending, dueToday, overdue } = value.counts
  if (!isCount(pending) || !isCount(dueToday) || !isCount(overdue)) return null
  const bookings = parseArray(value.bookings, parseStaffBooking)
  return bookings ? { bookings, today: value.today, timeZone: 'Asia/Almaty', counts: { pending, dueToday, overdue } } : null
}

/** The documented `Error` envelope, or null when the body is anything else (HTML from a proxy, empty body, other JSON). */
export function parseErrorEnvelope(value: unknown): Omit<ServiceError, 'status'> | null {
  if (!isRecord(value) || !isNonEmpty(value.code) || !ERROR_CODES.includes(value.code as ServiceErrorCode) || !isNonEmpty(value.message)) return null
  const error: Omit<ServiceError, 'status'> = { code: value.code as ServiceErrorCode, message: value.message }
  if (Array.isArray(value.unavailableDates) && value.unavailableDates.every(isDate)) error.unavailableDates = [...value.unavailableDates]
  if (isRecord(value.fields)) {
    const fields: NonNullable<ServiceError['fields']> = {}
    for (const key of FIELD_KEYS) if (isNonEmpty(value.fields[key])) fields[key] = value.fields[key] as string
    if (Object.keys(fields).length) error.fields = fields
  }
  return error
}

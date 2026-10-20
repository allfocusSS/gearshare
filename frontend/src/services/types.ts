export type Role = 'student' | 'coordinator'

export interface User {
  id: string
  username: string
  role: Role
}

export interface Credentials {
  username: string
  password: string
}

export const CATEGORIES = ['Cameras', 'Audio', 'Presentation', 'Accessories'] as const
export type Category = typeof CATEGORIES[number]
export interface Asset {
  id: string
  inventoryCode: string
  name: string
  category: Category
  description: string
  location: string
  state: 'active' | 'maintenance'
}
export interface DateRange { startDate: string; endDate: string }
export interface AssetFilters {
  search?: string
  category?: Category
  startDate?: string
  endDate?: string
}
export interface CatalogueResult {
  items: Asset[]
  range: DateRange | null
  today: string
  horizonEnd: string
}
export interface AssetAvailability {
  assetId: string
  today: string
  horizonEnd: string
  timeZone: 'Asia/Almaty'
  days: { date: string; state: 'available' | 'occupied' | 'maintenance' }[]
}

export type BookingState = 'pending' | 'approved' | 'checked_out' | 'rejected' | 'cancelled' | 'returned'
export type BookingAction = 'create' | 'approve' | 'reject' | 'cancel' | 'checkout' | 'return'
export interface BookingEvent { id: string; bookingId: string; actorId: string; action: BookingAction; priorState: BookingState | null; newState: BookingState; timestamp: string; note: string }
export interface Booking extends DateRange { id: string; assetId: string; assetName: string; userId: string; purpose: string; state: BookingState; events: BookingEvent[] }
export interface BookingRequest extends DateRange { assetId: string; purpose: string }
export interface BookingNote { note: string }
export interface StaffBooking extends Booking { borrower: string; inventoryCode: string; location: string; currentlyOnLoan: boolean; overdue: boolean }
export interface StaffDesk { bookings: StaffBooking[]; today: string; timeZone: 'Asia/Almaty'; counts: { pending: number; dueToday: number; overdue: number } }
export type AssetInput = Pick<Asset, 'name' | 'inventoryCode' | 'category' | 'location' | 'description'>

export type ServiceErrorCode = 'VALIDATION_ERROR' | 'INVALID_CREDENTIALS' | 'USERNAME_TAKEN' | 'SERVICE_UNAVAILABLE' | 'NOT_FOUND' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'CONFLICT'

export interface ServiceError {
  code: ServiceErrorCode
  message: string
  status?: number
  unavailableDates?: string[]
  fields?: Partial<Record<keyof Credentials | 'startDate' | 'endDate' | 'category' | 'purpose' | 'note' | 'name' | 'inventoryCode' | 'location' | 'description' | 'state', string>>
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError }

/** The only frontend boundary for backend operations. Extended by later mock stories. */
export interface GearShareService {
  requestBooking(input: BookingRequest): Promise<ServiceResult<Booking>>
  listBookings(): Promise<ServiceResult<Booking[]>>
  getBooking(id: string): Promise<ServiceResult<Booking>>
  cancelBooking(id: string): Promise<ServiceResult<Booking>>
  listStaffBookings(): Promise<ServiceResult<StaffDesk>>
  approveBooking(id: string): Promise<ServiceResult<Booking>>
  rejectBooking(id: string, input: BookingNote): Promise<ServiceResult<Booking>>
  checkoutBooking(id: string, input: BookingNote): Promise<ServiceResult<Booking>>
  returnBooking(id: string, input: BookingNote): Promise<ServiceResult<Booking>>
  listInventory(): Promise<ServiceResult<Asset[]>>
  addAsset(input: AssetInput): Promise<ServiceResult<Asset>>
  editAsset(id: string, input: AssetInput): Promise<ServiceResult<Asset>>
  setAssetState(id: string, state: Asset['state']): Promise<ServiceResult<Asset>>
  currentUser(): Promise<ServiceResult<User | null>>
  login(credentials: Credentials): Promise<ServiceResult<User>>
  register(credentials: Credentials): Promise<ServiceResult<User>>
  logout(): Promise<ServiceResult<null>>
  listAssets(filters?: AssetFilters): Promise<ServiceResult<CatalogueResult>>
  getAsset(id: string): Promise<ServiceResult<Asset>>
  getAssetAvailability(id: string): Promise<ServiceResult<AssetAvailability>>
}

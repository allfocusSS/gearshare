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

export type ServiceErrorCode = 'VALIDATION_ERROR' | 'INVALID_CREDENTIALS' | 'USERNAME_TAKEN' | 'SERVICE_UNAVAILABLE' | 'NOT_FOUND'

export interface ServiceError {
  code: ServiceErrorCode
  message: string
  fields?: Partial<Record<keyof Credentials | 'startDate' | 'endDate' | 'category', string>>
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError }

/** The only frontend boundary for backend operations. Extended by later mock stories. */
export interface GearShareService {
  currentUser(): Promise<ServiceResult<User | null>>
  login(credentials: Credentials): Promise<ServiceResult<User>>
  register(credentials: Credentials): Promise<ServiceResult<User>>
  logout(): Promise<ServiceResult<null>>
  listAssets(filters?: AssetFilters): Promise<ServiceResult<CatalogueResult>>
  getAsset(id: string): Promise<ServiceResult<Asset>>
  getAssetAvailability(id: string): Promise<ServiceResult<AssetAvailability>>
}

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

export type ServiceErrorCode = 'VALIDATION_ERROR' | 'INVALID_CREDENTIALS' | 'USERNAME_TAKEN' | 'SERVICE_UNAVAILABLE'

export interface ServiceError {
  code: ServiceErrorCode
  message: string
  fields?: Partial<Record<keyof Credentials, string>>
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError }

/** The only frontend boundary for backend operations. Extended by later mock stories. */
export interface GearShareService {
  currentUser(): Promise<ServiceResult<User | null>>
  login(credentials: Credentials): Promise<ServiceResult<User>>
  register(credentials: Credentials): Promise<ServiceResult<User>>
  logout(): Promise<ServiceResult<null>>
}

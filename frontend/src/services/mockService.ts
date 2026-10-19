import type { Credentials, GearShareService, ServiceError, ServiceResult, User } from './types.ts'

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
  let scenario: DemoScenario = options.scenario ?? 'normal'
  let accounts: MockAccount[] = []
  let signedIn: User | null = null
  let nextId = 1
  let generation = 0

  function reset(next: DemoScenario) {
    scenario = next
    signedIn = null
    nextId = 1
    generation += 1
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
  }

  return { service, demo: { setScenario: reset } }
}

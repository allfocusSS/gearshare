import { createMockService } from './mockService.ts'

// Iteration 1 is intentionally mock-only. No HTTP adapter or persistent browser storage.
const mock = createMockService()
export const gearShareService = mock.service
export const demoControls = mock.demo

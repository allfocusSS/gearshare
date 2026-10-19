export const CLUB_TIME_ZONE = 'Asia/Almaty'

/** Use calendar parts rather than the browser's timezone or a UTC date slice. */
export function clubToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (name: string) => parts.find((item) => item.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
import type { ServiceError } from './types.ts'


export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export function inclusiveDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1
}

export function validateDateRange(startDate: string, endDate: string, today: string): ServiceError | null {
  if (!startDate && !endDate) return null
  const fields: NonNullable<ServiceError['fields']> = {}
  if (!isCalendarDate(startDate)) fields.startDate = 'Choose a valid start date.'
  if (!isCalendarDate(endDate)) fields.endDate = 'Choose a valid end date.'
  if (!fields.startDate && !fields.endDate) {
    if (startDate < today) fields.startDate = 'Start on or after the club date today.'
    if (endDate < startDate) fields.endDate = 'End on or after the start date.'
    else if (inclusiveDays(startDate, endDate) > 14) fields.endDate = 'Choose at most 14 inclusive days.'
    if (startDate > addDays(today, 90)) fields.startDate = 'Choose a date within the next 90 days.'
    if (endDate > addDays(today, 90)) fields.endDate = 'Choose a date within the next 90 days.'
  }
  return Object.keys(fields).length ? { code: 'VALIDATION_ERROR', message: 'Check the date range before viewing availability.', fields } : null
}

export function formatCalendarDate(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

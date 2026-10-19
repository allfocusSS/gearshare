import { useState } from 'react'
import { formatCalendarDate } from '../services/dates.ts'
import type { AssetAvailability, DateRange } from '../services/types.ts'

function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7)
}

export function AvailabilityCalendar({ availability, selection, onSelect }: { availability: AssetAvailability; selection: DateRange | null; onSelect: (date: string) => void }) {
  const [month, setMonth] = useState(availability.today.slice(0, 7))
  const [year, number] = month.split('-').map(Number)
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const offset = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7
  const statuses = new Map(availability.days.map((day) => [day.date, day.state]))
  return <section className="availability-calendar" aria-label="Availability calendar">
    <div className="calendar-header"><h3>{formatCalendarDate(`${month}-01`, { month: 'long', year: 'numeric' })}</h3><div><button className="calendar-arrow" type="button" aria-label="Previous month" disabled={month <= availability.today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}>←</button><button className="calendar-arrow" type="button" aria-label="Next month" disabled={month >= availability.horizonEnd.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>→</button></div></div>
    <div className="calendar-week" aria-hidden="true">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={index}>{day}</span>)}</div>
    <div className="calendar-days" role="group" aria-label={formatCalendarDate(`${month}-01`, { month: 'long', year: 'numeric' })}>
      {Array.from({ length: offset }, (_, index) => <span key={`pad-${index}`} aria-hidden="true" />)}
      {Array.from({ length: count }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, '0')}`
        const state = statuses.get(date)
        const selected = !!selection && date >= selection.startDate && date <= selection.endDate
        const label = state === 'occupied' ? 'Occupied, unavailable' : state === 'maintenance' ? 'Maintenance, unavailable' : state === 'available' ? 'Available' : 'Outside selectable window'
        return <button key={date} type="button" className={`calendar-day ${state ?? 'outside'}${selected ? ' selected' : ''}${date === availability.today ? ' today' : ''}`} disabled={!state} aria-label={`${date}: ${label}${selected ? ', selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(date)}><span>{index + 1}</span>{(state === 'occupied' || state === 'maintenance') && <span className="day-unavailable-icon" aria-hidden="true">×</span>}</button>
      })}
    </div>
    <div className="calendar-legend"><span><i className="legend-available" />Available</span><span><i className="legend-occupied">×</i>Unavailable</span><span><i className="legend-selected" />Selected</span></div>
    <p className="calendar-help">Select a start day, then an end day, or use the labeled date fields. Unavailable days are marked ×.</p>
  </section>
}

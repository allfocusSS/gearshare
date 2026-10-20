import type { Booking } from '../services/types.ts'

export function BookingHistory({ booking }: { booking: Booking }) {
  return <section className="booking-history" aria-label="Immutable event history"><h3>Event history</h3><ol className="event-timeline">{booking.events.map(event => <li key={event.id}><strong>{event.action === 'checkout' ? 'Check out' : event.action === 'return' ? 'Return' : event.action}</strong><p>{event.priorState ?? 'new'} → {event.newState}</p><time dateTime={event.timestamp}>{event.timestamp} (UTC)</time><p>{event.note}</p><small>Actor: {event.actorId}</small></li>)}</ol></section>
}

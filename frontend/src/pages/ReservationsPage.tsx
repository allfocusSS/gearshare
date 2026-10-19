import { useEffect, useRef, useState } from 'react'
import type { Booking, GearShareService, User } from '../services/types.ts'
import { clubToday, formatCalendarDate } from '../services/dates.ts'

export function ReservationsPage({ service, user }: { service: GearShareService; user: User | null }) {
  const [items, setItems] = useState<Booking[]>([])
  const [tab, setTab] = useState('upcoming')
  const [selected, setSelected] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const request = useRef(0)
  useEffect(() => {
    const id = ++request.current
    setSelected(null); setLoading(true); setError('')
    if (!user) { setLoading(false); return }
    void service.listBookings().then(result => {
      if (id !== request.current) return
      if (result.ok) setItems(result.data)
      else setError(result.error.message)
      setLoading(false)
    })
    return () => { request.current += 1 }
  }, [service, user, retry])
  async function detail(id: string) {
    setPending(true); setError(''); setMessage('')
    const result = await service.getBooking(id)
    if (result.ok) setSelected(result.data)
    else setError(result.error.message)
    setPending(false)
  }
  async function cancel() {
    if (!selected || pending) return
    setPending(true); setError(''); setMessage('')
    const result = await service.cancelBooking(selected.id)
    if (result.ok) {
      setSelected(result.data); setItems(values => values.map(b => b.id === result.data.id ? result.data : b)); setMessage('Reservation cancelled. The dates have been released.')
    } else setError(result.error.message)
    setPending(false)
  }
  if (!user) return <section className="workspace-placeholder"><h2>Your equipment plans, in one place.</h2><p>Sign in to view your private reservations.</p><a className="button primary" href="#/signin?returnTo=reservations">Sign in to view reservations</a></section>
  const terminal = (booking: Booking) => ['cancelled', 'rejected', 'returned'].includes(booking.state)
  const visible = items.filter(b => tab === 'history' ? terminal(b) : !terminal(b))
  return <section className="reservations"><p className="eyebrow">Your equipment plans</p><h2>Plan. Collect. Create.</h2><p>Upcoming includes active and overdue loans until they are returned.</p>
    <div className="reservation-tabs" aria-label="Reservation views">{['upcoming', 'history'].map(value => <button type="button" className={`button ${tab === value ? 'primary' : 'secondary'}`} aria-pressed={tab === value} key={value} disabled={pending} onClick={() => { setTab(value); setSelected(null) }}>{value === 'upcoming' ? 'Upcoming' : 'History'}</button>)}</div>
    {message && <p className="success-notice" role="status">{message}</p>}
    {error && <div className="service-notice" role="alert">{error}<button type="button" className="button secondary" disabled={pending} onClick={() => setRetry(v => v + 1)}>Retry reservations</button></div>}
    {loading ? <p role="status">Loading reservations…</p> : !error && !visible.length ? <div className="workspace-placeholder"><h3>No {tab} reservations yet.</h3><a className="button primary" href="#/explore">Explore equipment</a></div> : <div className="reservation-list">{visible.map(booking => <article className="reservation-row" key={booking.id}><div><h3>{booking.assetName}</h3><p>{formatCalendarDate(booking.startDate)} – {formatCalendarDate(booking.endDate)}</p><span className="availability-badge unspecified">{booking.state.replaceAll('_', ' ')}{booking.state === 'checked_out' && booking.endDate < clubToday() ? ' · Overdue' : ''}</span><p>{['pending', 'approved'].includes(booking.state) ? 'Cancellation available in details.' : 'No cancellation available for this state.'}</p></div><button type="button" className="button secondary" disabled={pending} onClick={() => void detail(booking.id)}>View details<span className="sr-only"> for {booking.assetName}</span></button></article>)}</div>}
    {selected && <section className="reservation-detail" aria-labelledby="reservation-detail-title"><h2 id="reservation-detail-title">Reservation details</h2><h3>{selected.assetName}</h3><p>Status: <strong>{selected.state.replaceAll('_', ' ')}</strong></p><p>{selected.startDate} – {selected.endDate} · inclusive · Asia/Almaty</p><p>Purpose: {selected.purpose}</p>{['pending', 'approved'].includes(selected.state) && <button type="button" className="button secondary" disabled={pending} onClick={() => void cancel()}>{pending ? 'Cancelling…' : 'Cancel reservation'}</button>}<h3>Event history</h3><ol className="event-timeline">{selected.events.map(event => <li key={event.id}><strong>{event.action}</strong><p>{event.priorState ?? 'new'} → {event.newState}</p><time dateTime={event.timestamp}>{event.timestamp} (UTC)</time><p>{event.note}</p></li>)}</ol></section>}
  </section>
}

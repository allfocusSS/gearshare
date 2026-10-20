import { useEffect, useRef, useState } from 'react'
import type { BookingAction, GearShareService, ServiceError, StaffBooking, StaffDesk } from '../services/types.ts'
import { formatCalendarDate } from '../services/dates.ts'
import { BookingHistory } from '../components/BookingHistory.tsx'
import { Icon } from '../components/Icon.tsx'

const views = [ ['pending', 'Pending requests'], ['approved', 'Pickups'], ['checked_out', 'Active loans'], ['history', 'History'] ] as const
const actionLabels = { approve: 'Approve request', reject: 'Reject request', cancel: 'Cancel reservation', checkout: 'Check out equipment', return: 'Record return' } as const
const stateLabel = (booking: StaffBooking) => booking.state.replaceAll('_', ' ')

export function CoordinatorPage({ service }: { service: GearShareService }) {
  const [desk, setDesk] = useState<StaffDesk | null>(null), [view, setView] = useState<string>('pending')
  const [selected, setSelected] = useState<StaffBooking | null>(null)
  const [action, setAction] = useState<Exclude<BookingAction, 'create'> | null>(null), [note, setNote] = useState('')
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false)
  const [error, setError] = useState<ServiceError | null>(null), [message, setMessage] = useState(''), [retry, setRetry] = useState(0)
  const request = useRef(0), busy = useRef(false), returnFocus = useRef('desk-views')
  const heading = useRef<HTMLHeadingElement>(null), noteField = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const id = ++request.current
    setLoading(true); setError(null)
    void service.listStaffBookings().then(result => {
      if (id !== request.current) return
      if (result.ok) { setDesk(result.data); setSelected(current => current ? result.data.bookings.find(b => b.id === current.id) ?? null : null) }
      else setError(result.error)
      setLoading(false)
    })
    return () => { request.current += 1 }
  }, [service, retry])
  useEffect(() => { if (selected) heading.current?.focus() }, [selected?.id])
  useEffect(() => { if (action) { if (['reject', 'checkout', 'return'].includes(action)) noteField.current?.focus(); else document.getElementById('staff-action-title')?.focus() } }, [action])
  useEffect(() => { if (!pending && message) heading.current?.focus() }, [message, pending])
  useEffect(() => { if (!pending && error?.fields?.note) noteField.current?.focus() }, [error, pending])
  function open(booking: StaffBooking, button: HTMLButtonElement) {
    returnFocus.current = button.id; setSelected(booking); setAction(null); setNote(''); setError(null); setMessage('')
  }
  function back() {
    setSelected(null); setAction(null); setNote(''); setError(null); setMessage('')
    requestAnimationFrame(() => (document.getElementById(returnFocus.current) ?? document.getElementById('desk-views'))?.focus())
  }
  async function submit() {
    if (!selected || !action || busy.current) return
    busy.current = true; setPending(true); setError(null); setMessage('')
    const id = request.current
    const result = action === 'approve' ? await service.approveBooking(selected.id) : action === 'reject' ? await service.rejectBooking(selected.id, { note }) : action === 'checkout' ? await service.checkoutBooking(selected.id, { note }) : action === 'return' ? await service.returnBooking(selected.id, { note }) : await service.cancelBooking(selected.id)
    if (id !== request.current) return
    if (result.ok) {
      setSelected({ ...selected, ...result.data, overdue: false, currentlyOnLoan: result.data.state === 'checked_out' })
      setDesk(value => value ? { ...value, bookings: value.bookings.map(b => b.id === result.data.id ? { ...b, ...result.data } : b) } : value)
      setMessage(action === 'checkout' ? 'Equipment checked out. Outgoing condition recorded.' : action === 'return' ? 'Return recorded. Custody and reserved dates released.' : action === 'approve' ? 'Request approved. The booked dates remain reserved.' : action === 'reject' ? 'Request rejected. Reason recorded and dates released.' : 'Reservation cancelled. Reserved dates released.')
      setAction(null); setNote('')
      const refreshed = await service.listStaffBookings()
      if (id !== request.current) return
      if (refreshed.ok) { setDesk(refreshed.data); setSelected(refreshed.data.bookings.find(b => b.id === result.data.id) ?? null) }
      else setError(refreshed.error)
    } else setError(result.error)
    busy.current = false; setPending(false)
  }
  const visible = desk?.bookings.filter(b => view === 'history' ? ['rejected', 'cancelled', 'returned'].includes(b.state) : b.state === view) ?? []
  const notesRequired = action && ['reject', 'checkout', 'return'].includes(action)
  const noteLabel = action === 'reject' ? 'Rejection reason' : action === 'checkout' ? 'Outgoing condition' : 'Incoming condition'
  return <section className="staff-workspace">
    <div className="staff-intro"><div><p className="eyebrow">Coordinator workspace</p><h2>Keep the next story moving.</h2><p>Review requests, hand over complete kits and bring every unit home.</p></div><span className="staff-date">CLUB DATE<time>{desk?.today ?? '…'}</time>Asia/Almaty · inclusive dates</span></div>
    {message && <p className="success-notice staff-notice" role="status"><Icon name="check" />{message}</p>}
    {error && <div className="service-notice staff-notice" role="alert"><div><strong>{error.message}</strong>{error.code === 'CONFLICT' && <p>Review the current reservation before trying another action.</p>}</div><button type="button" className="button secondary" disabled={pending} onClick={() => { setAction(null); setRetry(v => v + 1) }}>Refresh desk</button></div>}
    {loading ? <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Loading coordinator desk…</div> : !desk ? <p className="muted">The desk could not be loaded. Use Refresh desk to retry.</p> : selected ? <section className="staff-detail" aria-labelledby="staff-booking-title">
      <button className="back-link button secondary" type="button" disabled={pending} onClick={back}>← Back to queues</button>
      <div className="staff-detail-heading"><div><p className="eyebrow">{selected.inventoryCode} · {selected.borrower}</p><h2 ref={heading} id="staff-booking-title" tabIndex={-1}>Manage reservation</h2><h3>{selected.assetName}</h3></div><span className={`status-pill ${selected.overdue ? 'overdue' : selected.state}`}>{stateLabel(selected)}{selected.overdue ? ' · Overdue' : ''}</span></div>
      <dl className="staff-facts"><div><dt>Booked dates</dt><dd>{selected.startDate} – {selected.endDate}<small>Inclusive · Asia/Almaty</small></dd></div><div><dt>Pickup location</dt><dd>{selected.location}</dd></div><div><dt>Project purpose</dt><dd>{selected.purpose}</dd></div></dl>
      {selected.currentlyOnLoan && selected.state === 'approved' && <p className="custody-note">This unit is currently on loan. Record the previous return before this pickup can be checked out.</p>}
      {selected.overdue && <p className="custody-note">This loan is overdue. Record its return to release physical custody; late returns remain available.</p>}
      {!action && <div className="staff-actions">{selected.state === 'pending' && <><button className="button primary" disabled={pending} onClick={() => setAction('approve')}>Approve request</button><button className="button secondary danger" disabled={pending} onClick={() => setAction('reject')}>Reject request</button></>}{selected.state === 'approved' && <button className="button primary" disabled={pending} onClick={() => setAction('checkout')}>Check out equipment</button>}{['pending', 'approved'].includes(selected.state) && <button className="button secondary danger" disabled={pending} onClick={() => setAction('cancel')}>Cancel reservation</button>}{selected.state === 'checked_out' && <button className="button primary" disabled={pending} onClick={() => setAction('return')}>Record return</button>}{['rejected', 'cancelled', 'returned'].includes(selected.state) && <p className="muted">This reservation is complete. Its event history is retained.</p>}</div>}
      {action && <form className="staff-action-form" onSubmit={event => { event.preventDefault(); void submit() }} noValidate aria-label={actionLabels[action]}><h3 id="staff-action-title" tabIndex={-1}>{actionLabels[action]}</h3><p>{action === 'approve' ? 'Approve the requested dates for this physical unit.' : action === 'cancel' ? 'Cancel this reservation and release its booked dates. The event history will remain.' : action === 'reject' ? 'Explain why this request cannot go ahead. The reason stays in its history.' : action === 'checkout' ? 'Confirm the unit, accessories and condition before handing it over.' : 'Check the returned unit and accessories, then record their condition.'}</p>{notesRequired && <div className="field"><label htmlFor="staff-note">{noteLabel}</label><textarea id="staff-note" ref={noteField} value={note} disabled={pending} aria-invalid={!!error?.fields?.note} aria-describedby={`staff-note-hint${error?.fields?.note ? ' staff-note-error' : ''}`} onChange={event => setNote(event.target.value)} /><span className="field-hint" id="staff-note-hint">Required · 3–500 characters after trimming whitespace.</span>{error?.fields?.note && <span className="field-error" id="staff-note-error">{error.fields.note}</span>}</div>}<div className="staff-actions"><button className={`button ${action === 'reject' || action === 'cancel' ? 'destructive' : 'primary'}`} disabled={pending} type="submit">{pending ? 'Saving…' : `Confirm ${actionLabels[action].toLowerCase()}`}</button><button className="button secondary" disabled={pending} type="button" onClick={() => { setAction(null); setNote(''); setError(null); requestAnimationFrame(() => heading.current?.focus()) }}>Keep reservation unchanged</button></div><p className="pending-text" role="status">{pending ? 'Saving the action and refreshing queues…' : ''}</p></form>}
      <BookingHistory booking={selected} />
    </section> : <>
      <dl className="desk-counts"><div><dt>Pending requests</dt><dd>{desk.counts.pending}<Icon name="desk" /></dd></div><div><dt>Returns due today</dt><dd>{desk.counts.dueToday}<Icon name="calendar" /></dd></div><div className={desk.counts.overdue ? 'needs-attention' : ''}><dt>Overdue loans</dt><dd>{desk.counts.overdue}<Icon name="box" /></dd></div></dl>
      <div id="desk-views" tabIndex={-1} className="staff-tabs" aria-label="Coordinator queues">{views.map(([key, label]) => <button className="button secondary" key={key} aria-pressed={view === key} onClick={() => { setView(key); setError(null) }}>{label}<span>{desk.bookings.filter(b => key === 'history' ? ['rejected','cancelled','returned'].includes(b.state) : b.state === key).length}</span></button>)}</div>
      <div className="staff-list-heading"><h3>{views.find(([key]) => key === view)?.[1]}</h3><button className="button secondary" type="button" onClick={() => setRetry(v => v + 1)}>Refresh desk</button></div>
      {!visible.length ? <div className="staff-empty"><Icon name="check" /><h3>Nothing in this queue.</h3><p>You're up to date. Switch views to review other reservations.</p><a href="#/inventory">Manage equipment inventory</a></div> : <table className="staff-table"><caption className="sr-only">{views.find(([key]) => key === view)?.[1]}</caption><thead><tr><th>Physical unit</th><th>Borrower</th><th>Booked dates</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map(booking => <tr key={booking.id} data-booking-id={booking.id}><td data-label="Physical unit"><strong>{booking.assetName}</strong><small>{booking.inventoryCode}</small></td><td data-label="Borrower"><span>{booking.borrower}</span></td><td data-label="Booked dates"><span>{formatCalendarDate(booking.startDate, { day: 'numeric', month: 'short' })} – {formatCalendarDate(booking.endDate, { day: 'numeric', month: 'short' })}</span><small>Asia/Almaty · inclusive</small></td><td data-label="Status"><span className={`status-pill ${booking.overdue ? 'overdue' : booking.state}`}>{stateLabel(booking)}{booking.overdue ? ' · Overdue' : ''}</span>{booking.state === 'approved' && booking.currentlyOnLoan && <small className="custody-warning">Unit still on loan</small>}</td><td data-label="Action"><button id={`review-${booking.id}`} type="button" className="button secondary" onClick={event => open(booking, event.currentTarget)}>{view === 'pending' ? 'Review request' : view === 'approved' ? 'Manage pickup' : view === 'checked_out' ? 'Manage loan' : 'View history'}<span className="sr-only"> for {booking.assetName}</span></button></td></tr>)}</tbody></table>}
      <p className="schedule-note">Future availability is scheduled availability. Check the unit's current custody before each handover.</p>
    </>}
  </section>
}

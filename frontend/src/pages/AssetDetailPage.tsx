import { useEffect, useRef, useState } from 'react'
import type { Asset, AssetAvailability, DateRange, GearShareService, ServiceError, User } from '../services/types.ts'
import { formatCalendarDate, inclusiveDays, validateDateRange } from '../services/dates.ts'
import { EquipmentArt } from '../components/EquipmentArt.tsx'
import { DateRangeFields } from '../components/DateRangeFields.tsx'
import { AvailabilityCalendar } from '../components/AvailabilityCalendar.tsx'
import { demoControls, isMockMode } from '../services/index.ts'
import { Icon } from '../components/Icon.tsx'

export function AssetDetailPage({ assetId, service, user }: { assetId: string; service: GearShareService; user: User | null }) {
  const [data, setData] = useState<{ asset: Asset; availability: AssetAvailability } | null>(null)
  const [error, setError] = useState<ServiceError | null>(null)
  const [range, setRange] = useState<DateRange>({ startDate: '', endDate: '' })
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [selectingEnd, setSelectingEnd] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [pending, setPending] = useState(false)
  const [submitError, setSubmitError] = useState<ServiceError | null>(null)
  const [success, setSuccess] = useState('')
  const request = useRef(0)
  const submitting = useRef(false)
  const refreshVersion = useRef(0)
  // Set once per settled request: which control gets focus back when pending ends ('field' for a response with field errors).
  const restoreFocus = useRef<'field' | 'button' | null>(null)
  const panel = useRef<HTMLElement>(null)
  const requestButton = useRef<HTMLButtonElement>(null)
  const [refreshState, setRefreshState] = useState<'ready' | 'loading' | 'error'>('ready')
  async function refreshAvailability(generation = request.current) {
    const version = ++refreshVersion.current
    setRefreshState('loading')
    try {
      const result = await service.getAssetAvailability(assetId)
      if (generation !== request.current || version !== refreshVersion.current) return
      if (result.ok) {
        setData(value => value ? { ...value, availability: result.data } : value)
        setRefreshState('ready')
      } else setRefreshState('error')
    } catch {
      if (generation === request.current && version === refreshVersion.current) setRefreshState('error')
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    const generation = request.current
    setPending(true); setSubmitError(null); setSuccess('')
    const result = await service.requestBooking({ assetId, ...range, purpose })
    if (generation !== request.current) return
    // A 401 removes the form; App moves focus to "Sign in again". Every other outcome returns focus here once pending ends.
    restoreFocus.current = !result.ok && result.error.code === 'UNAUTHENTICATED' ? null : !result.ok && result.error.fields && Object.keys(result.error.fields).length ? 'field' : 'button'
    if (result.ok) {
      setSuccess('Pending approval. Your request is now in My reservations.')
      await refreshAvailability(generation)
    }
    else {
      setSubmitError(result.error)
      if (result.error.code === 'CONFLICT') {
        await refreshAvailability(generation)
      }
    }
    if (generation === request.current) { submitting.current = false; setPending(false) }
  }

  useEffect(() => {
    const id = ++request.current
    setLoading(true); setError(null); setData(null)
    submitting.current = false; setPending(false); setSuccess(''); setSubmitError(null); setRefreshState('ready')
    setRange({ startDate: '', endDate: '' }); setPurpose('')
    restoreFocus.current = null
    void Promise.all([service.getAsset(assetId), service.getAssetAvailability(assetId)]).then(([asset, availability]) => {
      if (id !== request.current) return
      if (!asset.ok) setError(asset.error)
      else if (!availability.ok) setError(availability.error)
      else setData({ asset: asset.data, availability: availability.data })
      setLoading(false)
    })
    return () => { request.current += 1 }
  }, [assetId, retry, service])

  // The pending form disables its controls, so the browser drops focus. When the request settles (React has committed the
  // enabled controls before this effect runs), restore it once, and only if the user has not moved to another control:
  // the first invalid control in DOM order (Start date, End date, purpose) after a field failure, otherwise the button.
  useEffect(() => {
    const intent = restoreFocus.current
    if (pending || !intent) return
    restoreFocus.current = null
    const active = document.activeElement
    if (active && active !== document.body && active !== requestButton.current && active.isConnected && !active.matches(':disabled')) return
    const invalid = intent === 'field' ? panel.current?.querySelector<HTMLElement>('input[aria-invalid="true"]:not(:disabled), textarea[aria-invalid="true"]:not(:disabled)') : null
    const target = invalid ?? requestButton.current
    if (target && !target.matches(':disabled')) target.focus()
  }, [pending])

  if (loading) return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Loading equipment and calendar…</div>
  if (error) return <section className="workspace-placeholder detail-error" role="alert"><span className="placeholder-icon"><Icon name="box" /></span><h2>{error.code === 'NOT_FOUND' ? 'Equipment not found.' : 'Could not load this equipment.'}</h2><p>{error.message}</p>{error.code !== 'NOT_FOUND' && <button type="button" className="button secondary" onClick={() => setRetry((value) => value + 1)}>Retry detail</button>}<a className="button primary" href="#/explore">Back to Explore<Icon name="arrow" /></a></section>
  if (!data) return null
  const { asset, availability } = data
  const dateError = validateDateRange(range.startDate, range.endDate, availability.today)
  const dateFieldError = dateError || submitError ? {
    ...(dateError ?? submitError!),
    fields: { ...submitError?.fields, ...dateError?.fields },
  } : null
  const selected = range.startDate && range.endDate && !dateError ? range : null
  const unavailable = selected ? availability.days.filter((day) => day.date >= selected.startDate && day.date <= selected.endDate && day.state !== 'available') : []
  function selectDay(date: string) {
    if (!selectingEnd) { setRange({ startDate: date, endDate: date }); setSelectingEnd(true) }
    else { setRange({ startDate: date < range.startDate ? date : range.startDate, endDate: date < range.startDate ? range.startDate : date }); setSelectingEnd(false) }
  }
  return <>
    <a href="#/explore" className="back-link">← Back to equipment</a>
    <div className="asset-detail-grid"><section className="asset-identity"><EquipmentArt category={asset.category} large /><div className="asset-heading"><span className="eyebrow">{asset.category} <span>/</span> {asset.inventoryCode}</span><h2>{asset.name}</h2><span className={`availability-badge ${asset.state === 'maintenance' ? 'maintenance' : 'unspecified'}`}>{asset.state === 'maintenance' ? '× Maintenance · unavailable for requests' : 'Active physical unit'}</span></div><p className="asset-description">{asset.description}</p><dl className="asset-specs"><div><dt>Inventory code</dt><dd>{asset.inventoryCode}</dd></div><div><dt>Category</dt><dd>{asset.category}</dd></div><div><dt>Pickup location</dt><dd>{asset.location}</dd></div></dl><p className="schedule-note">One record is one physical unit. {isMockMode ? 'This fictional demo equipment has its own independent calendar.' : 'This unit has its own independent calendar.'}</p></section>
    <section className="availability-panel" ref={panel} aria-labelledby="availability-heading"><p className="eyebrow">Plan your next project</p><h2 id="availability-heading">Check availability</h2><p className="availability-intro">Whole days, from pickup through return.</p><fieldset className="request-date-fields" disabled={pending}>{refreshState === 'ready' && <AvailabilityCalendar key={assetId} availability={availability} selection={selected} onSelect={selectDay} />}<DateRangeFields prefix="detail" value={range} today={availability.today} error={dateFieldError} onChange={(value) => { setRange(value); setSelectingEnd(false) }} /></fieldset>
      {refreshState !== 'ready' ? <div role={refreshState === 'error' ? 'alert' : 'status'} className="range-summary neutral"><strong>{refreshState === 'loading' ? 'Updating availability…' : 'Could not refresh availability.'}</strong><p>Availability is unknown until the calendar refreshes. Your request has not been resubmitted.</p>{refreshState === 'error' && <button type="button" className="button secondary" onClick={() => void refreshAvailability()}>Retry availability</button>}</div> : dateError ? <div className="form-alert" role="alert">{dateError.message}</div> : selected ? <div className={`range-summary ${unavailable.length ? 'range-unavailable' : 'range-available'}`} role="status"><strong>{unavailable.length ? asset.state === 'maintenance' ? 'Unavailable during maintenance' : 'Unavailable for selected dates' : 'Available for selected dates'}</strong><p>{formatCalendarDate(selected.startDate)} – {formatCalendarDate(selected.endDate)}</p><p><b>{inclusiveDays(selected.startDate, selected.endDate)} {inclusiveDays(selected.startDate, selected.endDate) === 1 ? 'day' : 'days'} inclusive</b> · Asia/Almaty</p>{unavailable.length > 0 && <p>{unavailable.length} selected {unavailable.length === 1 ? 'day is' : 'days are'} unavailable.</p>}</div> : <div className="range-summary neutral"><strong>No dates selected</strong><p>Choose a start and end to check this unit's scheduled availability.</p></div>}
      <button type="button" className="button subtle full" disabled={pending} onClick={() => { setRange({ startDate: '', endDate: '' }); setSelectingEnd(false) }}>Clear dates</button><p className="schedule-note">Scheduled availability does not guarantee an earlier loan will return on time. </p>
      {user ? <form onSubmit={event => void submit(event)} noValidate className="booking-form"><label htmlFor="booking-purpose">Project purpose</label><p id="purpose-hint">Describe your project in 5–500 characters.</p><textarea id="booking-purpose" value={purpose} disabled={pending} aria-describedby={`purpose-hint${submitError?.fields?.purpose ? ' purpose-error' : ''}`} aria-invalid={!!submitError?.fields?.purpose} onChange={event => setPurpose(event.target.value)} />{submitError?.fields?.purpose && <p id="purpose-error" className="field-error">{submitError.fields.purpose}</p>}{submitError && <div role="alert" className="form-alert">{submitError.message}{submitError.unavailableDates?.length ? <p>Unavailable dates: {submitError.unavailableDates.join(', ')}</p> : null}{submitError.fields?.startDate && <p>{submitError.fields.startDate}</p>}{submitError.fields?.endDate && <p>{submitError.fields.endDate}</p>}</div>}{success && <div role="status" className="success-notice">{success}<a href="#/reservations">View my reservations</a></div>}<button type="submit" ref={requestButton} className="button primary full" disabled={pending || asset.state === 'maintenance'}>{pending ? 'Submitting request…' : 'Request equipment'}</button>{demoControls && <><button type="button" className="button subtle full" disabled={pending} onClick={() => { demoControls?.simulateConflict(); setSuccess(''); setSubmitError(null) }}>Simulate next-request conflict</button><button type="button" className="button subtle full" disabled={pending} onClick={() => { demoControls?.simulateFailure(); setSuccess(''); setSubmitError(null) }}>Simulate next-request failure</button><p className="schedule-note">Demo conflict reserves your next start day before submission, like another request arriving first.</p></>}</form> : <a className="button primary full" href={`#/signin?returnTo=${encodeURIComponent(`assets/${assetId}`)}`}>Sign in to request equipment</a>}
    </section></div>
  </>
}

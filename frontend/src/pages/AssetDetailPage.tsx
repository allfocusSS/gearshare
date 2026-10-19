import { useEffect, useRef, useState } from 'react'
import type { Asset, AssetAvailability, DateRange, GearShareService, ServiceError } from '../services/types.ts'
import { formatCalendarDate, inclusiveDays, validateDateRange } from '../services/dates.ts'
import { EquipmentArt } from '../components/EquipmentArt.tsx'
import { DateRangeFields } from '../components/DateRangeFields.tsx'
import { AvailabilityCalendar } from '../components/AvailabilityCalendar.tsx'
import { Icon } from '../components/Icon.tsx'

export function AssetDetailPage({ assetId, service }: { assetId: string; service: GearShareService }) {
  const [data, setData] = useState<{ asset: Asset; availability: AssetAvailability } | null>(null)
  const [error, setError] = useState<ServiceError | null>(null)
  const [range, setRange] = useState<DateRange>({ startDate: '', endDate: '' })
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [selectingEnd, setSelectingEnd] = useState(false)
  const request = useRef(0)

  useEffect(() => {
    const id = ++request.current
    setLoading(true); setError(null); setData(null)
    void Promise.all([service.getAsset(assetId), service.getAssetAvailability(assetId)]).then(([asset, availability]) => {
      if (id !== request.current) return
      if (!asset.ok) setError(asset.error)
      else if (!availability.ok) setError(availability.error)
      else setData({ asset: asset.data, availability: availability.data })
      setLoading(false)
    })
    return () => { request.current += 1 }
  }, [assetId, retry, service])

  if (loading) return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Loading equipment and calendar…</div>
  if (error) return <section className="workspace-placeholder detail-error" role="alert"><span className="placeholder-icon"><Icon name="box" /></span><h2>{error.code === 'NOT_FOUND' ? 'Equipment not found.' : 'Could not load this equipment.'}</h2><p>{error.message}</p>{error.code !== 'NOT_FOUND' && <button type="button" className="button secondary" onClick={() => setRetry((value) => value + 1)}>Retry detail</button>}<a className="button primary" href="#/explore">Back to Explore<Icon name="arrow" /></a></section>
  if (!data) return null
  const { asset, availability } = data
  const dateError = validateDateRange(range.startDate, range.endDate, availability.today)
  const selected = range.startDate && range.endDate && !dateError ? range : null
  const unavailable = selected ? availability.days.filter((day) => day.date >= selected.startDate && day.date <= selected.endDate && day.state !== 'available') : []
  function selectDay(date: string) {
    if (!selectingEnd) { setRange({ startDate: date, endDate: date }); setSelectingEnd(true) }
    else { setRange({ startDate: date < range.startDate ? date : range.startDate, endDate: date < range.startDate ? range.startDate : date }); setSelectingEnd(false) }
  }
  return <>
    <a href="#/explore" className="back-link">← Back to equipment</a>
    <div className="asset-detail-grid"><section className="asset-identity"><EquipmentArt category={asset.category} large /><div className="asset-heading"><span className="eyebrow">{asset.category} <span>/</span> {asset.inventoryCode}</span><h2>{asset.name}</h2><span className={`availability-badge ${asset.state === 'maintenance' ? 'maintenance' : 'unspecified'}`}>{asset.state === 'maintenance' ? '× Maintenance · unavailable for requests' : 'Active physical unit'}</span></div><p className="asset-description">{asset.description}</p><dl className="asset-specs"><div><dt>Inventory code</dt><dd>{asset.inventoryCode}</dd></div><div><dt>Category</dt><dd>{asset.category}</dd></div><div><dt>Pickup location</dt><dd>{asset.location}</dd></div></dl><p className="schedule-note">One record is one physical unit. This fictional demo equipment has its own independent calendar.</p></section>
    <section className="availability-panel" aria-labelledby="availability-heading"><p className="eyebrow">Plan your next project</p><h2 id="availability-heading">Check availability</h2><p className="availability-intro">Whole days, from pickup through return.</p><AvailabilityCalendar key={assetId} availability={availability} selection={selected} onSelect={selectDay} /><DateRangeFields prefix="detail" value={range} today={availability.today} error={dateError} onChange={(value) => { setRange(value); setSelectingEnd(false) }} />
      {dateError ? <div className="form-alert" role="alert">{dateError.message}</div> : selected ? <div className={`range-summary ${unavailable.length ? 'range-unavailable' : 'range-available'}`} role="status"><strong>{unavailable.length ? asset.state === 'maintenance' ? 'Unavailable during maintenance' : 'Unavailable for selected dates' : 'Available for selected dates'}</strong><p>{formatCalendarDate(selected.startDate)} – {formatCalendarDate(selected.endDate)}</p><p><b>{inclusiveDays(selected.startDate, selected.endDate)} {inclusiveDays(selected.startDate, selected.endDate) === 1 ? 'day' : 'days'} inclusive</b> · Asia/Almaty</p>{unavailable.length > 0 && <p>{unavailable.length} selected {unavailable.length === 1 ? 'day is' : 'days are'} unavailable.</p>}</div> : <div className="range-summary neutral"><strong>No dates selected</strong><p>Choose a start and end to check this unit's scheduled availability.</p></div>}
      <button type="button" className="button subtle full" onClick={() => { setRange({ startDate: '', endDate: '' }); setSelectingEnd(false) }}>Clear dates</button><p className="schedule-note">Scheduled availability does not guarantee an earlier loan will return on time. Booking requests are coming soon.</p>
    </section></div>
  </>
}

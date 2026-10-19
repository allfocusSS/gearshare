import { useEffect, useRef, useState } from 'react'
import { CATEGORIES } from '../services/types.ts'
import type { AssetFilters, CatalogueResult, Category, DateRange, GearShareService, ServiceError } from '../services/types.ts'
import { clubToday, formatCalendarDate, inclusiveDays, validateDateRange } from '../services/dates.ts'
import { DateRangeFields } from '../components/DateRangeFields.tsx'
import { EquipmentArt } from '../components/EquipmentArt.tsx'
import { Icon } from '../components/Icon.tsx'

export function CataloguePage({ service }: { service: GearShareService }) {
  const [filters, setFilters] = useState<AssetFilters>({ search: '' })
  const [data, setData] = useState<CatalogueResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ServiceError | null>(null)
  const [retry, setRetry] = useState(0)
  const request = useRef(0)
  const today = clubToday()
  const dateError = validateDateRange(filters.startDate ?? '', filters.endDate ?? '', today)

  useEffect(() => {
    const id = ++request.current
    setData(null)
    setError(null)
    if (dateError) { setLoading(false); return }
    setLoading(true)
    void service.listAssets(filters).then((result) => {
      if (id !== request.current) return
      if (result.ok) setData(result.data)
      else setError(result.error)
      setLoading(false)
    })
    return () => { request.current += 1 }
  }, [filters, retry, service])

  function update(next: AssetFilters) { setData(null); setLoading(true); setFilters(next) }
  const range: DateRange = { startDate: filters.startDate ?? '', endDate: filters.endDate ?? '' }
  return <>
    <div className="catalogue-intro"><div><p className="eyebrow">The club equipment desk</p><h2>Good equipment. <span>Shared fairly.</span></h2><p>Find a physical unit for your next idea.</p></div><span className="catalogue-stamp">FICTIONAL INVENTORY<br />ONE SHARED DESK</span></div>
    <section className="catalogue-filters" aria-label="Equipment filters">
      <div className="search-field field"><label htmlFor="equipment-search">Search equipment</label><div><Icon name="compass" /><input type="search" id="equipment-search" placeholder="Name, code or pickup location" value={filters.search ?? ''} onChange={(event) => update({ ...filters, search: event.target.value })} /></div></div>
      <fieldset className="category-filter"><legend>Category</legend><div>{(['All equipment', ...CATEGORIES] as const).map((category) => <button type="button" key={category} aria-pressed={category === (filters.category ?? 'All equipment')} onClick={() => update({ ...filters, category: category === 'All equipment' ? undefined : category as Category })}>{category}</button>)}</div></fieldset>
      <div className="catalogue-date-filter"><DateRangeFields prefix="catalogue" today={today} value={range} error={dateError} onChange={(dates) => update({ ...filters, ...dates })} /><button className="button subtle" type="button" onClick={() => update({ ...filters, startDate: '', endDate: '' })}>Clear dates</button></div>
    </section>
    {dateError ? <div className="catalogue-feedback form-alert" role="alert"><strong>Check your dates.</strong><p>{dateError.message} Results are paused until both dates are valid, or clear the dates.</p></div> : loading ? <div className="loading-state catalogue-loading" role="status"><span className="spinner" aria-hidden="true" />Finding equipment…</div> : error ? <div className="catalogue-feedback service-notice" role="alert"><span>{error.message}</span><button type="button" className="button secondary" onClick={() => setRetry((value) => value + 1)}>Retry equipment</button></div> : data && <>
      <div className="catalogue-results-label" role="status"><span><strong>{data.items.length}</strong> {data.items.length === 1 ? 'physical unit' : 'physical units'}{data.range ? ' available for your dates' : ' to explore'}</span>{data.range ? <span>{formatCalendarDate(data.range.startDate)} – {formatCalendarDate(data.range.endDate)} · {inclusiveDays(data.range.startDate, data.range.endDate)} {inclusiveDays(data.range.startDate, data.range.endDate) === 1 ? 'day' : 'days'} inclusive · Asia/Almaty</span> : <span>Choose both dates to check scheduled availability.</span>}</div>
      {data.items.length ? <div className="equipment-grid">{data.items.map((asset) => <a className="equipment-card" key={asset.id} href={`#/assets/${asset.id}`} aria-label={`View ${asset.name}, ${asset.inventoryCode}`}><EquipmentArt category={asset.category} /><div className="equipment-card-body"><div className="equipment-card-meta"><span>{asset.inventoryCode}</span><span>{asset.category}</span></div><h3>{asset.name}</h3><p className="pickup-location">{asset.location}</p><div className="equipment-card-bottom"><span className={`availability-badge ${asset.state === 'maintenance' ? 'maintenance' : data.range ? 'available' : 'unspecified'}`}>{asset.state === 'maintenance' ? '× Maintenance · unavailable' : data.range ? 'Available for selected dates' : 'Choose dates to check'}</span><Icon name="arrow" /></div></div></a>)}</div> : <section className="workspace-placeholder catalogue-empty"><span className="placeholder-icon"><Icon name="compass" /></span><h2>No equipment to show.</h2><p>Try another search or category, change your dates, or choose the Normal demo fixture.</p><button className="button secondary" type="button" onClick={() => update({ search: '' })}>Clear all filters</button></section>}
    </>}
    <p className="schedule-note">Scheduled availability is a plan, not a guarantee against late returns. All equipment shown is fictional demo inventory.</p>
  </>
}

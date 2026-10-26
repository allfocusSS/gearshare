import { useEffect, useRef, useState } from 'react'
import { CATEGORIES } from '../services/types.ts'
import type { Asset, AssetInput, GearShareService, ServiceError } from '../services/types.ts'
import { Icon } from '../components/Icon.tsx'
import { focusIfDropped } from '../focus.ts'

const blank: AssetInput = { name: '', inventoryCode: '', category: 'Cameras', location: '', description: '' }
export function InventoryPage({ service }: { service: GearShareService }) {
  const [assets, setAssets] = useState<Asset[]>([]), [search, setSearch] = useState(''), [editor, setEditor] = useState<Asset | 'new' | null>(null)
  const [values, setValues] = useState<AssetInput>(blank), [loading, setLoading] = useState(true), [pending, setPending] = useState(false)
  const [error, setError] = useState<ServiceError | null>(null), [message, setMessage] = useState(''), [retry, setRetry] = useState(0)
  const request = useRef(0), busy = useRef(false), heading = useRef<HTMLHeadingElement>(null), returnFocus = useRef('add-equipment')
  // After a maintenance toggle settles (success, conflict or network failure) focus goes back to that unit's toggle, once; after
  // "Retry inventory" it goes to the page heading, or to the retry button again when the list fails again.
  const toggled = useRef<string | null>(null), restoreAfterList = useRef(false), retryButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const id = ++request.current
    setLoading(true); setError(null)
    void service.listInventory().then(result => { if (id !== request.current) return; if (result.ok) setAssets(result.data); else setError(result.error); setLoading(false) })
    return () => { request.current += 1 }
  }, [service, retry])
  useEffect(() => { if (editor) heading.current?.focus() }, [editor])
  useEffect(() => {
    if (!pending && error?.fields) {
      const name = ['name','inventoryCode','category','location','description'].find(field => error.fields?.[field as keyof typeof error.fields])
      if (name) document.getElementById(`inventory-${name}`)?.focus()
    }
  }, [error, pending])
  useEffect(() => {
    const id = toggled.current
    if (pending || !id) return
    toggled.current = null
    const button = document.getElementById(`state-${id}`)
    focusIfDropped(button ?? document.getElementById('main-content'), button)
  }, [pending])
  useEffect(() => {
    if (!restoreAfterList.current || loading) return
    restoreAfterList.current = false
    focusIfDropped(error ? retryButton.current : document.getElementById('main-content'))
  }, [loading, error])
  function edit(asset: Asset | 'new', button: HTMLButtonElement) {
    returnFocus.current = button.id; setValues(asset === 'new' ? blank : { name: asset.name, inventoryCode: asset.inventoryCode, category: asset.category, location: asset.location, description: asset.description }); setEditor(asset); setError(null); setMessage('')
  }
  function back() { setEditor(null); setError(null); requestAnimationFrame(() => document.getElementById(returnFocus.current)?.focus()) }
  async function save() {
    if (!editor || busy.current) return
    busy.current = true; setPending(true); setError(null); setMessage('')
    const id = request.current
    const result = editor === 'new' ? await service.addAsset(values) : await service.editAsset(editor.id, values)
    if (id !== request.current) return
    if (result.ok) {
      setAssets(items => editor === 'new' ? [...items, result.data] : items.map(a => a.id === result.data.id ? result.data : a))
      setMessage(editor === 'new' ? 'Equipment added. This physical unit is active and ready for requests.' : 'Equipment details saved. Existing reservations and event history are retained.')
      setEditor(null); setSearch(''); requestAnimationFrame(() => document.getElementById(returnFocus.current)?.focus())
    } else setError(result.error)
    busy.current = false; setPending(false)
  }
  async function changeState(asset: Asset) {
    if (busy.current) return
    busy.current = true; setPending(true); setError(null); setMessage('')
    const id = request.current, next = asset.state === 'active' ? 'maintenance' : 'active'
    const result = await service.setAssetState(asset.id, next)
    if (id !== request.current) return
    if (result.ok) { setAssets(items => items.map(a => a.id === asset.id ? result.data : a)); setMessage(`${asset.inventoryCode} is now ${next}. ${next === 'maintenance' ? 'New requests are blocked until the unit is made active.' : 'New requests are available.'}`) }
    else setError(result.error)
    toggled.current = asset.id
    busy.current = false; setPending(false)
  }
  const visible = assets.filter(a => [a.name,a.inventoryCode,a.category,a.location].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
  const field = (key: 'name' | 'inventoryCode' | 'location' | 'description', label: string, hint: string) => <div className="field"><label htmlFor={`inventory-${key}`}>{label}</label>{key === 'description' ? <textarea id={`inventory-${key}`} value={values[key]} disabled={pending} aria-invalid={!!error?.fields?.[key]} aria-describedby={`inventory-${key}-hint${error?.fields?.[key] ? ` inventory-${key}-error` : ''}`} onChange={event => setValues(v => ({ ...v, [key]: event.target.value }))} /> : <input id={`inventory-${key}`} value={values[key]} disabled={pending} aria-invalid={!!error?.fields?.[key]} aria-describedby={`inventory-${key}-hint${error?.fields?.[key] ? ` inventory-${key}-error` : ''}`} onChange={event => setValues(v => ({ ...v, [key]: event.target.value }))} />}<span className="field-hint" id={`inventory-${key}-hint`}>{hint}</span>{error?.fields?.[key] && <span className="field-error" id={`inventory-${key}-error`}>{error.fields[key]}</span>}</div>
  return <section className="staff-workspace inventory-workspace">
    <div className="staff-intro"><div><p className="eyebrow">The equipment room</p><h2>Every unit. Accounted for.</h2><p>A clear home for the tools your club shares.</p></div>{!editor && <button id="add-equipment" type="button" className="button primary" disabled={pending || loading} onClick={event => edit('new', event.currentTarget)}>Add equipment<Icon name="box" /></button>}</div>
    {message && <p className="success-notice staff-notice" role="status"><Icon name="check" />{message}</p>}
    {error && <div className="service-notice staff-notice" role="alert"><div><strong>{error.message}</strong>{error.code === 'CONFLICT' && !error.fields && <p><a href="#/desk">Open the coordinator desk to resolve commitments</a></p>}</div>{!editor && <button type="button" ref={retryButton} className="button secondary" disabled={pending} onClick={() => { restoreAfterList.current = true; setRetry(v => v + 1) }}>Retry inventory</button>}</div>}
    {loading ? <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Loading inventory…</div> : editor ? <section className="inventory-editor" aria-labelledby="inventory-editor-title"><button className="button secondary back-link" disabled={pending} type="button" onClick={back}>← Back to inventory</button><p className="eyebrow">{editor === 'new' ? 'One record. One physical unit.' : editor.inventoryCode}</p><h2 ref={heading} tabIndex={-1} id="inventory-editor-title">{editor === 'new' ? 'Add physical equipment' : 'Edit equipment details'}</h2><p>Give each unit its own unique inventory code. Names and locations can change; existing reservation history stays intact.</p><form onSubmit={event => { event.preventDefault(); void save() }} noValidate aria-label="Equipment details"><div className="inventory-form-grid">{field('name','Equipment name','Required · 2–100 characters after trimming.')}{field('inventoryCode','Inventory code','Required · 2–30 characters. Codes are stored in uppercase and must be unique.')}<div className="field"><label htmlFor="inventory-category">Category</label><select id="inventory-category" value={values.category} disabled={pending} onChange={event => setValues(v => ({ ...v, category: event.target.value as AssetInput['category'] }))} aria-invalid={!!error?.fields?.category} aria-describedby={error?.fields?.category ? 'inventory-category-error' : undefined}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select>{error?.fields?.category && <span id="inventory-category-error" className="field-error">{error.fields.category}</span>}</div>{field('location','Pickup location','Required · 2–100 characters after trimming.')}</div>{field('description','Description','Optional · at most 2,000 characters.')}<div className="staff-actions"><button className="button primary" type="submit" disabled={pending}>{pending ? 'Saving equipment…' : editor === 'new' ? 'Add physical unit' : 'Save equipment details'}</button><button className="button secondary" type="button" disabled={pending} onClick={back}>Discard changes</button></div><p className="pending-text" role="status">{pending ? 'Saving this physical unit…' : ''}</p></form></section> : <><div className="inventory-toolbar"><div className="field"><label htmlFor="inventory-search">Search inventory</label><input id="inventory-search" type="search" placeholder="Name, code, category or location" value={search} disabled={pending} onChange={event => setSearch(event.target.value)} /></div><p>{visible.length} of {assets.length} physical units</p><button className="button secondary" type="button" disabled={pending} onClick={() => setRetry(v => v + 1)}>Refresh inventory</button></div>{!visible.length ? <div className="staff-empty"><Icon name="box" /><h3>{search ? 'No matching equipment.' : 'The equipment room is empty.'}</h3><p>{search ? 'Try a different code, name or location.' : 'Add the first physical unit to open requests.'}</p>{search && <button className="button secondary" onClick={() => setSearch('')}>Clear search</button>}</div> : <table className="staff-table inventory-table"><caption className="sr-only">Physical equipment inventory</caption><thead><tr><th>Physical unit</th><th>Category / location</th><th>State</th><th>Actions</th></tr></thead><tbody>{visible.map(asset => <tr key={asset.id} data-asset-id={asset.id}><td data-label="Physical unit"><strong>{asset.name}</strong><small>{asset.inventoryCode}</small></td><td data-label="Category / location"><span>{asset.category}</span><small>{asset.location}</small></td><td data-label="State"><span className={`status-pill ${asset.state}`}>{asset.state}</span></td><td data-label="Actions"><div className="inventory-actions"><button id={`edit-${asset.id}`} className="button secondary" disabled={pending} onClick={event => edit(asset, event.currentTarget)}>Edit<span className="sr-only"> {asset.inventoryCode}</span></button><button id={`state-${asset.id}`} className="button secondary" disabled={pending} onClick={() => void changeState(asset)}>{asset.state === 'active' ? 'Set maintenance' : 'Make active'}<span className="sr-only"> for {asset.inventoryCode}</span></button></div></td></tr>)}</tbody></table>}<p className="schedule-note">Maintenance blocks new requests. Before maintenance, record active returns and reject or cancel pending/approved reservations ending today or later.</p></>}
  </section>
}

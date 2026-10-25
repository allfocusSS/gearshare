import { useEffect, useRef, useState } from 'react'
import { Icon } from './components/Icon.tsx'
import { DemoControls } from './components/DemoControls.tsx'
import { AuthPage } from './pages/AuthPage.tsx'
import { CoordinatorPage } from './pages/CoordinatorPage.tsx'
import { InventoryPage } from './pages/InventoryPage.tsx'
import { CataloguePage } from './pages/CataloguePage.tsx'
import { ReservationsPage } from './pages/ReservationsPage.tsx'
import { AssetDetailPage } from './pages/AssetDetailPage.tsx'
import type { WorkspaceRoute } from './pages/ShellPage.tsx'
import { clubToday } from './services/dates.ts'
import { demoControls, gearShareService, isMockMode, subscribeToSessionEnd } from './services/index.ts'
import type { DemoScenario } from './services/mockService.ts'
import type { User } from './services/types.ts'

const titles = { explore: 'Explore', reservations: 'My reservations', desk: 'Coordinator desk', inventory: 'Inventory', signin: 'Sign in', register: 'Create an account', asset: 'Equipment detail' }
type Route = keyof typeof titles

function locationRoute(): { route: Route; returnTo: string; assetId: string } {
  const [path, query] = window.location.hash.replace(/^#\/?/, '').split('?')
  const assetId = path.startsWith('assets/') ? path.slice(7) : ''
  const route = assetId ? 'asset' : Object.hasOwn(titles, path) && path !== 'asset' ? path as Route : 'explore'
  const requested = new URLSearchParams(query).get('returnTo')
  const returnTo = requested && (['explore', 'reservations', 'desk', 'inventory'].includes(requested) || /^assets\/[A-Za-z0-9_-]+$/.test(requested)) ? requested : 'explore'
  return { route, returnTo, assetId }
}

export function App() {
  const [location, setLocation] = useState(locationRoute)
  const [user, setUser] = useState<User | null>(null)
  const [scenario, setScenario] = useState<DemoScenario>('normal')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sessionNotice, setSessionNotice] = useState<{ reason: 'unauthenticated' | 'logout-unconfirmed'; text: string } | null>(null)
  const requestId = useRef(0)
  const sessionEnded = useRef(false)
  const mainHeading = useRef<HTMLHeadingElement>(null)
  const sessionLink = useRef<HTMLAnchorElement>(null)
  const focusSessionNotice = useRef(false)
  const loadingSession = useRef(true)

  async function refreshSession() {
    const id = ++requestId.current
    loadingSession.current = true
    setLoading(true)
    setError('')
    const result = await gearShareService.currentUser()
    if (id !== requestId.current) return
    if (result.ok) setUser(result.data)
    else setError(result.error.message)
    loadingSession.current = false
    setLoading(false)
  }

  useEffect(() => {
    void refreshSession()
    return () => { requestId.current += 1 }
  }, [scenario])

  // A 401 from any request (or a logout the server could not confirm) ends the local session: the adapter has already
  // cleared its token, so clear the user and say why. Pages then offer sign-in with their own return navigation.
  useEffect(() => subscribeToSessionEnd((event) => {
    sessionEnded.current = true
    // Focus moves only for a 401 that arrives after the first session check (not for an expired token found at startup).
    focusSessionNotice.current = event.reason === 'unauthenticated' && !loadingSession.current
    setUser(null)
    setMessage('')
    setSessionNotice({ reason: event.reason, text: event.message })
  }), [])

  // A 401 removes the form or rows the user was working in, which drops keyboard focus (focus rule 5): move it once to
  // "Sign in again", or to the page heading when the alert has no such link. Focus the user already holds stays.
  useEffect(() => {
    if (!sessionNotice || !focusSessionNotice.current) return
    focusSessionNotice.current = false
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected && !active.matches(':disabled')) return
    ;(sessionLink.current ?? mainHeading.current)?.focus()
  }, [sessionNotice])

  useEffect(() => {
    const changed = () => { setLocation(locationRoute()); mainHeading.current?.focus() }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])

  useEffect(() => { document.title = `${titles[location.route]} · GearShare` }, [location.route])

  function changeScenario(next: DemoScenario) {
    demoControls?.setScenario(next)
    setUser(null)
    setMessage('')
    setScenario(next)
  }

  async function logout() {
    if (pending) return
    setPending(true)
    setError('')
    setMessage('')
    setSessionNotice(null)
    sessionEnded.current = false
    const result = await gearShareService.logout()
    if (result.ok) {
      setUser(null)
      window.location.hash = '/explore'
      setMessage(isMockMode ? 'Signed out. Your demo session has ended.' : 'Signed out. Your session has ended.')
    } else if (sessionEnded.current) {
      // Signed out locally but the server could not confirm it: the notice from the session event says so honestly.
      window.location.hash = '/explore'
    } else setError(result.error.message)
    setPending(false)
  }

  function signedIn(next: User, successMessage: string) {
    setUser(next)
    setSessionNotice(null)
    const destination = next.role !== 'coordinator' && ['desk', 'inventory'].includes(location.returnTo) ? 'explore' : location.returnTo
    window.location.hash = `/${destination}`
    setMessage(successMessage)
  }

  const { route, returnTo, assetId } = location
  const signInReturn = route === 'signin' || route === 'register' ? returnTo : route === 'asset' ? `assets/${assetId}` : route
  const restricted = (route === 'desk' || route === 'inventory') && user?.role !== 'coordinator'
  const nav: { route: WorkspaceRoute; label: string; icon: 'compass' | 'calendar' | 'desk' | 'box' }[] = [
    { route: 'explore', label: 'Explore', icon: 'compass' },
    { route: 'reservations', label: 'My reservations', icon: 'calendar' },
    ...(user?.role === 'coordinator' ? [{ route: 'desk', label: 'Coordinator desk', icon: 'desk' }, { route: 'inventory', label: 'Inventory', icon: 'box' }] as const : []),
  ]

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); mainHeading.current?.focus() }}>Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#/explore" aria-label="GearShare home"><span className="brand-mark" aria-hidden="true">G/</span><span>GearShare<small>THE EQUIPMENT CLUB</small></span></a>
      <nav aria-label="Main navigation">{nav.map((item) => <a key={item.route} href={`#/${item.route}`} aria-current={route === item.route || (route === 'asset' && item.route === 'explore') ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span>{item.route === route && <span className="nav-active-dot" />}</a>)}</nav>
      <div className="sidebar-note"><span className="eyebrow">LESS FRICTION. MORE MAKING.</span><p>Shared tools.<br />Bigger possibilities.</p><span className="sidebar-foot">A SINGLE-CLUB DEMO <span>↗</span></span></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div><span className="topbar-context">WORKSPACE <span>/</span></span><h1 ref={mainHeading} tabIndex={-1} id="main-content">{titles[route]}</h1></div><div className="account-area">{user ? <><span className="avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span><span className="account-name">{user.username}<small>{user.role}</small></span><button type="button" className="button secondary" onClick={() => void logout()} disabled={pending || loading}>{pending ? 'Signing out…' : 'Sign out'}</button></> : <a className="button secondary" href={`#/signin?returnTo=${encodeURIComponent(signInReturn)}`}>Sign in<Icon name="arrow" /></a>}</div></header>
      <main className="main-content" aria-labelledby="main-content">
        {isMockMode && <DemoControls scenario={scenario} onChange={changeScenario} disabled={loading || pending} today={clubToday()} />}
        {sessionNotice && <div className="service-notice" role="alert"><span>{sessionNotice.text}</span>{sessionNotice.reason === 'unauthenticated' && route !== 'signin' && route !== 'register' && <a ref={sessionLink} className="button secondary" href={`#/signin?returnTo=${encodeURIComponent(signInReturn)}`}>Sign in again</a>}</div>}
        {message && <div className="success-notice" role="status"><Icon name="check" />{message}</div>}
        {error && <div className="service-notice" role="alert"><span>{error}</span><button className="button secondary" type="button" disabled={loading || pending} onClick={() => void refreshSession()}>Retry session</button></div>}
        {loading ? <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" /><span>{isMockMode ? 'Loading your demo workspace…' : 'Loading your workspace…'}</span></div> : restricted ? <section className="workspace-placeholder"><span className="placeholder-icon"><Icon name="desk" /></span><p className="eyebrow">Coordinator access</p><h2>Sign in as a coordinator.</h2><p>{isMockMode ? 'This workspace is available to the fictional coordinator account.' : 'This workspace is available to coordinator accounts.'}</p><a className="button primary" href={`#/signin?returnTo=${route}`}>Go to sign in<Icon name="arrow" /></a></section> : route === 'signin' || route === 'register' ? <AuthPage key={`${route}-${scenario}`} register={route === 'register'} service={gearShareService} onPending={(value) => { setPending(value); if (value) setMessage('') }} onSuccess={signedIn} returnTo={returnTo} /> : route === 'explore' ? <CataloguePage service={gearShareService} /> : route === 'asset' ? <AssetDetailPage key={assetId} assetId={assetId} service={gearShareService} user={user} /> : route === 'reservations' ? <ReservationsPage service={gearShareService} user={user} /> : route === 'desk' ? <CoordinatorPage service={gearShareService} /> : <InventoryPage service={gearShareService} />}
        <footer className="page-footer"><span>GEARSHARE <span>·</span> CAMPUS EQUIPMENT LENDING</span><span>Made for shared possibilities.</span></footer>
      </main>
    </div>
  </div>
}

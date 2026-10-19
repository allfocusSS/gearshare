import type { User } from '../services/types.ts'
import { Icon } from '../components/Icon.tsx'

export type WorkspaceRoute = 'explore' | 'reservations' | 'desk' | 'inventory'

export function ShellPage({ route, user, empty }: { route: WorkspaceRoute; user: User | null; empty: boolean }) {
  if (route !== 'explore') {
    const copy = {
      reservations: { icon: 'calendar', eyebrow: 'Your lending notebook', title: 'A place for every reservation.', detail: 'Your requests, pickup dates and lending history will be collected here.' },
      desk: { icon: 'desk', eyebrow: 'Coordinator workspace', title: 'A clear view of the lending desk.', detail: 'Requests, pickups and active loans will be brought together here.' },
      inventory: { icon: 'box', eyebrow: 'Coordinator workspace', title: 'Every physical unit. Accounted for.', detail: 'The inventory workspace will bring equipment details and care information together.' },
    }[route]
    return <section className="workspace-placeholder">
      <span className="placeholder-icon"><Icon name={copy.icon as 'calendar' | 'desk' | 'box'} /></span>
      <p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p>{copy.detail}</p>
      <span className="coming-label">Workspace preview · lending tools coming soon</span>
      {!user && <a className="button primary" href="#/signin?returnTo=reservations">Sign in to your account<Icon name="arrow" /></a>}
    </section>
  }

  return <>
    <div className="intro-row"><div><p className="eyebrow">The club equipment desk</p><h2>Good equipment.<br /><span>Shared fairly.</span></h2></div><p>A shared kit for brighter ideas.<br />Borrow with care. Create with confidence.</p></div>
    <div className="welcome-grid">
      <section className="welcome-card">
        <div><span className="tag">WELCOME TO GEARSHARE</span><h3>{user ? `You're in, ${user.username}.` : 'Your next idea starts here.'}</h3><p>{user ? `Your ${user.role} demo is ready. Explore the navigation to get a feel for the shared desk.` : 'Sign in as a student or coordinator, or create a fictional student account to try the demo.'}</p>
          {!user && <a className="button primary" href="#/signin">Try the demo<Icon name="arrow" /></a>}
          {user && <a className="button primary" href={user.role === 'coordinator' ? '#/desk' : '#/reservations'}>Open your workspace<Icon name="arrow" /></a>}
        </div><div className="equipment-art" aria-hidden="true"><div className="art-orbit" /><Icon name="camera" /><span className="art-id">G / 001</span><span className="art-dot" /></div>
      </section>
      <section className="how-card" aria-labelledby="how-heading"><p className="eyebrow">One desk. Shared possibilities.</p><h3 id="how-heading">A better way to borrow.</h3>{['Find the right equipment', 'Request your dates', 'Pick up. Create. Return.'].map((item, index) => <div className="how-step" key={item}><span>0{index + 1}</span><p>{item}</p></div>)}</section>
    </div>
    <section className="preview-note"><span className="placeholder-icon"><Icon name="compass" /></span><div><h3>{empty ? 'A fresh start, with no demo accounts.' : 'The equipment catalogue is coming soon.'}</h3><p>{empty ? 'The Empty fixture has no seeded students or coordinators. Create a student account to explore this clean demo.' : 'This preview includes member sign-in and the club navigation. Equipment browsing and lending tools are still being prepared.'}</p></div>{empty && <a className="button secondary" href="#/register">Create account<Icon name="arrow" /></a>}</section>
  </>
}

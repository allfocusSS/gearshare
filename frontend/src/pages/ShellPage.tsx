import type { User } from '../services/types.ts'
import { Icon } from '../components/Icon.tsx'

export type WorkspaceRoute = 'explore' | 'reservations' | 'desk' | 'inventory'

export function ShellPage({ route, user }: { route: Exclude<WorkspaceRoute, 'explore'>; user: User | null }) {
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

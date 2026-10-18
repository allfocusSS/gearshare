import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main className="startup">
      <span className="brand-mark" aria-hidden="true">G/</span>
      <p className="eyebrow">Campus equipment lending</p>
      <h1>GearShare</h1>
      <p className="tagline">Good equipment. Shared fairly.</p>
      <p className="status">The application skeleton is running.</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

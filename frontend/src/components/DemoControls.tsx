import type { DemoScenario } from '../services/mockService.ts'

export function DemoControls({ scenario, onChange, disabled, today }: { scenario: DemoScenario; onChange: (scenario: DemoScenario) => void; disabled: boolean; today: string }) {
  return <section className="demo-banner" aria-label="Demo information">
    <div className="demo-copy"><span className="demo-badge">Demo mode</span><span>Fictional accounts. Memory only. Reload resets everything.</span></div>
    <details className="demo-controls">
      <summary>Demo controls</summary>
      <div className="demo-controls-panel">
        <label htmlFor="demo-scenario">Response fixture</label>
        <select id="demo-scenario" value={scenario} disabled={disabled} onChange={(event) => onChange(event.target.value as DemoScenario)}>
          <option value="normal">Normal — successful responses</option>
          <option value="loading">Loading — 1.6 second responses</option>
          <option value="empty">Empty — no accounts or equipment</option>
          <option value="error">Error — service unavailable</option>
        </select>
        <p>Changing a fixture clears demo accounts and signs you out. Empty starts without accounts or equipment; registration still works. Error makes all requests fail.</p>
        <p className="club-date">Club date: <time dateTime={today}>{today}</time> · Asia/Almaty</p>
      </div>
    </details>
  </section>
}

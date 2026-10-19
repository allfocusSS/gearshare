import { addDays } from '../services/dates.ts'
import type { DateRange, ServiceError } from '../services/types.ts'

export function DateRangeFields({ value, onChange, today, error, prefix }: { value: DateRange; onChange: (value: DateRange) => void; today: string; error: ServiceError | null; prefix: string }) {
  return <div className="range-fields">
    {(['startDate', 'endDate'] as const).map((key) => <div className="field" key={key}>
      <label htmlFor={`${prefix}-${key}`}>{key === 'startDate' ? 'Start date' : 'End date'}</label>
      <input id={`${prefix}-${key}`} type="date" min={today} max={addDays(today, 90)} value={value[key]} aria-invalid={!!error?.fields?.[key]} aria-describedby={error?.fields?.[key] ? `${prefix}-${key}-error` : `${prefix}-date-hint`} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
      {error?.fields?.[key] && <span className="field-error" id={`${prefix}-${key}-error`}>{error.fields[key]}</span>}
    </div>)}
    <p id={`${prefix}-date-hint`} className="date-hint">Inclusive days · Asia/Almaty · 1–14 days, through {addDays(today, 90)}</p>
  </div>
}

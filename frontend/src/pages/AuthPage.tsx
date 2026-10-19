import { useRef, useState } from 'react'
import type { Credentials, GearShareService, ServiceError, User } from '../services/types.ts'
import { DEMO_ACCOUNTS } from '../services/mockService.ts'
import { Icon } from '../components/Icon.tsx'

export function AuthPage({ register, service, onSuccess, onPending, returnTo }: {
  register: boolean
  service: GearShareService
  onSuccess: (user: User, message: string) => void
  onPending: (pending: boolean) => void
  returnTo: string
}) {
  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ServiceError | null>(null)
  const submitting = useRef(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    onPending(true)
    setError(null)
    try {
      const result = await (register ? service.register(credentials) : service.login(credentials))
      if (result.ok) onSuccess(result.data, register ? 'Demo account created. You are signed in as a student.' : `Signed in as ${result.data.username}.`)
      else {
        setError(result.error)
        if (result.error.fields?.username) usernameRef.current?.focus()
        else if (result.error.fields?.password) passwordRef.current?.focus()
      }
    } catch {
      setError({ code: 'SERVICE_UNAVAILABLE', message: 'The demo service is unavailable. Please try again.' })
    } finally {
      submitting.current = false
      setPending(false)
      onPending(false)
    }
  }

  function fill(role: keyof typeof DEMO_ACCOUNTS) {
    setCredentials({ ...DEMO_ACCOUNTS[role] })
    setError(null)
    usernameRef.current?.focus()
  }

  return <div className="auth-layout">
    <section className="auth-story">
      <p className="eyebrow">A little access. A lot of possibility.</p>
      <h2>Make something<br />worth sharing.</h2>
      <p>One club, a shared equipment desk and room for your next idea.</p>
      <div className="auth-art" aria-hidden="true"><Icon name="camera" /><span className="art-cross one">+</span><span className="art-cross two">+</span><span className="art-tag">READY WHEN YOU ARE</span></div>
      <p className="small muted">This is a frontend demo. Use fictional details only; accounts disappear when this page reloads.</p>
    </section>
    <section className="auth-card" aria-labelledby="auth-title">
      <span className="eyebrow">{register ? 'Join the club' : 'Welcome back'}</span>
      <h2 id="auth-title">{register ? 'Create your account' : 'Sign in to GearShare'}</h2>
      <p className="muted">{register ? 'Every new account starts as a student.' : 'Try the student view or visit the coordinator desk.'}</p>
      <form onSubmit={submit} noValidate aria-busy={pending}>
        {error && <div className="form-alert" role="alert">{error.message}</div>}
        <div className="field">
          <label htmlFor="username">Username</label>
          <input ref={usernameRef} id="username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={credentials.username} disabled={pending} aria-invalid={!!error?.fields?.username} aria-describedby={`username-hint${error?.fields?.username ? ' username-error' : ''}`} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} />
          <span id="username-hint" className="field-hint">3–30 letters (A–Z), digits or underscores. Case does not matter.</span>
          {error?.fields?.username && <span id="username-error" className="field-error">{error.fields.username}</span>}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input ref={passwordRef} id="password" name="password" type="password" required autoComplete={register ? 'new-password' : 'current-password'} value={credentials.password} disabled={pending} aria-invalid={!!error?.fields?.password} aria-describedby={`password-hint${error?.fields?.password ? ' password-error' : ''}`} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} />
          <span id="password-hint" className="field-hint">10–128 characters.</span>
          {error?.fields?.password && <span id="password-error" className="field-error">{error.fields.password}</span>}
        </div>
        <button className="button primary full" type="submit" disabled={pending}>{pending ? <><span className="spinner" aria-hidden="true" />{register ? 'Creating account…' : 'Signing in…'}</> : <>{register ? 'Create student account' : 'Sign in'}<Icon name="arrow" /></>}</button>
        <p className="pending-text" role="status">{pending ? 'Waiting for the demo service. Please keep this form open.' : ''}</p>
      </form>
      <p className="auth-switch">{register ? 'Already have an account?' : 'New to GearShare?'} <a href={`#/${register ? 'signin' : 'register'}?returnTo=${encodeURIComponent(returnTo)}`}>{register ? 'Sign in' : 'Create an account'}</a></p>
      {!register && <div className="credentials">
        <p className="eyebrow">Fictional demo accounts</p>
        {(['student', 'coordinator'] as const).map((role) => <div className="credential-row" key={role}>
          <div><strong>{role === 'student' ? 'Student' : 'Coordinator'}</strong><code>{DEMO_ACCOUNTS[role].username}</code><code>{DEMO_ACCOUNTS[role].password}</code></div>
          <button type="button" className="button subtle" disabled={pending} onClick={() => fill(role)} aria-label={`Fill ${role} credentials`}>Fill <Icon name="arrow" /></button>
        </div>)}
      </div>}
    </section>
  </div>
}

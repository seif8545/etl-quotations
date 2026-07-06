import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error, data } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } },
      })
      if (error) setError(error.message)
      else if (!data.session) setInfo('Account created. Check your email to confirm, then sign in.')
    }
    setBusy(false)
  }

  return (
    <div className="center-page">
      <form className="card login" onSubmit={submit}>
        <h1>Egypt Top Light</h1>
        <p className="muted">Quotations · Guarantee Letters · Hotel Vouchers</p>
        {mode === 'signup' && (
          <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <div className="error">{error}</div>}
        {info && <div className="info">{info}</div>}
        <button disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'New agent? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}

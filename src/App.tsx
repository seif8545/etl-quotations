import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { QuotationDraft } from './lib/types'
import Login from './pages/Login'
import Home from './pages/Home'
import QuotationWizard from './pages/QuotationWizard'
import Admin from './pages/Admin'
import Letter from './pages/Letter'
import Voucher from './pages/Voucher'
import Documents from './pages/Documents'

export type Page = 'home' | 'quotation' | 'letter' | 'voucher' | 'documents' | 'admin'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('home')
  const [isAdmin, setIsAdmin] = useState(false)
  const [editDraft, setEditDraft] = useState<QuotationDraft | undefined>()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setIsAdmin(false); return }
    supabase.from('q_profiles').select('role').eq('id', session.user.id).single()
      .then(({ data }) => setIsAdmin(data?.role === 'admin'))
  }, [session])

  if (loading) return <div className="center-page">Loading…</div>
  if (!session) return <Login />

  const go = (p: Page) => { if (p !== 'quotation') setEditDraft(undefined); setPage(p) }
  const home = () => go('home')

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand" onClick={home}>Egypt Top Light</span>
        <button className={`nav-link ${page === 'documents' ? 'on' : ''}`} onClick={() => go('documents')}>Documents</button>
        {isAdmin && (
          <button className={`nav-link ${page === 'admin' ? 'on' : ''}`} onClick={() => go('admin')}>Admin</button>
        )}
        <span className="spacer" />
        <span className="user">{session.user.email}</span>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      {page === 'home' && <Home go={go} />}
      {page === 'quotation' && <QuotationWizard done={home} initial={editDraft} />}
      {page === 'letter' && <Letter done={home} />}
      {page === 'voucher' && <Voucher done={home} />}
      {page === 'documents' && (
        <Documents openQuotation={(d) => { setEditDraft(d); setPage('quotation') }} isAdmin={isAdmin} uid={session.user.id} />
      )}
      {page === 'admin' && (isAdmin ? <Admin /> : <div className="center-page">Admins only.</div>)}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './lib/supabase'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectPage from './pages/ProjectPage'
import SettingsPage from './pages/Settings'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!configured) return (
    <div className="center-card"><h2>Chưa cấu hình Supabase</h2>
      <p>Tạo file <code>.env</code> với <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code> (xem README).</p></div>
  )
  if (!ready) return <div className="center-card">Đang tải…</div>
  if (!session) return <Login />

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand"><span className="brand-mark">DM</span> DMVL AI <small>Danh mục vật liệu hoàn thiện</small></Link>
        <nav>
          <Link to="/">Dự án</Link>
          <Link to="/settings">Cài đặt</Link>
          <span className="muted">{session.user.email}</span>
          <button className="btn ghost sm" onClick={async () => { await supabase.auth.signOut(); nav('/') }}>Đăng xuất</button>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/p/:id" element={<ProjectPage />} />
          <Route path="/p/:id/:tab" element={<ProjectPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

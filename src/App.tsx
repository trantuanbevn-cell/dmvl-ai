import { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './lib/supabase'
import ForcePassword from './components/ForcePassword'
import { AuthProvider, useAuth, ROLE_VN } from './lib/auth'
import { PresenceProvider, useOnline, colorOf } from './lib/presence'
import { Toaster } from './lib/toast'
import Login from './pages/Login'
import Projects from './pages/Projects'
import ProjectPage from './pages/ProjectPage'
import SettingsPage from './pages/Settings'
import Team from './pages/Team'

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || '?'

function Shell({ session }: { session: Session }) {
  const { profile, role, isAdmin, name, loading } = useAuth()
  const online = useOnline()
  const nav = useNavigate()
  const out = async () => { await supabase.auth.signOut(); nav('/') }
  if (loading) return <div className="center-card">Đang tải…</div>
  if (!role) return (
    <div className="center-card"><h2>Chưa có quyền truy cập</h2>
      <p>{profile && !profile.active ? 'Tài khoản của bạn đã bị khoá.' : 'Tài khoản này chưa được quản trị viên cấp quyền.'} Hãy liên hệ quản trị viên của nhóm.</p>
      <p className="small muted">{session.user.email}</p>
      <button className="btn" onClick={out}>Đăng xuất</button></div>
  )
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand"><span className="brand-mark">DM</span> DMVL AI <small>Danh mục vật liệu hoàn thiện</small></Link>
        <nav>
          <Link to="/">Dự án</Link>
          {isAdmin && <Link to="/team">Thành viên</Link>}
          <Link to="/settings">Cài đặt</Link>
          <div className="online" title={online.map(o => `${o.name} (${ROLE_VN[o.role as keyof typeof ROLE_VN] ?? o.role})`).join('\n')}>
            <span className="online-n">● {online.length} online</span>
            <div className="avs">{online.slice(0, 8).map(o => <span key={o.id} className="av" style={{ background: colorOf(o.id) }} title={`${o.name}${o.room ? ' · đang xem một phòng' : ''}`}>{initials(o.name)}</span>)}{online.length > 8 && <span className="av more">+{online.length - 8}</span>}</div>
          </div>
          <span className="who"><b>{name}</b> <span className={'role-badge ' + role}>{ROLE_VN[role]}</span></span>
          <button className="btn ghost sm" onClick={out}>Đăng xuất</button>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/p/:id" element={<ProjectPage />} />
          <Route path="/p/:id/:tab" element={<ProjectPage />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <Toaster />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
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
  if (session.user.user_metadata?.must_change) return <ForcePassword name={(session.user.email ?? '').replace(/@dmvl\.local$/i, '')} />
  return <AuthProvider session={session}><PresenceProvider><Shell session={session} /></PresenceProvider></AuthProvider>
}

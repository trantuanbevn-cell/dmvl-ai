import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
    setBusy(false)
    if (error) setMsg(error.message)
    else if (mode === 'up') setMsg('Đã tạo tài khoản. Nếu Supabase bật xác nhận email, hãy mở email để kích hoạt rồi đăng nhập.')
  }
  return (
    <div className="login">
      <form className="center-card" onSubmit={submit}>
        <div className="brand big"><span className="brand-mark">DM</span> DMVL AI</div>
        <p className="muted">Bóc tách danh mục vật liệu hoàn thiện từ concept nội thất</p>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Mật khẩu<input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} /></label>
        <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
        <button type="button" className="btn ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
        </button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  )
}

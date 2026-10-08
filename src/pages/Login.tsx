import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.includes('@') ? email.trim() : email.trim().toLowerCase() + '@dmvl.local', password: pw })
    setBusy(false)
    if (error) setMsg(error.message === 'Invalid login credentials' ? 'Sai tên đăng nhập hoặc mật khẩu.' : error.message)
  }
  return (
    <div className="login">
      <form className="center-card" onSubmit={submit}>
        <div className="brand big"><span className="brand-mark">DM</span> DMVL AI</div>
        <p className="muted">Bóc tách danh mục vật liệu hoàn thiện từ concept nội thất</p>
        <label>Tên đăng nhập<input autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Mật khẩu<input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} /></label>
        <button className="btn primary" disabled={busy}>Đăng nhập</button>
        <p className="small muted">Tài khoản do quản trị viên cấp. Chưa có tài khoản? Liên hệ quản trị viên của nhóm.</p>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  )
}

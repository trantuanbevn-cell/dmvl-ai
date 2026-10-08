import { useState } from 'react'
import { supabase } from '../lib/supabase'

/** Lần đăng nhập đầu (hoặc sau khi quản trị đặt lại): bắt buộc tự đặt mật khẩu riêng */
export default function ForcePassword({ name }: { name: string }) {
  const [a, setA] = useState(''), [b, setB] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    if (a.length < 8) return setMsg('Mật khẩu tối thiểu 8 ký tự.')
    if (a !== b) return setMsg('Hai lần nhập chưa giống nhau.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: a, data: { must_change: false } })
    setBusy(false)
    if (error) return setMsg(error.message)
    location.reload()
  }
  return (
    <div className="login">
      <form className="center-card" onSubmit={submit}>
        <div className="brand big"><span className="brand-mark">DM</span> DMVL AI</div>
        <h3>Xin chào {name}</h3>
        <p className="muted">Đây là lần đăng nhập đầu tiên. Hãy đặt mật khẩu riêng của bạn – dùng cho các lần sau. Mật khẩu được cấp ban đầu sẽ không còn dùng được.</p>
        <label>Mật khẩu mới (≥ 8 ký tự)<input type="password" value={a} onChange={e => setA(e.target.value)} required autoFocus /></label>
        <label>Nhập lại mật khẩu mới<input type="password" value={b} onChange={e => setB(e.target.value)} required /></label>
        <button className="btn primary" disabled={busy}>Lưu mật khẩu & vào phần mềm</button>
        <button type="button" className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  )
}

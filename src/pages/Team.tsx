import { useEffect, useState } from 'react'
import { useAuth, ROLE_VN, ROLE_HELP, type Role } from '../lib/auth'
import { useOnline } from '../lib/presence'
import { listUsers, createUser, updateUser, deleteUser, genPassword, type TeamUser } from '../lib/team'

const ago = (iso: string | null) => { if (!iso) return 'chưa đăng nhập'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước` }

export default function Team() {
  const { isAdmin, session } = useAuth()
  const online = useOnline()
  const [users, setUsers] = useState<TeamUser[]>([])
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const [f, setF] = useState({ email: '', full_name: '', role: 'editor' as Role, password: genPassword() })
  const load = () => listUsers().then(setUsers).catch(e => setErr(String(e.message ?? e)))
  useEffect(() => { if (isAdmin) load() }, [isAdmin])
  if (!isAdmin) return <div className="page"><div className="card muted">Chỉ quản trị viên mới xem được trang này.</div></div>
  const act = async (fn: () => Promise<unknown>, ok = '') => { setBusy(true); setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await load() } catch (e: any) { setErr(String(e.message ?? e)) } setBusy(false) }
  const isOn = (id: string) => online.some(o => o.id === id)
  return (
    <div className="page">
      <h1>Thành viên & phân quyền</h1>
      {err && <div className="note warn">⚠ {err}</div>}
      {msg && <div className="note">{msg}</div>}
      <form className="card stack" onSubmit={e => { e.preventDefault(); act(async () => { await createUser(f); setMsg(`Đã tạo tài khoản ${f.email}. Gửi cho họ email + mật khẩu: ${f.password}`); setF({ email: '', full_name: '', role: 'editor', password: genPassword() }) }) }}>
        <h3>Cấp tài khoản mới</h3>
        <div className="row gap">
          <input type="email" placeholder="Email đăng nhập" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required style={{ flex: 2 }} />
          <input placeholder="Họ tên hiển thị" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} style={{ flex: 1.3 }} />
          <select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>{(['editor', 'viewer', 'admin'] as Role[]).map(r => <option key={r} value={r}>{ROLE_VN[r]}</option>)}</select>
        </div>
        <div className="row gap">
          <input value={f.password} onChange={e => setF({ ...f, password: e.target.value })} style={{ flex: 1, fontFamily: 'monospace' }} minLength={8} required />
          <button type="button" className="btn ghost" onClick={() => setF({ ...f, password: genPassword() })}>Tạo mật khẩu khác</button>
          <button className="btn primary" disabled={busy}>+ Tạo tài khoản</button>
        </div>
        <div className="small muted">{(['admin', 'editor', 'viewer'] as Role[]).map(r => <div key={r}><b>{ROLE_VN[r]}</b>: {ROLE_HELP[r]}</div>)}</div>
      </form>
      <div className="card">
        <table className="tbl">
          <thead><tr><th /><th>Tài khoản</th><th>Vai trò</th><th>Hoạt động</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{users.map(u => {
            const me = u.id === session.user.id, on = online.find(o => o.id === u.id)
            return (
              <tr key={u.id} style={u.active ? undefined : { opacity: .55 }}>
                <td style={{ width: 20 }}><span className={'dotc' + (isOn(u.id) ? ' on' : '')} title={isOn(u.id) ? 'Đang online' : 'Offline'} style={{ background: isOn(u.id) ? '#2e7d32' : '#bbb' }} /></td>
                <td><b>{u.full_name || '—'}</b>{me && ' (bạn)'}<div className="small muted">{u.email}</div></td>
                <td><select value={u.role} disabled={busy || me} onChange={e => act(() => updateUser(u.id, { role: e.target.value as Role }))}>{(['admin', 'editor', 'viewer'] as Role[]).map(r => <option key={r} value={r}>{ROLE_VN[r]}</option>)}</select></td>
                <td className="small">{on ? <span style={{ color: '#2e7d32' }}>● đang online{on.tab ? ` – tab ${on.tab}` : ''}</span> : <span className="muted">đăng nhập {ago(u.last_sign_in_at)}</span>}</td>
                <td>{u.active ? <span className="pill">Đang dùng</span> : <span className="pill st-error">Đã khoá</span>}</td>
                <td className="row gap sm-gap">
                  <button className="btn sm" disabled={busy || me} onClick={() => act(() => updateUser(u.id, { active: !u.active }))}>{u.active ? 'Khoá' : 'Mở khoá'}</button>
                  <button className="btn sm" disabled={busy} onClick={() => { const p = genPassword(); if (confirm(`Đặt mật khẩu mới cho ${u.email}?\n\nMật khẩu mới: ${p}`)) act(() => updateUser(u.id, { password: p }), `Mật khẩu mới của ${u.email}: ${p}`) }}>Đặt lại MK</button>
                  <button className="btn ghost sm danger" disabled={busy || me} onClick={() => confirm(`Xoá hẳn tài khoản ${u.email}?`) && act(() => deleteUser(u.id))}>Xoá</button>
                </td>
              </tr>)
          })}</tbody>
        </table>
      </div>
    </div>
  )
}

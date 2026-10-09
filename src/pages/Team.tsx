import { useEffect, useState } from 'react'
import { useAuth, ROLE_VN, ROLE_HELP, type Role } from '../lib/auth'
import { FEATURES } from '../lib/features'
import { supabase } from '../lib/supabase'
import { useOnline } from '../lib/presence'
import { listUsers, createUser, updateUser, deleteUser, genPassword, loginName, slugName, inviteText, listProjectsLite, listMembers, setMemberProjects, type TeamUser, type ProjectLite } from '../lib/team'

const ago = (iso: string | null) => { if (!iso) return 'chưa đăng nhập'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước` }

export default function Team() {
  const { isAdmin, session } = useAuth()
  const online = useOnline()
  const [users, setUsers] = useState<TeamUser[]>([])
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const [f, setF] = useState({ full_name: '', username: '', role: 'editor' as Role, password: genPassword() })
  const [invite, setInvite] = useState<string | null>(null)
  const uniqueName = (full: string) => { const base = slugName(full) || 'user'; let n = base, i = 1; const taken = new Set(users.map(u => loginName(u.email))); while (taken.has(n)) n = base + ++i; return n }
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [members, setMembers] = useState<Map<string, string[]> | null>(new Map())
  const [open, setOpen] = useState<string | null>(null) // user id đang mở bảng chọn dự án
  const [newProj, setNewProj] = useState<string[]>([])
  const [feats, setFeats] = useState<Map<string, string[]>>(new Map())
  const loadFeats = () => supabase.from('profiles').select('id,features').then(({ data }) => setFeats(new Map((data ?? []).map((r: any) => [r.id, r.features ?? []]))))
  const load = () => Promise.all([loadFeats(), listUsers().then(setUsers), listProjectsLite().then(setProjects), listMembers().then(setMembers)]).catch(e => setErr(String(e.message ?? e)))
  useEffect(() => { if (isAdmin) load() }, [isAdmin])
  if (!isAdmin) return <div className="page"><div className="card muted">Chỉ quản trị viên mới xem được trang này.</div></div>
  const act = async (fn: () => Promise<unknown>, ok = '') => { setBusy(true); setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await load() } catch (e: any) { setErr(String(e.message ?? e)) } setBusy(false) }
  const isOn = (id: string) => online.some(o => o.id === id)
  return (
    <div className="page">
      <h1>Thành viên & phân quyền</h1>
      {err && <div className="note warn">⚠ {err}</div>}
      {msg && <div className="note">{msg}</div>}
      {invite && <div className="card invite-card"><div className="row between"><h3>Bảng tin gửi cho thành viên</h3><button className="btn ghost sm" onClick={() => setInvite(null)}>✕</button></div>
        <pre>{invite}</pre>
        <button className="btn primary" onClick={() => { navigator.clipboard?.writeText(invite); setMsg('Đã sao chép – dán vào Zalo/Email gửi cho họ.') }}>📋 Sao chép nội dung</button>
        <span className="small muted"> Mật khẩu này chỉ hiện một lần; thành viên sẽ phải đổi ngay khi vào lần đầu.</span></div>}
      <form className="card stack" onSubmit={e => { e.preventDefault(); act(async () => { const un = f.username || uniqueName(f.full_name); const r = await createUser({ ...f, username: un }); if (r?.id && f.role !== 'admin' && newProj.length && members) await setMemberProjects(r.id, newProj); setNewProj([]); setInvite(inviteText(f.full_name, un, f.password)); setF({ full_name: '', username: '', role: 'editor', password: genPassword() }) }) }}>
        <h3>Cấp tài khoản mới</h3>
        <div className="row gap">
          <input placeholder="Họ tên (vd: Nguyễn Văn A)" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} required style={{ flex: 2 }} />
          <select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>{(['editor', 'viewer', 'admin'] as Role[]).map(r => <option key={r} value={r}>{ROLE_VN[r]}</option>)}</select>
        </div>
        <div className="row gap">
          <input value={f.password} readOnly style={{ flex: 1, fontFamily: 'monospace' }} title="Mật khẩu dùng lần đầu" />
          <button type="button" className="btn ghost" onClick={() => setF({ ...f, password: genPassword() })}>🎲 Random</button>
          <button className="btn primary" disabled={busy || !f.full_name.trim()}>+ Tạo tài khoản</button>
        </div>
        {f.full_name.trim() && <div className="small muted">Tên đăng nhập sẽ là: <b>{uniqueName(f.full_name)}</b></div>}
        {members === null && <div className="note warn">⚠ Chưa bật phân quyền theo dự án trong cơ sở dữ liệu – chạy file <code>0003_project_access.sql</code> trong Supabase SQL Editor. Cho đến lúc đó mọi thành viên thấy tất cả dự án.</div>}
        {f.role !== 'admin' && members && <div><div className="small"><b>Dự án được truy cập</b> <span className="muted">(quản trị luôn thấy tất cả)</span></div><ProjectPicker projects={projects} value={newProj} onChange={setNewProj} /></div>}
        <div className="small muted">{(['admin', 'editor', 'viewer'] as Role[]).map(r => <div key={r}><b>{ROLE_VN[r]}</b>: {ROLE_HELP[r]}</div>)}</div>
      </form>
      <div className="card">
        <table className="tbl">
          <thead><tr><th /><th>Tài khoản</th><th>Vai trò</th><th>Dự án được truy cập</th><th>Tính năng</th><th>Hoạt động</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{users.map(u => {
            const me = u.id === session.user.id, on = online.find(o => o.id === u.id)
            return (
              <tr key={u.id} style={u.active ? undefined : { opacity: .55 }}>
                <td style={{ width: 20 }}><span className={'dotc' + (isOn(u.id) ? ' on' : '')} title={isOn(u.id) ? 'Đang online' : 'Offline'} style={{ background: isOn(u.id) ? '#2e7d32' : '#bbb' }} /></td>
                <td><b>{u.full_name || '—'}</b>{me && ' (bạn)'}<div className="small muted">{loginName(u.email)}</div></td>
                <td><select value={u.role} disabled={busy || me} onChange={e => act(() => updateUser(u.id, { role: e.target.value as Role }))}>{(['admin', 'editor', 'viewer'] as Role[]).map(r => <option key={r} value={r}>{ROLE_VN[r]}</option>)}</select></td>
                <td className="small" style={{ minWidth: 200 }}>
                  {u.role === 'admin' ? <span className="muted">Tất cả dự án</span> : members === null ? <span className="muted">—</span> : <>
                    {(members.get(u.id) ?? []).length ? (members.get(u.id) ?? []).map(pid => <span key={pid} className="loc-tag">{projects.find(p => p.id === pid)?.name ?? '…'}</span>) : <span className="bad-text">Chưa được gán dự án nào</span>}
                    <div><button className="btn ghost sm" onClick={() => setOpen(open === u.id ? null : u.id)}>{open === u.id ? 'Đóng' : '✎ Chọn dự án'}</button></div>
                    {open === u.id && <ProjectPicker projects={projects} value={members.get(u.id) ?? []} onChange={v => act(async () => { await setMemberProjects(u.id, v) })} disabled={busy} />}
                  </>}
                </td>
                <td className="small">{u.role === 'admin' ? <span className="muted">Tất cả</span> : FEATURES.map(ft => { const cur = feats.get(u.id) ?? []; return <label key={ft.key} className="row gap sm-gap small"><input type="checkbox" disabled={busy} checked={cur.includes(ft.key)} onChange={e => act(async () => { const nx = e.target.checked ? [...cur, ft.key] : cur.filter(x => x !== ft.key); const { error } = await supabase.from('profiles').update({ features: nx }).eq('id', u.id); if (error) throw error })} /> {ft.label}</label> })}</td>
                <td className="small">{on ? <span style={{ color: '#2e7d32' }}>● đang online{on.tab ? ` – tab ${on.tab}` : ''}</span> : <span className="muted">đăng nhập {ago(u.last_sign_in_at)}</span>}</td>
                <td>{u.active ? <span className="pill">Đang dùng</span> : <span className="pill st-error">Đã khoá</span>}</td>
                <td className="row gap sm-gap">
                  <button className="btn sm" disabled={busy || me} onClick={() => act(() => updateUser(u.id, { active: !u.active }))}>{u.active ? 'Khoá' : 'Mở khoá'}</button>
                  <button className="btn sm" disabled={busy} onClick={() => { const p = genPassword(); if (confirm(`Đặt mật khẩu mới cho ${u.full_name || loginName(u.email)}? Họ sẽ phải đổi lại khi đăng nhập.`)) act(async () => { await updateUser(u.id, { password: p }); setInvite(inviteText(u.full_name || loginName(u.email), loginName(u.email), p)) }) }}>Đặt lại MK</button>
                  <button className="btn ghost sm danger" disabled={busy || me} onClick={() => confirm(`Xoá hẳn tài khoản ${loginName(u.email)}?`) && act(() => deleteUser(u.id))}>Xoá</button>
                </td>
              </tr>)
          })}</tbody>
        </table>
      </div>
    </div>
  )
}

function ProjectPicker({ projects, value, onChange, disabled }: { projects: ProjectLite[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  if (!projects.length) return <div className="small muted">Chưa có dự án nào.</div>
  return <div className="proj-pick">{projects.map(p => (
    <label key={p.id} className="row gap sm-gap small"><input type="checkbox" disabled={disabled} checked={value.includes(p.id)} onChange={e => onChange(e.target.checked ? [...value, p.id] : value.filter(x => x !== p.id))} /> {p.name}</label>))}</div>
}

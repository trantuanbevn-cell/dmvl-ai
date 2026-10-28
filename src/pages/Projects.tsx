import { confirmDelete } from '../lib/deleteGuard'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { useAuth } from '../lib/auth'
import { finishProject, reopenProject } from '../lib/archive'
import { toast } from '../lib/toast'

const STATUS: Record<string, string> = { new: 'Mới tạo', pages_ready: 'Đã tách trang', classified: 'Đã gom phòng', analyzed: 'Đã phân tích' }

export default function Projects() {
  const [list, setList] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [loc, setLoc] = useState('')
  const nav = useNavigate()
  const { canEdit, isAdmin } = useAuth()
  const load = () => supabase.from('projects').select('*').neq('kind', 'concept').order('created_at', { ascending: false }).then(({ data }) => setList((data ?? []) as Project[]))
  useEffect(() => { load() }, [])
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('projects').insert({ name, location: loc || null }).select().single()
    if (error) return alert(error.message)
    nav(`/p/${data.id}/upload`)
  }
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const finish = async (p: Project) => {
    if (!confirm(`Hoàn tất dự án "${p.name}"?\n\n• Nén toàn bộ ảnh của dự án (cạnh dài ≤ 1200px) để giảm dung lượng kho.\n• KHÔNG xoá dữ liệu nào; vẫn mở xem được như cũ (ảnh nhẹ hơn, không khôi phục lại chất lượng gốc).\n• Tự sao lưu dữ liệu trước khi nén.\n• Có thể mất vài phút, đừng đóng trang.`)) return
    setBusy(p.id); setMsg('')
    try {
      const r = await finishProject(p, s => setMsg(s))
      toast(`✔ Đã hoàn tất: nén ${r.files} ảnh, ${(r.before / 1e6).toFixed(0)} MB → ${(r.after / 1e6).toFixed(0)} MB`, 'ok')
    } catch (e) { alert('Chưa hoàn tất được: ' + String((e as Error).message ?? e)) }
    setBusy(null); setMsg(''); load()
  }
  const reopen = async (p: Project) => { await reopenProject(p); load() }
  const remove = async (p: Project) => {
    if (!(await confirmDelete(`dự án "${p.name}"`))) return
    await supabase.from('projects').delete().eq('id', p.id); load()
  }
  return (
    <div className="page">
      <h1>Lập danh mục vật liệu</h1>
      {isAdmin && <form className="card row gap" onSubmit={create}>
        <input placeholder="Tên dự án, vd: BOH Khách sạn Waldorf Astoria" value={name} onChange={e => setName(e.target.value)} required style={{ flex: 2 }} />
        <input placeholder="Địa điểm" value={loc} onChange={e => setLoc(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary">+ Tạo dự án</button>
      </form>}
      <div className="grid-cards">
        {list.filter(p => !p.finished_at).map(p => (
          <div key={p.id} className="card project-card">
            <Link to={`/p/${p.id}/overview`}><h3>{p.name}</h3></Link>
            <div className="muted">{p.location}</div>
            <div className="row between"><span className="pill">{STATUS[p.status] ?? p.status}</span>
              {isAdmin && <span className="row gap">{busy === p.id ? <span className="small muted">{msg || 'Đang nén…'}</span> : <button className="btn ghost sm" disabled={!!busy} onClick={() => finish(p)}>✔ Hoàn tất</button>}
                <button className="btn ghost sm danger" disabled={!!busy} onClick={() => remove(p)}>Xoá</button></span>}</div>
          </div>
        ))}
        {!list.length && <p className="muted">Chưa có dự án. Tạo dự án rồi tải file concept PDF lên.</p>}
      </div>
      {list.some(p => p.finished_at) && <>
        <h2 style={{ marginTop: 24 }}>Dự án đã hoàn tất</h2>
        <p className="muted small">Ảnh đã được nén để tiết kiệm dung lượng; dữ liệu còn nguyên, vẫn mở xem được.</p>
        <div className="grid-cards">
          {list.filter(p => p.finished_at).map(p => (
            <div key={p.id} className="card project-card">
              <Link to={`/p/${p.id}/overview`}><h3>{p.name}</h3></Link>
              <div className="muted">{p.location}</div>
              <div className="row between"><span className="pill">✔ Hoàn tất {new Date(p.finished_at!).toLocaleDateString('vi-VN')}{p.finish_info ? ` · ${(p.finish_info.before / 1e6).toFixed(0)}→${(p.finish_info.after / 1e6).toFixed(0)} MB` : ''}</span>
                {isAdmin && <button className="btn ghost sm" onClick={() => reopen(p)}>Mở lại</button>}</div>
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}

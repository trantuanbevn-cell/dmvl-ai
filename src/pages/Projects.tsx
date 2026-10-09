import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { useAuth } from '../lib/auth'

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
  const remove = async (p: Project) => {
    if (!confirm(`Xoá dự án "${p.name}" và toàn bộ dữ liệu?`)) return
    await supabase.from('projects').delete().eq('id', p.id); load()
  }
  return (
    <div className="page">
      <h1>Lập danh mục vật liệu</h1>
      {canEdit && <form className="card row gap" onSubmit={create}>
        <input placeholder="Tên dự án, vd: BOH Khách sạn Waldorf Astoria" value={name} onChange={e => setName(e.target.value)} required style={{ flex: 2 }} />
        <input placeholder="Địa điểm" value={loc} onChange={e => setLoc(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary">+ Tạo dự án</button>
      </form>}
      <div className="grid-cards">
        {list.map(p => (
          <div key={p.id} className="card project-card">
            <Link to={`/p/${p.id}/overview`}><h3>{p.name}</h3></Link>
            <div className="muted">{p.location}</div>
            <div className="row between"><span className="pill">{STATUS[p.status] ?? p.status}</span>
              {isAdmin && <button className="btn ghost sm danger" onClick={() => remove(p)}>Xoá</button>}</div>
          </div>
        ))}
        {!list.length && <p className="muted">Chưa có dự án. Tạo dự án rồi tải file concept PDF lên.</p>}
      </div>
    </div>
  )
}

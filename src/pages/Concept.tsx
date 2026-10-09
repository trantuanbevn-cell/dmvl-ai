// Bước 1 của quy trình khép kín: DÀN TRANG CONCEPT (độc lập) → đẩy sang LẬP DANH MỤC → KHÁI TOÁN / DỰ TOÁN.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/useProject'
import FloorPlans from '../components/FloorPlans'
import ConceptSheet from '../components/ConceptSheet'

export function ConceptList() {
  const [list, setList] = useState<Project[]>([])
  const [name, setName] = useState(''), [loc, setLoc] = useState('')
  const nav = useNavigate()
  const { isAdmin } = useAuth()
  const load = () => supabase.from('projects').select('*').eq('kind', 'concept').order('created_at', { ascending: false }).then(({ data }) => setList((data ?? []) as Project[]))
  useEffect(() => { load() }, [])
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('projects').insert({ name, location: loc || null, kind: 'concept' }).select().single()
    if (error) return alert(error.message)
    nav(`/c/${data.id}`)
  }
  const remove = async (p: Project) => { if (!confirm(`Xoá bộ concept "${p.name}" và toàn bộ dữ liệu?`)) return; await supabase.from('projects').delete().eq('id', p.id); load() }
  return (
    <div className="page">
      <h1>Dàn trang concept</h1>
      <p className="muted small">Bước đầu của quy trình: dàn trang concept → đẩy thông tin sang <b>Lập danh mục</b> → khái toán / dự toán.</p>
      {isAdmin && <form className="card row gap" onSubmit={create}>
        <input placeholder="Tên bộ concept, vd: BOH Westin Hà Nội" value={name} onChange={e => setName(e.target.value)} required style={{ flex: 2 }} />
        <input placeholder="Địa điểm" value={loc} onChange={e => setLoc(e.target.value)} style={{ flex: 1 }} />
        <button className="btn primary">+ Tạo bộ concept</button>
      </form>}
      <div className="grid-cards">
        {list.map(p => (
          <div key={p.id} className="card project-card">
            <Link to={`/c/${p.id}`}><h3>{p.name}</h3></Link>
            <div className="muted">{p.location}</div>
            <div className="row between"><span className="pill">Dàn trang concept</span>{isAdmin && <button className="btn ghost sm danger" onClick={() => remove(p)}>Xoá</button>}</div>
          </div>))}
        {!list.length && <p className="muted">Chưa có bộ concept nào. Tạo mới rồi tải PDF mặt bằng AutoCAD (vector) lên.</p>}
      </div>
    </div>)
}

export function ConceptPage() {
  const { id = '' } = useParams()
  const d = useProject(id)
  if (!d.project) return <div className="page muted">{d.loading ? 'Đang tải…' : 'Không tìm thấy'}</div>
  return (
    <div className="page wide">
      <div className="proj-head"><div><div className="small muted"><Link to="/concept">← Dàn trang concept</Link></div><h1>{d.project.name}</h1><div className="muted small">{d.project.location}</div></div>
        <div className="muted small" style={{ maxWidth: 360, textAlign: 'right' }}>Sắp có: “Đưa sang lập danh mục” – dùng luôn tên phòng, diện tích, mặt bằng đã dàn ở đây.</div></div>
      <FloorPlans d={d} concept />
      <ConceptSheet d={d} />
    </div>)
}

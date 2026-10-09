// Bước 1 của quy trình khép kín: DÀN TRANG CONCEPT (độc lập) → đẩy sang LẬP DANH MỤC → KHÁI TOÁN / DỰ TOÁN.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/useProject'
import FloorPlans from '../components/FloorPlans'
import ConceptSheet from '../components/ConceptSheet'
import DeckEditor from '../components/DeckEditor'
import DeckPageSvg from '../components/DeckPageSvg'
import { useDeck } from '../lib/useDeck'
import { STYLES, newDeck } from '../lib/deck'
import { exportConcept, restoreConcept } from '../lib/conceptBackup'
import { PW, PH } from '../lib/sheetLayout'
import { toast } from '../lib/toast'

export function ConceptList() {
  const [list, setList] = useState<Project[]>([])
  const [name, setName] = useState(''), [loc, setLoc] = useState('')
  const nav = useNavigate()
  const [style, setStyle] = useState(STYLES[0].key), [busy, setBusy] = useState('')
  const { isAdmin } = useAuth()
  const load = () => supabase.from('projects').select('*').eq('kind', 'concept').order('created_at', { ascending: false }).then(({ data }) => setList((data ?? []) as Project[]))
  useEffect(() => { load() }, [])
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('projects').insert({ name, location: loc || null, kind: 'concept', deck: newDeck(style) }).select().single()
    if (error) return alert(error.message)
    nav(`/c/${data.id}`)
  }
  const remove = async (p: Project) => { if (!confirm(`Xoá bộ concept "${p.name}" và toàn bộ dữ liệu?`)) return; await supabase.from('projects').delete().eq('id', p.id); load() }
  return (
    <div className="page">
      <h1>Dàn trang concept</h1>
      <p className="muted small">Bước đầu của quy trình: dàn trang concept → đẩy thông tin sang <b>Lập danh mục</b> → khái toán / dự toán.</p>
      {isAdmin && <form className="card stack" onSubmit={create}>
        <h3 style={{ margin: 0 }}>1. Chọn style trình bày</h3>
        <div className="style-pick">{STYLES.map(st => <div key={st.key} className={'style-card' + (style === st.key ? ' on' : '')} onClick={() => setStyle(st.key)}>
          <svg viewBox={`0 0 ${PW} ${PH}`}><DeckPageSvg page={st.pages()[2]} theme={st.theme} project="" no={3} url={() => undefined} /></svg>
          <b>{st.name}</b><div className="small muted">{st.desc}</div></div>)}</div>
        <h3 style={{ margin: 0 }}>2. Đặt tên bộ concept</h3>
        <div className="row gap">
          <input placeholder="Tên bộ concept, vd: BOH Westin Hà Nội" value={name} onChange={e => setName(e.target.value)} required style={{ flex: 2 }} />
          <input placeholder="Địa điểm" value={loc} onChange={e => setLoc(e.target.value)} style={{ flex: 1 }} />
          <button className="btn primary">+ Tạo bộ concept</button>
        </div>
        <div className="small muted">Tạo xong là có sẵn khung các trang của style đã chọn – chỉ việc tải ảnh và sửa chữ.</div>
        <div className="row gap small"><label className="btn sm" style={{ cursor: 'pointer' }}>📂 Nạp bản sao từ máy<input type="file" accept=".json" hidden disabled={!!busy} onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setBusy('Đang nạp…'); const id = await restoreConcept(f, setBusy); nav(`/c/${id}`) } catch (er) { toast(String(er)) } setBusy('') }} /></label>{busy && <span className="muted"><span className="spinner" /> {busy}</span>}</div>
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
  const { deck, update } = useDeck(d)
  const [bk, setBk] = useState('')
  const backup = async () => { try { const { blob, name } = await exportConcept(d, setBk); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); toast('Đã lưu bản sao: ' + name) } catch (e) { toast(String(e)) } setBk('') }
  if (!d.project) return <div className="page muted">{d.loading ? 'Đang tải…' : 'Không tìm thấy'}</div>
  return (
    <div className="page wide">
      <div className="proj-head"><div><div className="small muted"><Link to="/concept">← Dàn trang concept</Link></div><h1>{d.project.name}</h1><div className="muted small">{d.project.location}</div></div>
        <div style={{ maxWidth: 380, textAlign: 'right' }}><button className="btn sm" disabled={!!bk} onClick={backup}>💾 Lưu bản sao về máy</button>{bk && <div className="small muted">{bk}</div>}
          <div className="muted small">Mỗi lần xong một phương án nên lưu bản sao; muốn quay lại thì “Nạp bản sao từ máy” ở danh sách concept. Sắp có: “Đưa sang lập danh mục”.</div></div></div>
      <DeckEditor d={d} deck={deck} update={update} />
      <FloorPlans d={d} concept />
      <ConceptSheet d={d} size={deck.size} />
    </div>)
}

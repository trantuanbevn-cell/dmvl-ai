import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { colorOf } from '../lib/presence'

type Row = { id: number; at: string; user_id: string | null; user_name: string | null; project_id: string | null; tbl: string; row_id: string | null; code: string | null; action: string; fields: string[] | null; detail: Record<string, [string, string]> | null }
const TBL: Record<string, string> = { entries: 'Mã vật liệu', rooms: 'Phòng', occurrences: 'Vị trí / hình' }
const ACT: Record<string, string> = { INSERT: 'thêm', UPDATE: 'sửa', DELETE: 'xoá' }
const FLD: Record<string, string> = { name_vn: 'Tên', name_en: 'Tên EN', part_vn: 'Bộ phận', part_en: 'Bộ phận EN', material_vn: 'Vật liệu', desc_vn: 'Mô tả', desc_en: 'Mô tả EN', perf_vn: 'Tính chất', note_vn: 'Ghi chú', status: 'Trạng thái', brand: 'Hãng', product_code: 'Mã SP', origin: 'Xuất xứ', group_code: 'Nhóm', category: 'Bề mặt', code: 'Mã', area: 'Diện tích', bbox: 'Vùng khoanh', view: 'Hình/mũi tên', note: 'Ghi chú hình', room_id: 'Phòng', page_id: 'Trang', color_hex: 'Màu', link_id: 'Liên kết' }
const when = (iso: string) => { const d = new Date(iso); return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) }

/** Nhật ký chỉnh sửa – chỉ admin xem (RLS): ai sửa gì ở đâu, cập nhật trực tiếp */
export default function EditLog({ projects }: { projects: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [who, setWho] = useState('')
  const [err, setErr] = useState('')
  const load = () => supabase.from('edit_log').select('*').order('id', { ascending: false }).limit(400).then(({ data, error }) => { if (error) setErr(error.message); else setRows(data as Row[]) })
  useEffect(() => {
    load()
    const ch = supabase.channel('editlog').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'edit_log' }, p => setRows(r => [p.new as Row, ...(r ?? [])].slice(0, 400))).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  const names = useMemo(() => [...new Set((rows ?? []).map(r => r.user_name).filter(Boolean) as string[])], [rows])
  const pname = (id: string | null) => projects.find(p => p.id === id)?.name ?? ''
  // gộp các dòng liên tiếp cùng người + cùng đối tượng để khỏi dài
  const list = useMemo(() => {
    const out: (Row & { n: number; allFields: string[] })[] = []
    for (const r of (rows ?? []).filter(x => !who || x.user_name === who)) {
      const p = out[out.length - 1]
      if (p && p.user_id === r.user_id && p.row_id === r.row_id && p.tbl === r.tbl && p.action === r.action && Math.abs(new Date(p.at).getTime() - new Date(r.at).getTime()) < 120000) { p.n++; p.allFields = [...new Set([...p.allFields, ...(r.fields ?? [])])]; continue }
      out.push({ ...r, n: 1, allFields: r.fields ?? [] })
    }
    return out
  }, [rows, who])
  if (err) return <div className="note warn">Nhật ký: {err}</div>
  return (
    <div className="card">
      <div className="row between"><h3 style={{ margin: 0 }}>Nhật ký chỉnh sửa <span className="small muted">(chỉ admin thấy · cập nhật trực tiếp)</span></h3>
        <select value={who} onChange={e => setWho(e.target.value)}><option value="">Tất cả mọi người</option>{names.map(n => <option key={n}>{n}</option>)}</select></div>
      {!rows ? <div className="muted small">Đang tải…</div> : !list.length ? <div className="muted small">Chưa có thay đổi nào được ghi.</div> :
        <table className="tbl"><thead><tr><th>Lúc</th><th>Ai</th><th>Làm gì</th><th>Ở đâu</th><th>Chi tiết</th></tr></thead>
          <tbody>{list.slice(0, 150).map(r => {
            const f = r.allFields.map(k => FLD[k] ?? k)
            const one = r.n === 1 && r.action === 'UPDATE' && r.detail && r.allFields.length === 1 ? r.detail[r.allFields[0]] : null
            return <tr key={r.id}>
              <td className="small">{when(r.at)}</td>
              <td className="small"><b style={{ color: colorOf(r.user_id ?? '') }}>{r.user_name ?? '?'}</b></td>
              <td className="small">{ACT[r.action] ?? r.action} {TBL[r.tbl] ?? r.tbl}{r.n > 1 ? ` (×${r.n})` : ''}</td>
              <td className="small">{r.code ?? ''} <span className="muted">{pname(r.project_id)}</span></td>
              <td className="small">{f.length ? f.join(', ') : ''}{one && <div className="muted" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{one[0] || '∅'}” → “{one[1] || '∅'}”</div>}</td>
            </tr>
          })}</tbody></table>}
    </div>
  )
}

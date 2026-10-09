import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { allSections, bandKeys, bandInfo, type NameOverrides } from '../lib/sections'
import type { ProjectData } from '../lib/useProject'
import { toast } from '../lib/toast'

/** Đổi tên các hạng mục (tab) và nhóm lớn A–D. Để trống = dùng tên mặc định. Áp dụng cho cả bảng, Excel và bản in của dự án. */
export default function SectionNames({ d, onClose }: { d: ProjectData; onClose: () => void }) {
  const [v, setV] = useState<NameOverrides>(() => JSON.parse(JSON.stringify(d.project?.section_names ?? {})))
  const [busy, setBusy] = useState(false)
  const set = (k: string, f: 'vn' | 'en', x: string) => setV(p => ({ ...p, [k]: { ...p[k], [f]: x } }))
  const rows: { k: string; vn: string; en: string; band?: boolean; custom?: boolean }[] = [
    ...bandKeys().map(b => ({ k: 'band:' + b, vn: bandInfo(b).vn, en: bandInfo(b).en, band: true })),
    ...allSections().map(s => ({ k: s.key, vn: s.vn, en: s.en, custom: s.custom })),
  ]
  const del = async (key: string) => {
    if (!d.project) return
    if (d.entries.some(e => e.section_key === key)) { alert('Nhóm này còn vật liệu – hãy chuyển hết vật liệu sang nhóm khác (cột “Hạng mục”) rồi xoá.'); return }
    if (!confirm('Xoá nhóm vật liệu này?')) return
    const list = (d.project.custom_sections ?? []).filter(c => c.key !== key)
    const names = { ...(d.project.section_names ?? {}) }; delete names[key]
    const { error } = await supabase.from('projects').update({ custom_sections: list.length ? list : null, section_names: Object.keys(names).length ? names : null }).eq('id', d.project.id)
    if (error) { alert(error.message); return }
    toast('Đã xoá nhóm'); d.reload(); onClose()
  }
  const save = async () => {
    if (!d.project) return
    setBusy(true)
    const clean: NameOverrides = {}
    for (const r of rows) { const o = v[r.k]; const vn = o?.vn?.trim(), en = o?.en?.trim(); if ((vn && vn !== r.vn) || (en && en !== r.en)) clean[r.k] = { ...(vn && vn !== r.vn ? { vn } : {}), ...(en && en !== r.en ? { en } : {}) } }
    const { error } = await supabase.from('projects').update({ section_names: Object.keys(clean).length ? clean : null }).eq('id', d.project.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    toast('Đã lưu tên hạng mục'); d.reload(); onClose()
  }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '85vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Đổi tên hạng mục</h3>
        <p className="small muted">Sửa tên tiếng Việt / tiếng Anh. Xoá trống ô để dùng lại tên mặc định. Tên mới dùng cho bảng, file Excel và bản in của dự án này.</p>
        <table className="tbl small" style={{ width: '100%' }}>
          <thead><tr><th>Tiếng Việt</th><th>English</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k} style={r.band ? { background: 'rgba(0,0,0,.05)' } : undefined}>
              <td><input style={{ width: '100%', fontWeight: r.band ? 700 : 400 }} placeholder={r.vn} value={v[r.k]?.vn ?? ''} onChange={e => set(r.k, 'vn', e.target.value)} /></td>
              <td><input style={{ width: '100%', fontWeight: r.band ? 700 : 400 }} placeholder={r.en} value={v[r.k]?.en ?? ''} onChange={e => set(r.k, 'en', e.target.value)} /></td>
              <td style={{ width: 90 }}>{r.custom && <button className="btn ghost sm danger" onClick={() => del(r.k)}>Xoá nhóm</button>}</td>
            </tr>))}</tbody>
        </table>
        <div className="row gap" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setV({})}>Đặt lại tất cả</button>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={busy} onClick={save}>Lưu</button>
        </div>
      </div>
    </div>
  )
}

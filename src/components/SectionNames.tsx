import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { allSections, bandKeys, bandInfo, type NameOverrides } from '../lib/sections'
import type { ProjectData } from '../lib/useProject'
import { PrefixPick } from './NewSection'
import { toast } from '../lib/toast'

/** Đổi tên các hạng mục (tab) và nhóm lớn A–D. Để trống = dùng tên mặc định. Áp dụng cho cả bảng, Excel và bản in của dự án. */
export default function SectionNames({ d, onClose }: { d: ProjectData; onClose: () => void }) {
  const [v, setV] = useState<NameOverrides>(() => JSON.parse(JSON.stringify(d.project?.section_names ?? {})))
  const [busy, setBusy] = useState(false)
  const [pfx, setPfx] = useState<Record<string, string>>(() => Object.fromEntries((d.project?.custom_sections ?? []).map(c => [c.key, c.group])))
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
    // đổi tiền tố của nhóm riêng: đổi nhóm mã + đánh lại mã của các vật liệu trong nhóm (nội dung giữ nguyên)
    const cs = d.project.custom_sections ?? [], changed = cs.filter(c => pfx[c.key] && pfx[c.key] !== c.group)
    if (cs.some(c => pfx[c.key] === '')) { setBusy(false); alert('Tiền tố mới chưa hợp lệ.'); return }
    let upd: typeof cs | null = null
    if (changed.length) {
      upd = cs.map(c => (pfx[c.key] ? { ...c, group: pfx[c.key] } : c))
      const { data: all, error: e0 } = await supabase.from('entries').select('id,code,group_code,section_key').eq('project_id', d.project.id)
      if (e0) { setBusy(false); alert(e0.message); return }
      const max = new Map<string, number>(); for (const e of all ?? []) { const m = /^([A-Z]+)-(\d+)/.exec(e.code); if (m) max.set(m[1], Math.max(max.get(m[1]) ?? 0, +m[2])) }
      for (const c of changed) for (const e of (all ?? []).filter(x => x.section_key === c.key).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))) {
        const g = pfx[c.key], n = (max.get(g) ?? 0) + 1; max.set(g, n)
        const { error: e1 } = await supabase.from('entries').update({ group_code: g, code: `${g}-${String(n).padStart(2, '0')}` }).eq('id', e.id)
        if (e1) { setBusy(false); alert(e1.message); return }
      }
    }
    const { error } = await supabase.from('projects').update({ section_names: Object.keys(clean).length ? clean : null, ...(upd ? { custom_sections: upd } : {}) }).eq('id', d.project.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    toast('Đã lưu tên hạng mục'); d.reload(); onClose()
  }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 1000, maxHeight: '85vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Đổi tên hạng mục</h3>
        <p className="small muted">Sửa tên tiếng Việt / tiếng Anh. Xoá trống ô để dùng lại tên mặc định. Tên mới dùng cho bảng, file Excel và bản in của dự án này.</p>
        <table className="tbl small" style={{ width: '100%' }}>
          <thead><tr><th>Tiếng Việt</th><th>English</th><th>Tiền tố ký hiệu (nhóm riêng)</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k} style={r.band ? { background: 'rgba(0,0,0,.05)' } : undefined}>
              <td><input style={{ width: '100%', fontWeight: r.band ? 700 : 400 }} placeholder={r.vn} value={v[r.k]?.vn ?? ''} onChange={e => set(r.k, 'vn', e.target.value)} /></td>
              <td><input style={{ width: '100%', fontWeight: r.band ? 700 : 400 }} placeholder={r.en} value={v[r.k]?.en ?? ''} onChange={e => set(r.k, 'en', e.target.value)} /></td>
              <td style={{ width: 240 }}>{r.custom && <PrefixPick value={pfx[r.k] ?? ''} onChange={x => setPfx(p => ({ ...p, [r.k]: x }))} ownKey={r.k} />}</td>
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

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { bandKeys, PREFIXES, bandTitle } from '../lib/sections'
import type { ProjectData } from '../lib/useProject'
import { toast } from '../lib/toast'

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
const DEF_GROUP: Record<string, string> = { A: 'PT', B: 'MT', C: 'FF', D: 'DC' }
const defGroup = (b: string) => DEF_GROUP[b] ?? 'FF'

/** Tạo thêm một nhóm vật liệu (hạng mục) mới cho dự án: có tên VN/EN, nằm trong một nhóm lớn A–D, và dùng một tiền tố ký hiệu có sẵn */
export default function NewSection({ d, onClose, onDone }: { d: ProjectData; onClose: () => void; onDone: (key: string) => void }) {
  const [vn, setVn] = useState(''), [en, setEn] = useState(''), [band, setBand] = useState(bandKeys().includes('B') ? 'B' : bandKeys()[0]), [group, setGroup] = useState(defGroup(bandKeys().includes('B') ? 'B' : bandKeys()[0])), [busy, setBusy] = useState(false)
  const save = async () => {
    if (!d.project || !vn.trim()) return
    setBusy(true)
    const key = `c_${slug(vn) || 'nhom'}_${Math.random().toString(36).slice(2, 6)}`
    const list = [...(d.project.custom_sections ?? []), { key, vn: vn.trim().toUpperCase(), en: (en.trim() || vn.trim()).toUpperCase(), band, group }]
    const { error } = await supabase.from('projects').update({ custom_sections: list }).eq('id', d.project.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    toast(`Đã tạo nhóm “${vn.trim()}”`, 'ok'); await d.reload(); onDone(key)
  }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>＋ Tạo nhóm vật liệu mới</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <p className="small muted">Nhóm mới xuất hiện cùng hàng với các nhóm khác, có trong bảng, file Excel và bản in của dự án này. Sau khi tạo, vào cột “Hạng mục” của một vật liệu để chuyển nó sang nhóm mới, hoặc bấm “＋ Thêm vật liệu” trong nhóm.</p>
        <div className="stack">
          <label className="fld">Tên nhóm (tiếng Việt)<input data-lang="name" autoFocus value={vn} onChange={e => setVn(e.target.value)} placeholder="vd: BIỂN HIỆU – LOGO" /></label>
          <label className="fld">Tên nhóm (English)<input data-lang="name" value={en} onChange={e => setEn(e.target.value)} placeholder="vd: SIGNAGE & LOGO (để trống = lấy tên Việt)" /></label>
          <label className="fld">Nằm trong nhóm lớn
            <select value={band} onChange={e => { setBand(e.target.value); setGroup(defGroup(e.target.value)) }}>{bandKeys().map(b => <option key={b} value={b}>{bandTitle(b, 'vn')}</option>)}</select></label>
          <label className="fld">Tiền tố ký hiệu của các mã trong nhóm
            <select value={group} onChange={e => setGroup(e.target.value)}>{PREFIXES.map(p => <option key={p.prefix} value={p.groups[0]}>{p.prefix} – {p.vn}</option>)}</select></label>
        </div>
        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={!vn.trim() || busy} onClick={save}>{busy ? 'Đang tạo…' : 'Tạo nhóm'}</button>
        </div>
      </div>
    </div>)
}

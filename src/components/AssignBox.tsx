import { useMemo, useState } from 'react'
import { CATEGORIES } from '../lib/codes'
import type { ProjectData } from '../lib/useProject'
import type { Entry } from '../lib/types'

/** Chọn vật liệu CÓ SẴN trong danh mục để gán cho vùng vừa khoanh trên ảnh phối cảnh. */
export default function AssignBox({ d, roomId, symLabel, onPick, onNew, onClose }: { d: ProjectData; roomId: string; symLabel: (e: Entry) => string; onPick: (e: Entry, category: string) => void; onNew: () => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')   // lọc/gán theo hạng mục (sàn, tường…); trống = theo mục gốc của vật liệu
  const inRoom = useMemo(() => new Set(d.occ.filter(o => o.room_id === roomId).map(o => o.entry_id)), [d.occ, roomId])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return d.entries.filter(e => e.status !== 'rejected').filter(e => !s || [symLabel(e), e.code, e.name_vn, e.name_en, e.material_vn, e.product_code, e.brand].some(v => String(v ?? '').toLowerCase().includes(s)))
      .sort((a, b) => Number(inRoom.has(b.id)) - Number(inRoom.has(a.id)) || a.group_code.localeCompare(b.group_code) || a.code.localeCompare(b.code, undefined, { numeric: true }))
  }, [d.entries, q, inRoom])
  return (
    <div className="modal-bg center" style={{ zIndex: 85 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 'min(760px, 96vw)', maxHeight: '88vh' }}>
        <div className="row between"><h3 style={{ margin: 0 }}>Gán vật liệu cho vùng vừa khoanh</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row gap">
          <input autoFocus placeholder="Tìm theo ký hiệu, tên, vật liệu, mã, hãng…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
          <select value={cat} onChange={e => setCat(e.target.value)} title="Vùng này thuộc hạng mục nào trong phòng">
            <option value="">Hạng mục: theo vật liệu</option>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.vn}</option>)}</select>
        </div>
        <div style={{ overflow: 'auto', maxHeight: '58vh', border: '1px solid #eee', borderRadius: 8 }}>
          {list.map(e => (
            <button key={e.id} className="row gap" style={{ width: '100%', textAlign: 'left', padding: '6px 10px', border: 0, borderBottom: '1px solid #f1ece6', background: 'transparent', cursor: 'pointer', alignItems: 'center' }} onClick={() => onPick(e, cat || e.category || 'decor')}>
              <span style={{ width: 36, height: 36, borderRadius: 6, background: e.color_hex || '#eee', backgroundImage: e.product_image_url ? `url(${e.product_image_url})` : undefined, backgroundSize: 'cover', flex: 'none', border: '1px solid #ddd' }} />
              <span style={{ flex: 1, minWidth: 0 }}><b>{symLabel(e)}</b> {e.name_vn}{inRoom.has(e.id) && <span className="pill" style={{ marginLeft: 6 }}>đã có trong phòng</span>}
                <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[e.material_vn, e.brand, e.product_code].filter(Boolean).join(' · ')}</div></span>
            </button>))}
          {!list.length && <div className="muted small" style={{ padding: 14 }}>Không thấy vật liệu nào khớp.</div>}
        </div>
        <div className="row between"><span className="small muted">Chọn một vật liệu để gán; phòng sẽ được ghi vào cột “Vị trí” của bảng danh mục.</span><button className="btn sm" onClick={onNew}>＋ Vật liệu chưa có trong danh mục…</button></div>
      </div>
    </div>)
}

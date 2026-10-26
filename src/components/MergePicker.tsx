import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Entry } from '../lib/types'
import type { ProjectData } from '../lib/useProject'

/** Chọn mã đích để gộp nhanh: tìm theo ký hiệu / tên / mã sản phẩm; mặc định hiện các mã cùng nhóm */
export default function MergePicker({ d, src, symMap, onPick, onClose }: { d: ProjectData; src: Entry; symMap: Map<string, string>; onPick: (tgt: Entry) => void; onClose: () => void }) {
  const [q, setQ] = useState(''), [all, setAll] = useState(false)
  const s = symMap.get(src.id) ?? src.code
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return d.entries.filter(e => e.id !== src.id && e.status !== 'rejected' && (all || e.group_code === src.group_code)
      && (!k || `${symMap.get(e.id) ?? ''} ${e.code} ${e.name_vn} ${e.product_code ?? ''} ${e.brand ?? ''}`.toLowerCase().includes(k)))
      .sort((a, b) => (symMap.get(a.id) ?? a.code).localeCompare(symMap.get(b.id) ?? b.code, undefined, { numeric: true })).slice(0, 80)
  }, [d.entries, src, q, all, symMap])
  return createPortal(
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(560px, 96vw)', maxHeight: '88vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>Gộp {s} vào mã nào?</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <p className="small muted" style={{ margin: '6px 0' }}>Toàn bộ phòng + ảnh phối cảnh của {s} chuyển sang mã đích; thông số giữ theo mã đích (ô còn trống được điền từ {s}).</p>
        <div className="row gap sm-gap"><input autoFocus style={{ flex: 1 }} placeholder="Gõ ký hiệu / tên / mã sản phẩm, vd LGT-16" value={q} onChange={e => setQ(e.target.value)} />
          <label className="small row gap sm-gap"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> mọi nhóm</label></div>
        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          {list.map(e => <button key={e.id} className="btn" style={{ textAlign: 'left' }} onClick={() => onPick(e)}><b>{symMap.get(e.id) ?? e.code}</b> · {e.name_vn}{e.product_code ? <span className="muted"> · {e.product_code}</span> : null}{e.brand ? <span className="muted"> · {e.brand}</span> : null}</button>)}
          {!list.length && <span className="muted small">Không có mã nào khớp.</span>}
        </div>
      </div>
    </div>, document.body)
}

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Entry } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import { symOf } from '../lib/sections'
import { planMerge, mergeQuick, undoMerge } from '../lib/quickMerge'
import { toast } from '../lib/toast'

/** Hộp xác nhận gộp nhanh: toàn bộ vị trí + phối cảnh của `src` được đưa sang `tgt` */
export default function QuickMergeDialog({ d, src, tgt, onClose }: { d: ProjectData; src: Entry; tgt: Entry; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const plan = planMerge(d.occ, src, tgt), s = symOf(d.entries, src), t = symOf(d.entries, tgt)
  const run = async (hard: boolean) => {
    if (hard && !confirm(`Xoá hẳn ${s} sau khi gộp vào ${t}? Không hoàn tác được.`)) return
    setBusy(true)
    try {
      const rec = await mergeQuick(d.occ, d.entries, src, tgt, hard)
      toast(`Đã gộp ${s} vào ${t}: chuyển ${plan.rooms} phòng, ${plan.crops} hình`, 'ok', hard || !rec ? undefined : { label: '↶ Hoàn tác', run: async () => { await undoMerge(rec); toast('Đã hoàn tác gộp', 'ok'); d.reload() } })
    } catch (er) { alert((er as Error).message) }
    setBusy(false); d.reload(); onClose()
  }
  const row = (e: Entry, sym: string) => <div style={{ flex: 1, padding: 8, background: '#faf6ef', borderRadius: 8, minWidth: 0 }}><b>{sym}</b><div className="small">{e.name_vn}</div><div className="small muted">{[e.material_vn, e.brand].filter(Boolean).join(' · ')}</div></div>
  return createPortal(
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(620px, 96vw)', maxHeight: '90vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>Gộp {s} vào {t}?</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row gap" style={{ margin: '10px 0', alignItems: 'stretch' }}>{row(src, s)}<div style={{ alignSelf: 'center', fontSize: 20 }}>→</div>{row(tgt, t)}</div>
        <ul className="small" style={{ margin: '0 0 8px 18px' }}>
          <li>Chuyển <b>{plan.rooms} phòng</b> (vị trí) và <b>{plan.crops} hình phối cảnh</b> của {s} sang {t}. Các bảng khác (theo phòng, tổng hợp, xuất file) tự đồng bộ theo.</li>
          <li>{plan.fill.length ? <>Ô còn trống của {t} được điền từ {s}: {plan.fill.join(', ')}. Ô đã có thông tin của {t} giữ nguyên.</> : <>Thông tin đã nhập của {t} giữ nguyên.</>}</li>
          <li>Các ký hiệu bản vẽ phía sau tự đánh lại số.</li>
        </ul>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={onClose}>Huỷ</button>
          <button className="btn" disabled={busy} title="Xoá hẳn mã cũ sau khi gộp" onClick={() => run(true)}>Gộp và xoá mã cũ</button>
          <button className="btn primary" disabled={busy} title="Mã cũ được ẩn, có thể hoàn tác ngay" onClick={() => run(false)}>{busy ? 'Đang gộp…' : 'Gộp (ẩn mã cũ, hoàn tác được)'}</button>
        </div>
      </div>
    </div>, document.body)
}

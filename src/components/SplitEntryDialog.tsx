import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Entry, Occurrence } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import { symOf } from '../lib/sections'
import { splitEntry, undoSplit } from '../lib/splitEntry'
import { toast } from '../lib/toast'
import OccCrop from './OccCrop'

/** Tách vật liệu: tích chọn các ảnh phối cảnh / phòng thuộc vật liệu MỚI, bấm Tách → tạo mã mới (chép nội dung), chuyển phòng + ảnh đã chọn sang đó */
export default function SplitEntryDialog({ d, src, onClose, onDone }: { d: ProjectData; src: Entry; onClose: () => void; onDone?: (newId: string) => void }) {
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [name, setName] = useState(src.name_vn)
  const [busy, setBusy] = useState(false)
  const rows = useMemo(() => d.occ.filter(o => o.entry_id === src.id), [d.occ, src.id])
  const rooms = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const o of rows) { const k = o.room_id ?? ''; m.set(k, [...(m.get(k) ?? []), o]) }
    return [...m.entries()].map(([rid, os]) => ({ rid, room: d.rooms.find(r => r.id === rid), os: [...os].sort((a, b) => Number(!!b.bbox) - Number(!!a.bbox)) }))
      .sort((a, b) => (a.room?.matrix_sort ?? a.room?.sort ?? 1e6) - (b.room?.matrix_sort ?? b.room?.sort ?? 1e6))
  }, [rows, d.rooms])
  const toggle = (ids: string[]) => setPick(p => { const n = new Set(p); const all = ids.every(i => n.has(i)); ids.forEach(i => (all ? n.delete(i) : n.add(i))); return n })
  const chosen = rows.filter(o => pick.has(o.id))
  const roomsLeft = rooms.filter(r => r.os.some(o => !pick.has(o.id))).length
  const run = async () => {
    if (!d.project) return
    setBusy(true)
    try {
      const rec = await splitEntry(d.project, d.occ, src, chosen, name)
      toast(`Đã tách ${chosen.length} mục sang mã mới ${rec.newEntry.code} “${rec.newEntry.name_vn}”`, 'ok', { label: '↶ Hoàn tác', run: async () => { await undoSplit(rec); toast('Đã hoàn tác tách', 'ok'); d.reload() } })
      await d.reload(); onDone?.(rec.newEntry.id); onClose()
    } catch (er) { alert((er as Error).message); setBusy(false) }
  }
  return createPortal(
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(900px, 96vw)', maxHeight: '92vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>⑂ Tách {symOf(d.entries, src)} “{src.name_vn}” thành 2 vật liệu</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <p className="small muted">Tích chọn các ảnh phối cảnh / phòng thuộc <b>vật liệu mới</b>. Phần không tích ở lại {symOf(d.entries, src)}. Mã mới chép nội dung từ mã này (thông số, hãng, mã vật liệu thành phần…), trừ link và ảnh mẫu sản phẩm để bạn gắn đúng mẫu sau. Hoàn tác được ngay sau khi tách.</p>
        <label className="fld">Tên vật liệu mới<input value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
          {rooms.map(({ rid, room, os }) => {
            const ids = os.map(o => o.id), on = ids.every(i => pick.has(i)), some = ids.some(i => pick.has(i))
            return <div key={rid || 'none'} className="card" style={{ padding: 8, outline: on ? '3px solid #c57542' : some ? '2px dashed #c57542' : undefined, cursor: 'pointer' }} onClick={() => toggle(ids)}>
              <label className="row gap sm-gap small" style={{ fontWeight: 600 }}><input type="checkbox" checked={on} readOnly /> {room ? `${room.code} ${room.name_vn}` : 'Không thuộc phòng'}</label>
              <div className="row gap sm-gap" style={{ flexWrap: 'wrap', marginTop: 6 }}>
                {os.map(o => o.bbox ? <span key={o.id} onClick={ev => { ev.stopPropagation(); toggle([o.id]) }} style={{ outline: pick.has(o.id) ? '3px solid #c57542' : '1px solid #ddd', borderRadius: 4, display: 'inline-block' }}><OccCrop d={d} o={o} height={130} maxWidth={210} /></span> : <span key={o.id} className="small muted">chưa có ảnh khoanh</span>)}
              </div>
            </div>
          })}
        </div>
        <div className="row gap" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <span className="small">{chosen.length ? <>Chuyển <b>{chosen.length}</b> mục sang mã mới; {symOf(d.entries, src)} còn lại <b>{roomsLeft}</b> phòng.</> : 'Chưa chọn mục nào.'}</span>
          <div className="row gap"><button className="btn" disabled={busy} onClick={onClose}>Huỷ</button><button className="btn primary" disabled={busy || !chosen.length || !name.trim() || roomsLeft === 0} title={roomsLeft === 0 ? 'Cần để lại ít nhất một phòng cho mã cũ – nếu muốn chuyển hết, hãy dùng Gộp/đổi tên' : undefined} onClick={run}>{busy ? 'Đang tách…' : '⑂ Tách thành vật liệu mới'}</button></div>
        </div>
      </div>
    </div>, document.body)
}

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectData } from '../lib/useProject'
import type { Room } from '../lib/types'
import { pageRects, splitRoom, suggestParts, type Part } from '../lib/roomSplit'
import { toast } from '../lib/toast'

/** Tách một phòng đang gom nhiều phòng: đặt tên từng phòng, chọn mỗi ảnh phối cảnh thuộc phòng nào */
export default function RoomSplit({ d, room, onClose }: { d: ProjectData; room: Room; onClose: () => void }) {
  const pages = d.pages.filter(p => p.room_id === room.id && (p.kind === 'render' || p.kind === 'plan'))
  const [parts, setParts] = useState<Part[]>(() => { const s = suggestParts(room, d.pages); return s.length >= 2 ? s : [{ name_vn: room.name_vn, name_en: room.name_en ?? '' }, { name_vn: '', name_en: '' }] })
  // mặc định: ô ảnh thứ i (trái → phải) thuộc phòng thứ i
  const [choice, setChoice] = useState<Record<string, number[]>>(() => Object.fromEntries(pages.map(p => { const n = Math.max(1, pageRects(p).length); return [p.id, Array.from({ length: n }, (_, i) => Math.min(i, 1)) ] })))
  const [busy, setBusy] = useState(false)
  const set = (i: number, k: keyof Part, v: string) => setParts(ps => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const pick = (pid: string, i: number, v: number) => setChoice(c => ({ ...c, [pid]: c[pid].map((x, j) => (j === i ? v : x)) }))
  const ok = parts.length >= 2 && parts.every(p => p.name_vn.trim())
  const go = async () => {
    if (!ok) return
    setBusy(true)
    try {
      const r = await splitRoom(d, room, parts.map(p => ({ name_vn: p.name_vn.trim(), name_en: p.name_en.trim() })), choice)
      toast(`Đã tách thành ${r.rooms} phòng, chia lại ${r.moved} vật liệu theo từng ảnh`, 'ok')
      await d.reload(); onClose()
    } catch (e) { alert(String((e as Error).message ?? e)) }
    setBusy(false)
  }
  const crop = (url: string | undefined, r: { x: number; y: number; w: number; h: number } | null, h = 110) => {
    const w = r ? h * (r.w / r.h) * 1.5 : h * 1.4
    return <div style={{ height: h, width: w, backgroundImage: url ? `url("${url}")` : undefined, backgroundRepeat: 'no-repeat', borderRadius: 6, border: '1px solid #ddd',
      backgroundSize: r ? `${100 / r.w}% ${100 / r.h}%` : 'cover', backgroundPosition: r ? `${r.w >= 1 ? 0 : (r.x / (1 - r.w)) * 100}% ${r.h >= 1 ? 0 : (r.y / (1 - r.h)) * 100}%` : 'center' }} />
  }
  return createPortal(
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(900px, 96vw)', maxHeight: '92vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>Tách phòng · {room.code} {room.name_vn}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <p className="small muted">Một slide concept đôi khi gồm nhiều phòng. Đặt tên từng phòng rồi chọn mỗi ảnh phối cảnh thuộc phòng nào. Vật liệu đã nhận diện được chia lại theo ảnh, không cần chạy lại AI; phòng mới sẽ có bảng vật liệu và mục chọn riêng.</p>
        <div className="stack">{parts.map((p, i) => (
          <div key={i} className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>
            <b style={{ width: 70 }}>{i === 0 ? room.code : 'Phòng mới'}</b>
            <input style={{ flex: 1, minWidth: 200 }} placeholder="Tên phòng (VN)" value={p.name_vn} onChange={e => set(i, 'name_vn', e.target.value)} />
            <input style={{ flex: 1, minWidth: 200 }} placeholder="Tên (EN)" value={p.name_en} onChange={e => set(i, 'name_en', e.target.value)} />
            {parts.length > 2 && i > 0 && <button className="btn ghost sm" onClick={() => { setParts(ps => ps.filter((_, j) => j !== i)); setChoice(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.map(x => (x === i ? 0 : x > i ? x - 1 : x))]))) }}>✕</button>}
          </div>))}
          <div><button className="btn sm" onClick={() => setParts(ps => [...ps, { name_vn: '', name_en: '' }])}>＋ Thêm phòng</button></div>
        </div>
        <h4 style={{ marginBottom: 4 }}>Mỗi ảnh thuộc phòng nào?</h4>
        {!pages.length && <p className="muted small">Phòng này chưa có trang phối cảnh – vẫn tách được tên, trang gán sau ở danh sách trang.</p>}
        {pages.map(pg => { const rs = pageRects(pg), url = d.urls[pg.image_path]; return (
          <div key={pg.id} className="row gap" style={{ flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #eee', alignItems: 'flex-start' }}>
            <div className="small"><b>Trang {pg.page_no}</b>{rs.length ? '' : ' (cả trang)'}</div>
            {(rs.length ? rs : [null]).map((r, i) => (
              <div key={i}>{crop(url, r)}
                <select value={choice[pg.id]?.[i] ?? 0} onChange={e => pick(pg.id, i, +e.target.value)}>{parts.map((p, j) => <option key={j} value={j}>{p.name_vn || `Phòng ${j + 1}`}</option>)}</select></div>))}
          </div>) })}
        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={!ok || busy} onClick={go}>{busy ? 'Đang tách…' : '✂ Tách phòng'}</button>
        </div>
      </div>
    </div>, document.body)
}

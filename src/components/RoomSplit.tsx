import { useEffect, useState } from 'react'
import { supabase, BUCKET } from '../lib/supabase'
import { renderRects, type Rect } from '../lib/renders'
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
  const [found, setFound] = useState<Record<string, Rect[]>>({})     // ô ảnh tự dò từ PDF cho trang chưa có dữ liệu ô ảnh
  const [detecting, setDetecting] = useState(false)
  const [drawing, setDrawing] = useState<string | null>(null)   // trang đang khoanh ảnh thủ công
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const setRects = (pid: string, rs: Rect[]) => {
    const sorted = [...rs].sort((a, b) => (Math.abs(a.x - b.x) > 0.05 ? a.x - b.x : a.y - b.y))
    setFound(f => ({ ...f, [pid]: sorted }))
    setChoice(c => ({ ...c, [pid]: sorted.length ? sorted.map((_, i) => Math.min(i, parts.length - 1)) : [0] }))
  }
  // Trang chỉ có 1 “ô” (chưa chạy phân tích mặt bằng) → tự dò các ô ảnh phối cảnh ngay từ file PDF để mỗi ảnh có ô chọn riêng
  useEffect(() => {
    const need = pages.filter(p => p.kind === 'render' && pageRects(p).length < 2)
    if (!need.length || !d.project?.pdf_path) return
    let dead = false
    ;(async () => {
      setDetecting(true)
      try {
        const blob = (await supabase.storage.from(BUCKET).download(d.project!.pdf_path!)).data
        if (!blob) return
        const m = await renderRects(await blob.arrayBuffer(), need.map(p => p.page_no))
        if (dead) return
        const f: Record<string, Rect[]> = {}
        for (const p of need) { const r = m.get(p.page_no) ?? []; if (r.length >= 2) f[p.id] = r }
        setFound(f)
        setChoice(c => { const n = { ...c }; for (const [id, r] of Object.entries(f)) n[id] = r.map((_, i) => Math.min(i, parts.length - 1)); return n })
      } catch { /* giữ nguyên: coi như 1 ảnh */ }
      if (!dead) setDetecting(false)
    })()
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const set = (i: number, k: keyof Part, v: string) => setParts(ps => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const pick = (pid: string, i: number, v: number) => setChoice(c => ({ ...c, [pid]: c[pid].map((x, j) => (j === i ? v : x)) }))
  const ok = parts.length >= 2 && parts.every(p => p.name_vn.trim())
  const go = async () => {
    if (!ok) return
    setBusy(true)
    try {
      const r = await splitRoom(d, room, parts.map(p => ({ name_vn: p.name_vn.trim(), name_en: p.name_en.trim() })), choice, found)
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
        {detecting && <p className="muted small">Đang dò các ô ảnh phối cảnh trong PDF…</p>}
        {!pages.length && <p className="muted small">Phòng này chưa có trang phối cảnh – vẫn tách được tên, trang gán sau ở danh sách trang.</p>}
        {pages.map(pg => { const rs = pageRects(pg, found), url = d.urls[pg.image_path]; return (
          <div key={pg.id} className="row gap" style={{ flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #eee', alignItems: 'flex-start' }}>
            <div className="small"><b>Trang {pg.page_no}</b>{rs.length ? '' : ' (cả trang)'}</div>
            {(rs.length ? rs : [null]).map((r, i) => (
              <div key={i}>{crop(url, r)}
                <select value={choice[pg.id]?.[i] ?? 0} onChange={e => pick(pg.id, i, +e.target.value)}>{parts.map((p, j) => <option key={j} value={j}>{p.name_vn || `Phòng ${j + 1}`}</option>)}</select></div>))}
            {pg.kind === 'render' && <div style={{ width: '100%' }}>
              <button className="btn sm" onClick={() => { setDrawing(drawing === pg.id ? null : pg.id); setDrag(null) }}>{drawing === pg.id ? '✓ Xong' : '✎ Tự khoanh các ảnh'}</button>
              {rs.length < 2 && <span className="small muted"> Chưa tự nhận ra các ảnh trong slide này – bấm để tự kéo khung quanh từng ảnh phối cảnh.</span>}
              {drawing === pg.id && url && <div style={{ marginTop: 6 }}>
                <div className="small muted">Kéo chuột tạo khung quanh từng ảnh phối cảnh (mỗi ảnh một khung). Bấm vào khung để xoá.</div>
                <div style={{ position: 'relative', maxWidth: 820, userSelect: 'none', cursor: 'crosshair', marginTop: 4 }}
                  onMouseDown={e => { const b = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height; setDrag({ x0: x, y0: y, x1: x, y1: y }) }}
                  onMouseMove={e => { if (!drag) return; const b = e.currentTarget.getBoundingClientRect(); setDrag({ ...drag, x1: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y1: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) }) }}
                  onMouseUp={() => { if (!drag) return; const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }; setDrag(null); if (r.w > 0.04 && r.h > 0.04) setRects(pg.id, [...(found[pg.id] ?? []), r]) }}
                  onMouseLeave={() => setDrag(null)}>
                  <img src={url} alt="" draggable={false} style={{ width: '100%', display: 'block', borderRadius: 6 }} />
                  {(found[pg.id] ?? []).map((r, i) => <div key={i} title="Bấm để xoá khung" onMouseDown={e => e.stopPropagation()} onClick={() => setRects(pg.id, (found[pg.id] ?? []).filter((_, j) => j !== i))}
                    style={{ position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, border: '3px solid #e53935', background: 'rgba(229,57,53,.12)', cursor: 'pointer', boxSizing: 'border-box' }}><b style={{ background: '#e53935', color: '#fff', padding: '0 6px', fontSize: 12 }}>{i + 1}</b></div>)}
                  {drag && <div style={{ position: 'absolute', left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%`, border: '2px dashed #e53935', pointerEvents: 'none' }} />}
                </div>
              </div>}
            </div>}
          </div>) })}
        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={!ok || busy} onClick={go}>{busy ? 'Đang tách…' : '✂ Tách phòng'}</button>
        </div>
      </div>
    </div>, document.body)
}

import { roomPages } from '../lib/roomPages'
import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/imageUpload'
import type { ProjectData } from '../lib/useProject'
import type { Entry } from '../lib/types'

/** Thêm hình ảnh phối cảnh cho một vật liệu: khoanh vùng trên trang concept, hoặc tải ảnh từ máy */
export default function AddShot({ d, entry, roomId, onClose }: { d: ProjectData; entry: Entry; roomId?: string | null; onClose: () => void }) {
  const myRooms = [...new Set(d.occ.filter(o => o.entry_id === entry.id && o.room_id).map(o => o.room_id!))]
  const [rid, setRid] = useState<string>(roomId ?? myRooms[0] ?? d.rooms[0]?.id ?? '')
  const [tab, setTab] = useState<'page' | 'file'>('page')
  const [pageId, setPageId] = useState<string>('')
  const [box, setBox] = useState<number[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const drag = useRef<{ x: number; y: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const pages = useMemo(() => roomPages(d.pages, rid).filter(p => p.kind === 'render' || p.kind === 'plan'), [d.pages, rid])
  const page = d.pages.find(p => p.id === pageId)
  const rel = (e: React.PointerEvent) => { const r = wrap.current!.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] }
  const down = (e: React.PointerEvent) => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); const [x, y] = rel(e); drag.current = { x, y }; setBox([x, y, 0, 0]) }
  const move = (e: React.PointerEvent) => { if (!drag.current) return; const [x, y] = rel(e), s = drag.current; setBox([Math.min(s.x, x), Math.min(s.y, y), Math.abs(x - s.x), Math.abs(y - s.y)]) }
  const up = () => { drag.current = null }
  const category = d.occ.find(o => o.entry_id === entry.id)?.category ?? entry.category ?? 'decor'
  const save = async () => {
    setBusy(true)
    try {
      if (tab === 'page') {
        if (!page || !box || box[2] < 0.01 || box[3] < 0.01) throw new Error('Hãy chọn trang và kéo chuột khoanh vùng vật liệu')
        const { error } = await supabase.from('occurrences').insert({ entry_id: entry.id, room_id: rid || null, page_id: page.id, category, origin: 'manual', note: note.trim() || null, bbox: box.map(v => +v.toFixed(4)) })
        if (error) throw new Error(error.message)
      } else {
        if (!file) throw new Error('Chưa chọn ảnh')
        const img = await uploadImage(file, `${d.project!.id}/crops/new-${entry.id}-${Date.now()}.jpg`)
        const { error } = await supabase.from('occurrences').insert({ entry_id: entry.id, room_id: rid || null, page_id: null, category, origin: 'manual', note: note.trim() || null, bbox: [0.32, 0.3, 0.36, 0.4], view: { img } })
        if (error) throw new Error(error.message)
      }
      await d.reload(); onClose()
    } catch (e: any) { alert(e.message) }
    setBusy(false)
  }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(900px, 96vw)', maxHeight: '94vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>Thêm hình phối cảnh cho {entry.code} {entry.name_vn}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>
          <label className="small">Phòng <select value={rid} onChange={e => { setRid(e.target.value); setPageId(''); setBox(null) }}><option value="">— không gán phòng —</option>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}</select></label>
          <button className={'chip' + (tab === 'page' ? ' on' : '')} onClick={() => setTab('page')}>Khoanh từ trang concept</button>
          <button className={'chip' + (tab === 'file' ? ' on' : '')} onClick={() => setTab('file')}>Tải ảnh từ máy</button>
        </div>
        {tab === 'page' ? <>
          <div className="small muted">Chọn trang của phòng, rồi kéo chuột khoanh vùng có vật liệu này.</div>
          <div className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>{pages.map(p => <img key={p.id} src={d.urls[p.thumb_path ?? p.image_path]} alt="" onClick={() => { setPageId(p.id); setBox(null) }} style={{ height: 70, borderRadius: 6, cursor: 'pointer', outline: p.id === pageId ? '3px solid #c57542' : '1px solid #ddd' }} />)}{!pages.length && <span className="muted small">Phòng này chưa có trang concept.</span>}</div>
          {page && <div ref={wrap} className="img-wrap drawing" style={{ touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            <img src={d.urls[page.image_path]} alt="" draggable={false} />
            {box && <div style={{ position: 'absolute', left: box[0] * 100 + '%', top: box[1] * 100 + '%', width: box[2] * 100 + '%', height: box[3] * 100 + '%', border: '2px solid #e5322d', background: 'rgba(229,50,45,.12)', pointerEvents: 'none' }} />}
          </div>}
        </> : <label className="fld">Ảnh phối cảnh / ảnh minh hoạ<input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
        <label className="small">Ghi chú hình (tuỳ chọn) – vd khi hình đang khoanh vật liệu cũ đã đổi: <input style={{ width: '100%' }} value={note} placeholder="Phối cảnh gốc dùng thảm – đã đổi sang sàn vinyl" onChange={e => setNote(e.target.value)} /></label>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Huỷ</button><button className="btn primary" disabled={busy} onClick={save}>Lưu hình</button></div>
      </div>
    </div>
  )
}

import { roomPages } from '../lib/roomPages'
import { symOf } from '../lib/sections'
import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/imageUpload'
import type { ProjectData } from '../lib/useProject'
import type { Entry, Room } from '../lib/types'
import { floorLabel, floorRank } from '../lib/roomMatrix'
import FloorInput from './FloorInput'
import { heroStyle } from '../lib/progress'

/** Thêm hình ảnh phối cảnh cho một vật liệu: khoanh vùng trên trang concept, hoặc tải ảnh từ máy */
export default function AddShot({ d, entry, roomId, onClose }: { d: ProjectData; entry: Entry; roomId?: string | null; onClose: () => void }) {
  const myRooms = [...new Set(d.occ.filter(o => o.entry_id === entry.id && o.room_id).map(o => o.room_id!))]
  const [rid, setRid] = useState<string>(roomId ?? myRooms[0] ?? '')
  const [gallery, setGallery] = useState(!(roomId ?? myRooms[0])), [fl, setFl] = useState<string>('all'), [q, setQ] = useState('')
  const shotRooms = useMemo(() => new Set(d.occ.filter(o => o.entry_id === entry.id && o.room_id && (o.bbox || o.view?.img)).map(o => o.room_id!)), [d.occ, entry.id])
  const roomsSorted = useMemo(() => [...d.rooms].sort((a, b) => floorRank(a.floor) - floorRank(b.floor) || (a.matrix_sort ?? 1e6 + (a.sort ?? 0)) - (b.matrix_sort ?? 1e6 + (b.sort ?? 0))), [d.rooms])
  const floorsHave = useMemo(() => { const c = new Map<string, number>(); for (const r of d.rooms) { const k = r.floor ?? ''; c.set(k, (c.get(k) ?? 0) + 1) } return [...c.entries()].sort((a, b) => floorRank(a[0] || null) - floorRank(b[0] || null)) }, [d.rooms])
  const shownRooms = roomsSorted.filter(r => (fl === 'all' || (r.floor ?? '') === fl) && (!q.trim() || `${r.code} ${r.name_vn} ${r.name_en ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const renderOf = (r: Room) => roomPages(d.pages, r.id).filter(p => p.kind === 'render' || p.kind === 'plan').sort((a, b) => (a.kind === 'render' ? 0 : 1) - (b.kind === 'render' ? 0 : 1))
  const [tab, setTab] = useState<'page' | 'file'>('page')
  const [pageId, setPageId] = useState<string>('')
  const [box, setBox] = useState<number[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const drag = useRef<{ x: number; y: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const pages = useMemo(() => roomPages(d.pages, rid).filter(p => p.kind === 'render' || p.kind === 'plan'), [d.pages, rid])
  const page = d.pages.find(p => p.id === (pageId || (pages.find(x => x.kind === 'render') ?? pages[0])?.id))
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
        <div className="row between"><h3 style={{ margin: 0 }}>Thêm hình phối cảnh cho {symOf(d.entries, entry)} {entry.name_vn}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>
          <span className="small">Phòng: <b>{d.rooms.find(r => r.id === rid) ? `${d.rooms.find(r => r.id === rid)!.code} ${d.rooms.find(r => r.id === rid)!.name_vn}` : 'chưa chọn'}</b>{d.rooms.find(r => r.id === rid)?.floor ? <span className="muted"> · {floorLabel(d.rooms.find(r => r.id === rid)!.floor)}</span> : null}</span>
          <button className="btn sm" onClick={() => setGallery(g => !g)}>{gallery ? 'Ẩn danh sách phòng' : '🗂 Chọn / đổi phòng'}</button>
          <button className={'chip' + (tab === 'page' ? ' on' : '')} onClick={() => setTab('page')}>Khoanh từ trang concept</button>
          <button className={'chip' + (tab === 'file' ? ' on' : '')} onClick={() => setTab('file')}>Tải ảnh từ máy</button>
        </div>
        {gallery && <div className="card" style={{ padding: 8 }}>
          <div className="row gap sm-gap" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={'chip' + (fl === 'all' ? ' on' : '')} onClick={() => setFl('all')}>Tất cả ({d.rooms.length})</span>
            {floorsHave.map(([k, n]) => <span key={k} className={'chip' + (fl === k ? ' on' : '')} onClick={() => setFl(k)}>{floorLabel(k || null)} ({n})</span>)}
            <input placeholder="Tìm phòng…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 160 }} />
            <span className="small muted">Bấm vào ảnh phòng để chọn, rồi khoanh trực tiếp bên dưới. Phòng chưa có tầng: gán ngay ở ô chọn tầng dưới mỗi ảnh.</span>
          </div>
          <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 8, maxHeight: 260, overflow: 'auto' }}>
            {shownRooms.map(r => {
              const pg = renderOf(r)[0], st = heroStyle(d, pg, r.id, 16 / 9), on = r.id === rid
              return <div key={r.id} className="card" style={{ padding: 5, cursor: 'pointer', outline: on ? '3px solid #c57542' : undefined, opacity: pg ? 1 : 0.55 }} onClick={() => { setRid(r.id); setPageId(''); setBox(null); setTab('page'); setGallery(false) }}>
                <div style={{ aspectRatio: '16/9', borderRadius: 6, background: '#eee', backgroundSize: 'cover', backgroundPosition: 'center', ...(st ?? {}) }} />
                <div className="small" style={{ fontWeight: 600, marginTop: 3 }}>{r.code} {r.name_vn}</div>
                <div className="small muted">{pg ? `${renderOf(r).length} trang` : 'chưa có trang'}{shotRooms.has(r.id) ? ' · ✓ đã khoanh' : ''}</div>
                <div style={{ marginTop: 2 }} title="Gán tầng cho phòng này (gõ tự do, dùng chung cho Tổng hợp phòng)"><FloorInput id={'as' + r.id} value={r.floor} used={d.rooms.map(x => x.floor)} onCommit={async v => { const { error } = await supabase.from('rooms').update({ floor: v }).eq('id', r.id); if (error) alert(error.message); else d.reload() }} placeholder="Chưa gán tầng" /></div>
              </div>
            })}
            {!shownRooms.length && <span className="muted small">Không có phòng nào khớp.</span>}
          </div>
        </div>}
        {tab === 'page' ? <>
          <div className="small muted">Chọn trang của phòng, rồi kéo chuột khoanh vùng có vật liệu này.</div>
          <div className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>{pages.map(p => <img key={p.id} src={d.urls[p.thumb_path ?? p.image_path]} alt="" onClick={() => { setPageId(p.id); setBox(null) }} style={{ height: 70, borderRadius: 6, cursor: 'pointer', outline: p.id === page?.id ? '3px solid #c57542' : '1px solid #ddd' }} />)}{!pages.length && <span className="muted small">Phòng này chưa có trang concept.</span>}</div>
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

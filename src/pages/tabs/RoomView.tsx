import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CATEGORIES, GROUPS, roomTypeLabel } from '../../lib/codes'
import { addManualEntry } from '../../lib/pipeline'
import { clampBox } from '../../lib/crop'
import type { ProjectData } from '../../lib/useProject'
import type { Entry, Occurrence } from '../../lib/types'
import Crop from '../../components/Crop'
import EntryPanel from '../../components/EntryPanel'
import { StatusDot } from './MaterialView'

export default function RoomView({ d }: { d: ProjectData }) {
  const [sp, setSp] = useSearchParams()
  const roomId = sp.get('room') ?? d.rooms[0]?.id
  const room = d.rooms.find(r => r.id === roomId)
  const [sel, setSel] = useState<string | null>(null) // entry id
  const [selOcc, setSelOcc] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [draw, setDraw] = useState(false)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [add, setAdd] = useState({ group: 'DC', name: '', category: 'decor' })
  const imgRef = useRef<HTMLDivElement>(null)

  const pages = d.pages.filter(p => p.room_id === roomId && (p.kind === 'render' || p.kind === 'plan'))
  const page = pages[Math.min(pageIdx, pages.length - 1)]
  const occ = d.occ.filter(o => o.room_id === roomId)
  const entryById = useMemo(() => new Map(d.entries.map(e => [e.id, e])), [d.entries])
  const pageById = useMemo(() => new Map(d.pages.map(p => [p.id, p])), [d.pages])
  const selEntry = sel ? entryById.get(sel) : undefined

  const byCat = CATEGORIES.map(c => ({ c, rows: occ.filter(o => (o.category ?? entryById.get(o.entry_id)?.category) === c.key) })).filter(x => x.rows.length)

  const pick = (o: Occurrence) => {
    setSel(o.entry_id); setSelOcc(o.id)
    const i = pages.findIndex(p => p.id === o.page_id); if (i >= 0) setPageIdx(i)
  }
  const rel = (ev: React.MouseEvent) => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height }
  }
  const finishDraw = async () => {
    if (!drag || !selOcc || !page) return
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0)
    setDrag(null); setDraw(false)
    if (w < 0.01 || h < 0.01) return
    await supabase.from('occurrences').update({ bbox: [x, y, w, h], page_id: page.id }).eq('id', selOcc)
    d.reload()
  }
  const approveAll = async () => {
    const ids = [...new Set(occ.map(o => o.entry_id))].filter(id => entryById.get(id)?.status === 'pending' && entryById.get(id)?.source === 'image')
    if (!ids.length || !confirm(`Xác nhận ${ids.length} hạng mục nhìn thấy trong ảnh của phòng này? (dòng suy luận vẫn để chờ duyệt)`)) return
    await supabase.from('entries').update({ status: 'approved' }).in('id', ids); d.reload()
  }
  const addItem = async () => {
    if (!room || !add.name) return
    const e = await addManualEntry(d.project!, room, add.group, add.name, add.category)
    setAdd({ ...add, name: '' }); await d.reload(); setSel(e.id)
  }
  const removeOcc = async (o: Occurrence) => { if (confirm('Bỏ hạng mục này khỏi phòng?')) { await supabase.from('occurrences').delete().eq('id', o.id); d.reload() } }

  if (!d.rooms.length) return <div className="card muted">Chưa có phòng. Hãy tải concept ở bước 1.</div>

  return (
    <div className={'room-layout' + (selEntry ? ' with-panel' : '')}>
      <div className="room-list">
        {d.rooms.map(r => {
          const n = new Set(d.occ.filter(o => o.room_id === r.id).map(o => o.entry_id))
          const pend = [...n].filter(id => entryById.get(id)?.status === 'pending').length
          return (
            <button key={r.id} className={'room-btn' + (r.id === roomId ? ' on' : '')} onClick={() => { setSp({ room: r.id }); setPageIdx(0); setSel(null) }}>
              <b>{r.code}</b> {r.name_vn}<br /><span className="small muted">{roomTypeLabel(r.room_type)} · {n.size} mục{pend ? ` · ${pend} chờ` : ''}</span>
            </button>)
        })}
      </div>

      <div className="room-main">
        {page ? (
          <div className="viewer">
            <div className="row between">
              <div className="row gap sm-gap">{pages.map((p, i) => <button key={p.id} className={'btn sm' + (i === pageIdx ? ' primary' : '')} onClick={() => setPageIdx(i)}>Tr.{p.page_no} {p.kind === 'plan' ? '(MB)' : ''}</button>)}</div>
              <div className="row gap sm-gap">
                {selOcc && <button className={'btn sm' + (draw ? ' primary' : '')} onClick={() => setDraw(!draw)}>{draw ? 'Kéo chuột trên ảnh để khoanh…' : '✎ Khoanh lại vùng cho mục đang chọn'}</button>}
              </div>
            </div>
            <div ref={imgRef} className={'img-wrap' + (draw ? ' drawing' : '')}
              onMouseDown={e => { if (draw) { const p = rel(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }) } }}
              onMouseMove={e => { if (draw && drag) { const p = rel(e); setDrag({ ...drag, x1: p.x, y1: p.y }) } }}
              onMouseUp={finishDraw}>
              <img src={d.urls[page.image_path]} alt="" draggable={false} />
              <svg viewBox="0 0 1 1" preserveAspectRatio="none">
                {occ.filter(o => o.page_id === page.id && o.bbox).map(o => {
                  const [x, y, w, h] = clampBox(o.bbox!)
                  const e = entryById.get(o.entry_id)
                  const on = o.entry_id === sel
                  return <g key={o.id} onClick={() => !draw && pick(o)} className={'bb' + (on ? ' on' : '') + (e?.source === 'inferred' ? ' inf' : '')}>
                    <rect x={x} y={y} width={w} height={h} vectorEffect="non-scaling-stroke" />
                  </g>
                })}
                {drag && <rect className="drag" x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} vectorEffect="non-scaling-stroke" />}
              </svg>
              {occ.filter(o => o.page_id === page.id && o.bbox).map(o => {
                const [x, y] = clampBox(o.bbox!); const e = entryById.get(o.entry_id)
                return <span key={o.id} className={'bb-label' + (o.entry_id === sel ? ' on' : '')} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} onClick={() => !draw && pick(o)}>{e?.code}</span>
              })}
            </div>
          </div>
        ) : <div className="card muted">Phòng chưa có trang phối cảnh.</div>}

        <div className="card">
          <div className="row between">
            <h3>{room?.code} {room?.name_vn} – {new Set(occ.map(o => o.entry_id)).size} hạng mục</h3>
            <button className="btn sm" onClick={approveAll}>✓ Xác nhận tất cả mục nhìn thấy</button>
          </div>
          {room?.concept_counts?.length ? <p className="small muted">Số liệu concept: {room.concept_counts.map(c => `${c.label}: ${c.qty}`).join(' · ')}</p> : null}
          {d.warnings.filter(w => w.room_id === roomId).map(w => <div key={w.id} className="warnline">⚠ {w.text}</div>)}
          {byCat.map(({ c, rows }) => (
            <div key={c.key} className="cat-block">
              <div className="cat-title">{c.vn} <span className="muted">/ {c.en}</span></div>
              <table className="tbl items">
                <tbody>{rows.map(o => {
                  const e = entryById.get(o.entry_id) as Entry | undefined; if (!e) return null
                  const pg = o.page_id ? pageById.get(o.page_id) : undefined
                  return (
                    <tr key={o.id} className={(e.id === sel ? 'sel ' : '') + 'src-row-' + e.source} onClick={() => pick(o)}>
                      <td style={{ width: 120 }}><Crop url={pg ? d.urls[pg.image_path] : undefined} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} height={56} maxWidth={110} /></td>
                      <td style={{ width: 70 }}><b className="code">{e.code}</b></td>
                      <td><b>{e.name_vn}</b><div className="small muted">{e.material_vn}</div>{e.composition && <div className="small">Cấu tạo: {e.composition}</div>}</td>
                      <td className="small" style={{ width: 150 }}>{e.brand ? `${e.brand} · ${e.product_code ?? ''}` : <span className="muted">chưa chọn mã</span>}</td>
                      <td className="small" style={{ width: 110 }}>{o.qty ?? e.qty ?? ''} {e.unit ?? ''} {e.qty_flag !== 'ok' && <span className="warn-text" title={e.qty_note ?? ''}>⚠</span>}</td>
                      <td style={{ width: 90 }}><span className={'src src-' + e.source}>{e.source === 'image' ? 'Ảnh' : e.source === 'inferred' ? 'Suy luận' : 'Tay'}</span></td>
                      <td style={{ width: 30 }}><StatusDot s={e.status} /></td>
                      <td style={{ width: 30 }}><button className="btn ghost sm" title="Bỏ khỏi phòng" onClick={ev => { ev.stopPropagation(); removeOcc(o) }}>✕</button></td>
                    </tr>)
                })}</tbody>
              </table>
            </div>
          ))}
          <div className="row gap add-row">
            <select value={add.category} onChange={e => setAdd({ ...add, category: e.target.value })}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.vn}</option>)}</select>
            <select value={add.group} onChange={e => setAdd({ ...add, group: e.target.value })}>{GROUPS.map(g => <option key={g.code} value={g.code}>{g.code} – {g.vn}</option>)}</select>
            <input placeholder="Thêm hạng mục bị thiếu, vd: Ghế băng thay đồ" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} style={{ flex: 1 }} />
            <button className="btn primary sm" onClick={addItem}>+ Thêm</button>
          </div>
        </div>
      </div>

      {selEntry && <EntryPanel d={d} entry={selEntry} onClose={() => { setSel(null); setSelOcc(null) }} />}
    </div>
  )
}

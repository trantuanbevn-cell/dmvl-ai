// Tổng hợp phòng: ma trận Phòng × Hạng mục. Nhìn là biết phòng nào đủ / thiếu gì / chưa có phối cảnh; sửa ngay tại đây – các tab khác tự cập nhật.
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ProjectData } from '../../lib/useProject'
import type { Entry, Room } from '../../lib/types'
import { CATEGORIES, ROOM_TYPES, roomTypeLabel } from '../../lib/codes'
import { symbolMap } from '../../lib/sections'
import { useAuth } from '../../lib/auth'
import { missingPairs, locateMissingShots } from '../../lib/locateShots'
import RoomSections from '../../components/RoomSections'
import OccCrop from '../../components/OccCrop'
import { toast } from '../../lib/toast'
import { buildMatrix, copyCells, addToCell, removeFromCell, moveToRoom, moveToCategory, shotsIn, createRoom, updateRoom, moveRoomRow, deleteRoom, renumberRooms, cellTree, FLOORS, floorLabel, type Row } from '../../lib/roomMatrix'

type Filter = 'all' | 'missing' | 'norender' | 'none'
const catVn = (k: string) => CATEGORIES.find(c => c.key === k)?.vn ?? k

export default function MatrixTab({ d }: { d: ProjectData }) {
  const { canEdit, isAdmin } = useAuth()
  const [locating, setLocating] = useState<string | null>(null)
  const rows = useMemo(() => buildMatrix(d), [d.rooms, d.occ, d.entries, d.pages])
  const sym = useMemo(() => symbolMap(d.entries), [d.entries])
  const [flt, setFlt] = useState<Filter>('all')
  const [cell, setCell] = useState<{ roomId: string; cat: string } | null>(null)
  const [chk, setChk] = useState<{ roomId: string; cat: string; id: string } | null>(null)
  const [copy, setCopy] = useState<{ from?: string; to: string; cats?: string[]; fixedCat?: string } | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [zoom, setZoom] = useState<Room | null>(null)
  const run = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); await d.reload(); if (ok) toast(ok, 'ok') } catch (e) { alert(String((e as Error).message ?? e)) } }

  const live = rows.filter(r => r.state !== 'none')
  const full = live.filter(r => !r.missing.length && r.total > 0).length
  const cnt = { all: rows.length, missing: live.filter(r => r.missing.length).length, norender: rows.filter(r => r.state === 'norender').length, none: rows.filter(r => r.state === 'none').length }
  const shown = rows.filter(r => flt === 'all' ? true : flt === 'missing' ? r.state !== 'none' && r.missing.length > 0 : r.state === flt)
  const hasPlans = rows.some(r => r.room.plan_img)
  const imgSrc = (r: Room) => `${import.meta.env.BASE_URL}${r.plan_img}`
  const hasFloors = rows.some(r => r.room.floor)
  const cats = CATEGORIES.filter(c => rows.some(r => r.cells.get(c.key)?.length) || rows.some(r => r.need.includes(c.key)))

  // số R luôn liền mạch R01…Rn đúng thứ tự đang hiển thị (chỉ đổi chữ mã, không đổi dữ liệu); tự chỉnh khi lệch (vd sau khi thêm/xoá/đổi tầng ở nơi khác)
  const codesOff = rows.some((r, i) => r.room.code !== 'R' + String(i + 1).padStart(2, '0'))
  useEffect(() => { if (canEdit && codesOff && d.project && !d.loading) renumberRooms(d.project.id).then(() => d.reload()).catch(() => {}) }, [canEdit, codesOff, d.project?.id])  // eslint-disable-line react-hooks/exhaustive-deps
  const delRoom = (r: Row) => {
    const n = d.occ.filter(o => o.room_id === r.room.id), shots = n.filter(o => o.page_id || o.view).length
    const only = r.cells.size ? [...r.cells.values()].flat().filter(e => !d.occ.some(o => o.entry_id === e.id && o.room_id && o.room_id !== r.room.id)).length : 0
    if (!confirm(`Xoá phòng ${r.room.code} ${r.room.name_vn}?\n\n• ${r.total} mã vật liệu bị bỏ khỏi phòng này${shots ? `, kèm ${shots} ảnh khoanh` : ''}${only ? `\n• ${only} mã chỉ nằm ở phòng này sẽ thành "chưa gán phòng" (vẫn giữ trong danh mục)` : ''}\n• Các trang concept của phòng chỉ bị bỏ gán phòng\n\nCó thể hoàn tác bằng nút ↶ ở đầu trang.`)) return
    run(() => deleteRoom(r.room.id), `Đã xoá phòng ${r.room.code}`)
  }
  const onDrop = (e: React.DragEvent, toRoom: string, toCat: string | null) => {
    e.preventDefault(); if (!canEdit) return
    const chip = e.dataTransfer.getData('application/x-mx-chip')
    if (chip) {   // kéo 1 mã (kèm thành phần con ẩn) sang cột khác trong CÙNG hàng
      let c: { room: string; cat: string; id: string }; try { c = JSON.parse(chip) } catch { return }
      if (!toCat || c.cat === toCat) return
      if (c.room !== toRoom) { toast('Chỉ kéo được trong cùng một hàng (cùng phòng). Muốn sang phòng khác: bấm mã → Chuyển sang phòng…'); return }
      const row = rows.find(r => r.room.id === c.room); const es = row?.cells.get(c.cat) ?? []; const top = es.find(x => x.id === c.id); if (!row || !top) return
      const group = [top, ...(cellTree(es, x => sym.get(x.id) ?? x.code).kids.get(top.id) ?? [])]
      run(async () => { for (const g of group) await moveToCategory(d, c.room, g, c.cat, toCat) }, `Đã chuyển ${sym.get(top.id) ?? top.code} sang “${catVn(toCat)}”`)
      return
    }
    const mv = e.dataTransfer.getData('application/x-mx-row')
    if (mv) { if (mv !== toRoom) run(() => moveRoomRow(rows, mv, rows.findIndex(r => r.room.id === toRoom))); return }
    let src: { room: string; cat: string | null }; try { src = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
    if (!src?.room || src.room === toRoom) return
    if (src.cat && toCat && src.cat !== toCat) { toast(`Chỉ kéo sang đúng cột “${catVn(src.cat)}”.`); return }
    const cat = src.cat ?? toCat
    setCopy({ from: src.room, to: toRoom, cats: cat ? [cat] : undefined, fixedCat: cat ?? undefined })
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div><h3 style={{ margin: 0 }}>Tổng hợp phòng – vật liệu theo phòng</h3><div className="small muted">{rows.length} phòng · <b>{full}</b> phòng đủ hạng mục chính · <b style={{ color: '#b45309' }}>{cnt.missing}</b> còn thiếu · {cnt.norender} chưa có phối cảnh · {cnt.none} không có</div></div>
          <button className="btn primary" disabled={!canEdit} onClick={() => setAdding(true)}>＋ Thêm phòng</button>
          {isAdmin && <button className="btn" disabled={!!locating} title="AI chỉ bổ sung ảnh khoanh còn thiếu vào các vị trí ĐÃ CÓ (không tạo mới, không đổi/xoá gì, không chắc thì bỏ qua; tự sao lưu trước)" onClick={async () => {
            const n = missingPairs(d).length
            if (!n) return toast('Không còn vật liệu nào thiếu ảnh ở các phòng đã có phối cảnh.')
            if (!confirm(`AI sẽ bổ sung ảnh khoanh cho tối đa ${n} vật liệu (các phòng đã có phối cảnh).\n• Chỉ thêm ảnh vào vị trí ĐÃ CÓ; không tạo mã/vị trí mới, không đổi hay xoá gì.\n• Không chắc thì bỏ qua.\n• Tự sao lưu trước khi chạy; có thể khôi phục ở mục Sao lưu.`)) return
            try { const rep = await locateMissingShots(d, {}, m => setLocating(m)); toast(`Xong: bổ sung ${rep.updated.length} ảnh khoanh, bỏ qua ${rep.skipped.length} (AI không thấy/không chắc).`, 'ok'); console.log('locate report', JSON.stringify(rep)); (window as unknown as { __locateReport?: unknown }).__locateReport = rep } catch (e) { alert(String((e as Error).message ?? e)) }
            setLocating(null)
          }}>{locating ? '⏳ ' + locating.slice(0, 40) : '🔍 AI bổ sung ảnh còn thiếu'}</button>}
        </div>
        <div className="chips" style={{ marginTop: 8, marginBottom: 0 }}>
          {([['all', 'Tất cả'], ['missing', '⚠ Còn thiếu'], ['norender', '🖼 Chưa có phối cảnh'], ['none', '∅ Không có / bỏ qua']] as [Filter, string][]).map(([k, l]) => <button key={k} className={'chip' + (flt === k ? ' on' : '')} onClick={() => setFlt(k)}>{l} <span className="cnt">{cnt[k]}</span></button>)}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Bấm một ô để xem / thêm / bỏ mã. <b>Kéo một ô (hoặc tên phòng) sang phòng khác</b> để sao chép vật liệu. Ô <span className="mx-miss" style={{ padding: '0 6px' }}>vàng</span> = hạng mục thường phải có theo loại phòng mà đang trống. Sửa ở đây thì tab “Theo phòng”, “Theo vật liệu” và file xuất tự cập nhật.</p>
      </div>

      <div className="mx-wrap">
        <table className="mx">
          <thead><tr><th className="mx-room">Phòng · Room</th><th className="mx-st">Hiện trạng</th>{cats.map(c => <th key={c.key}>{c.vn}<br /><span className="en">{c.en}</span></th>)}</tr></thead>
          <tbody>
            {shown.map((r, si) => { const i = rows.indexOf(r); const fl = r.room.floor ?? null, newFl = si === 0 || (shown[si - 1].room.floor ?? null) !== fl, nFl = shown.filter(x => (x.room.floor ?? null) === fl).length; return (<Fragment key={r.room.id}>
              {hasFloors && newFl && <tr className="mx-floor"><td colSpan={cats.length + 2}><b>{floorLabel(fl)}</b> <span className="muted small">· {nFl} phòng</span></td></tr>}
              <tr className={r.state === 'none' ? 'mx-none' : ''}>
                <td className="mx-room" draggable={canEdit && r.total > 0} onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ room: r.room.id, cat: null }))} onDragOver={e => canEdit && e.preventDefault()} onDrop={e => onDrop(e, r.room.id, null)}>
                  <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}><b>{r.room.code}</b> {r.room.name_vn}<div className="en">{r.room.name_en}</div></div>
                    {hasPlans && (r.room.plan_img
                      ? <img className="mx-plan" src={imgSrc(r.room)} alt={'Mặt bằng ' + r.room.name_vn} loading="lazy" title="Bấm để phóng to (có thêm khu vực xung quanh)" onClick={() => setZoom(r.room)} />
                      : <div className="mx-plan none" title="Chưa tìm thấy phòng này trên bộ mặt bằng khách sạn – cần kiểm tra đúng / thừa">chưa có MB</div>)}
                  </div>
                  <div className="row" style={{ gap: 0, marginTop: 2 }}>
                    <span className="mx-grip" title="Kéo để đổi vị trí phòng trong bảng này (không ảnh hưởng các bảng khác)" draggable={canEdit} onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/x-mx-row', r.room.id) }}>⠿</span>
                    <button className="btn ghost sm" title="Lên" disabled={!canEdit || i === 0 || (rows[i - 1].room.floor ?? null) !== (r.room.floor ?? null)} onClick={() => run(() => moveRoomRow(rows, r.room.id, i - 1))}>▲</button>
                    <button className="btn ghost sm" title="Xuống" disabled={!canEdit || i === rows.length - 1 || (rows[i + 1].room.floor ?? null) !== (r.room.floor ?? null)} onClick={() => run(() => moveRoomRow(rows, r.room.id, i + 1))}>▼</button>
                    <button className="btn ghost sm" title="Sửa tên / loại / tầng / hiện trạng" disabled={!canEdit} onClick={() => setEdit(r.room.id)}>✎</button>
                    <button className="btn ghost sm" title="Sao chép vật liệu từ phòng khác vào phòng này" disabled={!canEdit} onClick={() => setCopy({ to: r.room.id })}>⧉</button>
                    <button className="btn sm mx-del" title="Xoá phòng này" disabled={!canEdit} onClick={() => delRoom(r)}>🗑 Xoá</button>
                  </div>
                </td>
                <td className="mx-st"><State r={r} /></td>
                {cats.map(c => {
                  const es = r.cells.get(c.key) ?? [], miss = r.missing.includes(c.key)
                  return <td key={c.key} className={'mx-c' + (miss && r.state !== 'none' ? ' mx-miss' : '')} draggable={canEdit && es.length > 0} onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ room: r.room.id, cat: c.key }))} onDragOver={e => canEdit && e.preventDefault()} onDrop={e => onDrop(e, r.room.id, c.key)} onClick={() => setCell({ roomId: r.room.id, cat: c.key })}>
                    {(() => { const t = cellTree(es, e => sym.get(e.id) ?? e.code); return t.top.map(e => <span key={e.id} className={'mx-chip ' + e.status} style={{ cursor: canEdit ? 'grab' : 'pointer' }} draggable={canEdit} onDragStart={ev => { ev.stopPropagation(); ev.dataTransfer.setData('application/x-mx-chip', JSON.stringify({ room: r.room.id, cat: c.key, id: e.id })); ev.dataTransfer.effectAllowed = 'move' }} onClick={ev => { ev.stopPropagation(); setChk({ roomId: r.room.id, cat: c.key, id: e.id }) }} title={`Bấm để kiểm tra vị trí · kéo sang cột khác cùng hàng để đổi hạng mục · ${e.name_vn}${e.brand ? ' · ' + e.brand : ''}${t.kids.get(e.id)?.length ? ' · gồm ' + t.kids.get(e.id)!.map(x => sym.get(x.id) ?? x.code).join(', ') : ''}`}>{sym.get(e.id) ?? e.code}</span>) })()}
                    {!es.length && r.need.includes(c.key) && r.state !== 'none' && <span className="mx-hint">thiếu</span>}
                  </td>
                })}
              </tr></Fragment>) })}
            {!shown.length && <tr><td colSpan={cats.length + 2} className="muted" style={{ padding: 16 }}>Không có phòng nào ở bộ lọc này.</td></tr>}
          </tbody>
        </table>
      </div>

      {zoom && <Modal title={`${zoom.code} ${zoom.name_vn} – mặt bằng`} onClose={() => setZoom(null)} w={900}><img src={imgSrc(zoom).replace(/\.png$/, '-ctx.png')} alt="" style={{ width: '100%', background: '#fff' }} /><p className="small muted">Cắt từ bộ mặt bằng khách sạn (PDF) kèm khu vực xung quanh; khung xanh = vùng ảnh nhỏ, vòng tròn xanh = vị trí phòng. Chỉ để đối chiếu đúng / thừa / thiếu.</p></Modal>}
      {chk && rows.find(r => r.room.id === chk.roomId) && d.entries.find(e => e.id === chk.id) && <EntryCheck d={d} sym={sym} rows={rows} row={rows.find(r => r.room.id === chk.roomId)!} cat={chk.cat} entry={d.entries.find(e => e.id === chk.id)!} canEdit={canEdit} run={run} imgSrc={imgSrc} onEditCell={() => { setCell({ roomId: chk.roomId, cat: chk.cat }); setChk(null) }} onClose={() => setChk(null)} />}
      {cell && <CellDialog d={d} sym={sym} row={rows.find(r => r.room.id === cell.roomId)!} cat={cell.cat} canEdit={canEdit} run={run} onCopy={() => setCopy({ to: cell.roomId, cats: [cell.cat], fixedCat: cell.cat })} onClose={() => setCell(null)} />}
      {copy && <CopyDialog d={d} rows={rows} init={copy} run={run} onClose={() => setCopy(null)} />}
      {edit && <RoomDialog d={d} room={d.rooms.find(r => r.id === edit)!} run={run} onClose={() => setEdit(null)} />}
      {adding && <AddRoomDialog d={d} rows={rows} run={run} onClose={() => setAdding(false)} />}
    </div>
  )
}

function State({ r }: { r: Row }) {
  const done = !r.missing.length && r.total > 0
  return <div className="small">
    {r.state === 'render' && <span className="pill st-done">🖼 Có phối cảnh ({r.renders})</span>}
    {r.state === 'norender' && <span className="pill st-running">Chưa có phối cảnh</span>}
    {r.state === 'none' && <span className="pill">∅ Không có</span>}
    {r.state !== 'none' && <div style={{ marginTop: 4 }}>{done ? <span style={{ color: 'var(--ok)' }}>✓ Đủ hạng mục</span> : <span style={{ color: '#b45309' }}>{r.total ? `Thiếu ${r.missing.length}: ${r.missing.map(catVn).join(', ')}` : 'Chưa có vật liệu'}</span>}</div>}
  </div>
}

function Modal({ title, onClose, children, w = 560 }: { title: string; onClose: () => void; children: React.ReactNode; w?: number }) {
  return <div className="modal-bg center" style={{ zIndex: 80 }} onMouseDown={onClose}><div className="modal" style={{ width: w, maxHeight: '90vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}><div className="row between"><h3 style={{ margin: 0 }}>{title}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>{children}</div></div>
}

function EntryCheck({ d, sym, rows, row, cat, entry, canEdit, run, imgSrc, onEditCell, onClose }: { d: ProjectData; sym: Map<string, string>; rows: Row[]; row: Row; cat: string; entry: Entry; canEdit: boolean; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; imgSrc: (r: Room) => string; onEditCell: () => void; onClose: () => void }) {
  const [to, setTo] = useState(''), [idx, setIdx] = useState(0)
  const code = sym.get(entry.id) ?? entry.code
  const mine = d.occ.filter(o => o.room_id === row.room.id && o.entry_id === entry.id && (o.category ?? entry.category ?? '') === cat)
  const shots = mine.filter(o => o.bbox)
  const cur = shots[Math.min(idx, shots.length - 1)]
  const others = [...new Set(d.occ.filter(o => o.entry_id === entry.id && o.room_id && o.room_id !== row.room.id).map(o => o.room_id!))].map(id => d.rooms.find(r => r.id === id)).filter(Boolean) as Room[]
  const pageNo = (o: typeof mine[number]) => d.pages.find(p => p.id === o.page_id)?.page_no
  const parents = d.entries.filter(p => p.id !== entry.id && (p.id === entry.parent_id || (p.product_code ?? '').split(/\s+/).includes(code) || (p.product_code ?? '').split(/\s+/).includes(entry.code)))
  const why = mine.length === 0 ? 'Không có vị trí riêng ở phòng này.' : mine.map(o => `${(o as { origin?: string }).origin === 'manual' ? 'thêm tay / đã chỉnh' : 'AI/phần mềm gán'}${pageNo(o) ? ` · trang concept ${pageNo(o)}` : ''}${o.bbox ? ' · có khoanh' : ' · không khoanh (gán theo mã)'}${o.note ? ' · ' + o.note : ''}`).join(' | ')
  return <div className="modal-bg center" style={{ zIndex: 80 }} onMouseDown={onClose}>
    <div className="modal" style={{ width: 'min(1500px,97vw)', maxHeight: '94vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Kiểm tra <span className={'mx-chip ' + entry.status}>{code}</span> {entry.name_vn} — {row.room.code} {row.room.name_vn} · {catVn(cat)}</h3>
        <button className="btn ghost sm" onClick={onClose}>✕</button>
      </div>
      <div className="row gap" style={{ flexWrap: 'wrap', margin: '8px 0' }}>
        <button className="btn primary sm" onClick={onClose}>✓ Giữ nguyên</button>
        <button className="btn sm danger" disabled={!canEdit} onClick={() => { const n = shotsIn(d, row.room.id, entry, cat); if (n && !confirm(`Mã này có ${n} ảnh phối cảnh ở phòng này – bỏ khỏi phòng sẽ bỏ cả ảnh. Tiếp tục?`)) return; run(() => removeFromCell(d, row.room.id, entry, cat), 'Đã bỏ ' + code).then(onClose) }}>✕ Bỏ khỏi phòng này</button>
        <select value={to} disabled={!canEdit} onChange={e => setTo(e.target.value)}><option value="">Chuyển sang phòng…</option>{rows.filter(r => r.room.id !== row.room.id).map(r => <option key={r.room.id} value={r.room.id}>{r.room.code} {r.room.name_vn}</option>)}</select>
        <button className="btn sm" disabled={!canEdit || !to} onClick={() => run(() => moveToRoom(d, row.room.id, to, entry, cat), 'Đã chuyển ' + code).then(onClose)}>⇄ Chuyển</button>
        <button className="btn ghost sm" onClick={onEditCell}>Sửa cả ô (thêm / sao chép / không cần)…</button>
      </div>
      <div className="small" style={{ marginBottom: 6 }}><b>Vì sao nằm ở đây:</b> {why}{!!parents.length && <> · <b>Liên quan:</b> nằm trong cấu tạo của {parents.map(p => <span key={p.id} className="mx-chip">{sym.get(p.id) ?? p.code}</span>)}</>} · <b>Còn dùng ở:</b> {others.length ? others.map(r => `${r.code} ${r.name_vn}`).join(' · ') : 'không phòng nào khác'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <b className="small">Phối cảnh – khung đỏ/mũi tên = vị trí vật liệu (kích đúp để phóng to)</b>
          <div style={{ height: 400, border: '1px solid var(--line)', background: '#f3ede6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4, overflow: 'hidden' }}>
            {cur ? <OccCrop d={d} o={cur} height={396} maxWidth={Math.min(680, Math.round(window.innerWidth * 0.46))} /> : <p className="muted small" style={{ padding: 12 }}>Không có ảnh khoanh ở phòng này → mã được gán theo mã (vd. thành phần của đồ rời), không thấy trong phối cảnh.</p>}
          </div>
          {shots.length > 1 && <div className="row gap" style={{ marginTop: 4 }}>{shots.map((o, i) => <button key={o.id} className={'chip' + (i === idx ? ' on' : '')} onClick={() => setIdx(i)}>Ảnh {i + 1}{pageNo(o) ? ` (tr.${pageNo(o)})` : ''}</button>)}</div>}
        </div>
        <div>
          <b className="small">Mặt bằng {row.room.code} {row.room.name_vn}</b>
          <div style={{ height: 400, border: '1px solid var(--line)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4, overflow: 'hidden' }}>
            {row.room.plan_img ? <img src={imgSrc(row.room).replace(/\.png$/, '-ctx.png')} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).src = imgSrc(row.room) }} /> : <span className="muted small">Phòng chưa có mặt bằng</span>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <b className="small">Danh mục vật liệu (sửa trực tiếp tại đây – giống tab Theo vật liệu)</b>
        <RoomSections d={d} room={row.room} entryId={entry.id} lang="vn" filter="all" sel={null} onPick={() => {}} onDetail={() => {}} onRemove={() => {}} onAdd={() => {}} />
      </div>
    </div>
  </div>
}

function CellDialog({ d, sym, row, cat, canEdit, run, onCopy, onClose }: { d: ProjectData; sym: Map<string, string>; row: Row; cat: string; canEdit: boolean; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; onCopy: () => void; onClose: () => void }) {
  const [q, setQ] = useState(''), [all, setAll] = useState(false)
  const es = row.cells.get(cat) ?? []
  const naOn = (row.room.matrix_na ?? []).includes(cat)
  const pool = d.entries.filter(e => e.status !== 'rejected' && !es.some(x => x.id === e.id) && (all || e.category === cat || d.occ.some(o => o.entry_id === e.id && o.category === cat))
    && (!q.trim() || `${sym.get(e.id) ?? e.code} ${e.code} ${e.name_vn} ${e.brand ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 40)
  return <Modal title={`${row.room.code} ${row.room.name_vn} · ${catVn(cat)}`} onClose={onClose}>
    <div className="stack">
      {!es.length && <p className="muted small">Ô này chưa có vật liệu.</p>}
      {(() => { const t = cellTree(es, e => sym.get(e.id) ?? e.code); return t.top.flatMap(e => [e, ...(t.kids.get(e.id) ?? [])].map((x, i) => ({ x, sub: i > 0 }))) })().map(({ x: e, sub }) => <div key={e.id} className="row between" style={{ gap: 8, marginLeft: sub ? 22 : 0, opacity: sub ? 0.85 : 1 }}>
        <div>{sub && <span className="muted">↳ </span>}<span className={'mx-chip ' + e.status}>{sym.get(e.id) ?? e.code}</span> {e.name_vn}<div className="small muted">{e.brand ?? ''} {e.product_code ?? ''}</div></div>
        <button className="btn sm danger" disabled={!canEdit} onClick={() => { const n = shotsIn(d, row.room.id, e, cat); if (n && !confirm(`Mã này có ${n} ảnh phối cảnh ở phòng này – bỏ khỏi phòng sẽ bỏ cả ảnh. Tiếp tục?`)) return; run(() => removeFromCell(d, row.room.id, e, cat), 'Đã bỏ ' + (sym.get(e.id) ?? e.code)) }}>✕ Bỏ</button>
      </div>)}
      <hr />
      <b className="small">Thêm mã đã có trong dự án</b>
      <div className="row gap"><input style={{ flex: 1 }} placeholder="Tìm theo ký hiệu / tên / hãng…" value={q} onChange={e => setQ(e.target.value)} /><label className="small"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> mọi hạng mục</label></div>
      <div style={{ maxHeight: 220, overflow: 'auto' }}>
        {pool.map(e => <div key={e.id} className="row between" style={{ gap: 8, padding: '3px 0' }}><div className="small"><span className={'mx-chip ' + e.status}>{sym.get(e.id) ?? e.code}</span> {e.name_vn} <span className="muted">{e.brand ?? ''}</span></div><button className="btn sm" disabled={!canEdit} onClick={() => run(() => addToCell(row.room.id, e, cat), 'Đã thêm ' + (sym.get(e.id) ?? e.code))}>＋ Thêm</button></div>)}
        {!pool.length && <p className="muted small">Không có mã phù hợp. Tick “mọi hạng mục” hoặc tạo mã mới ở tab “Theo phòng”.</p>}
      </div>
      <div className="row gap" style={{ flexWrap: 'wrap' }}>
        <button className="btn" disabled={!canEdit} onClick={() => { onClose(); onCopy() }}>⧉ Sao chép {catVn(cat)} từ phòng khác…</button>
        <label className="small"><input type="checkbox" disabled={!canEdit} checked={naOn} onChange={e => run(() => updateRoom(row.room.id, { matrix_na: e.target.checked ? [...(row.room.matrix_na ?? []), cat] : (row.room.matrix_na ?? []).filter(k => k !== cat) }))} /> Phòng này không cần hạng mục này (không báo thiếu)</label>
      </div>
    </div>
  </Modal>
}

function CopyDialog({ d, rows, init, run, onClose }: { d: ProjectData; rows: Row[]; init: { from?: string; to: string; cats?: string[]; fixedCat?: string }; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; onClose: () => void }) {
  const [from, setFrom] = useState(init.from ?? '')
  const to = rows.find(r => r.room.id === init.to)!, src = rows.find(r => r.room.id === from)
  const avail = src ? CATEGORIES.filter(c => (src.cells.get(c.key) ?? []).some(e => !(to.cells.get(c.key) ?? []).some(x => x.id === e.id)) && (!init.fixedCat || c.key === init.fixedCat)) : []
  const [sel, setSel] = useState<string[] | null>(init.cats ?? null)
  const chosen = (sel ?? avail.map(c => c.key)).filter(k => avail.some(c => c.key === k))
  const n = src ? chosen.reduce((s, k) => s + (src.cells.get(k) ?? []).filter(e => !(to.cells.get(k) ?? []).some(x => x.id === e.id)).length, 0) : 0
  return <Modal title={`Sao chép vật liệu → ${to.room.code} ${to.room.name_vn}`} onClose={onClose}>
    <div className="stack">
      <label className="small">Sao chép từ phòng<select value={from} onChange={e => { setFrom(e.target.value); setSel(init.cats ?? null) }}><option value="">— chọn phòng —</option>{rows.filter(r => r.room.id !== to.room.id && r.total > 0).map(r => <option key={r.room.id} value={r.room.id}>{r.room.code} {r.room.name_vn} ({r.total} mã)</option>)}</select></label>
      {src && (avail.length ? <div className="stack">
        <b className="small">Hạng mục sao chép (chỉ phần phòng này chưa có)</b>
        {avail.map(c => <label key={c.key} className="small"><input type="checkbox" checked={chosen.includes(c.key)} onChange={e => setSel(e.target.checked ? [...chosen, c.key] : chosen.filter(k => k !== c.key))} /> <b>{c.vn}</b>: {(src.cells.get(c.key) ?? []).filter(e => !(to.cells.get(c.key) ?? []).some(x => x.id === e.id)).map(e => e.code).join(' · ')}</label>)}
      </div> : <p className="muted small">Không có gì để sao chép (phòng này đã có đủ hoặc phòng nguồn trống).</p>)}
      <p className="small muted">Chỉ thêm <b>vị trí</b> của các mã dùng chung vào phòng đích; ảnh phối cảnh của phòng nguồn không bị sao chép. Bảng danh mục / theo phòng / theo vật liệu tự đồng bộ.</p>
      <div className="row gap"><button className="btn primary" disabled={!n} onClick={() => run(async () => { await copyCells(d, from, to.room.id, chosen) }, `Đã sao chép ${n} mã`).then(onClose)}>Sao chép {n || ''} mã</button><button className="btn" onClick={onClose}>Huỷ</button></div>
    </div>
  </Modal>
}

function RoomDialog({ d, room, run, onClose }: { d: ProjectData; room: Room; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; onClose: () => void }) {
  const [vn, setVn] = useState(room.name_vn), [en, setEn] = useState(room.name_en ?? ''), [type, setType] = useState(room.room_type), [flag, setFlag] = useState(room.matrix_flag ?? ''), [floor, setFloor] = useState(room.floor ?? '')
  void d
  return <Modal title={`Sửa phòng ${room.code}`} onClose={onClose}>
    <div className="stack">
      <label className="small">Tên tiếng Việt<input value={vn} onChange={e => setVn(e.target.value)} /></label>
      <label className="small">Tên tiếng Anh<input value={en} onChange={e => setEn(e.target.value)} /></label>
      <label className="small">Loại phòng (quyết định hạng mục nào bị coi là thiếu)<select value={type} onChange={e => setType(e.target.value)}>{ROOM_TYPES.map(t => <option key={t.key} value={t.key}>{t.vn}</option>)}</select></label>
<label className="small">Tầng<select value={floor} onChange={e => setFloor(e.target.value)}><option value="">— chưa gán tầng —</option>{FLOORS.map(f => <option key={f.key} value={f.key}>{f.vn}</option>)}</select></label>
      <label className="small">Hiện trạng<select value={flag} onChange={e => setFlag(e.target.value)}><option value="">Tự động (có phối cảnh / chưa có phối cảnh)</option><option value="none">Không có / không thực hiện phòng này</option></select></label>
      <div className="row gap"><button className="btn primary" disabled={!vn.trim()} onClick={() => run(() => updateRoom(room.id, { name_vn: vn.trim(), name_en: en.trim() || null, room_type: type, matrix_flag: flag || null, floor: floor || null }), 'Đã lưu').then(onClose)}>Lưu</button><button className="btn" onClick={onClose}>Huỷ</button></div>
    </div>
  </Modal>
}

function AddRoomDialog({ d, rows, run, onClose }: { d: ProjectData; rows: Row[]; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; onClose: () => void }) {
  const [vn, setVn] = useState(''), [en, setEn] = useState(''), [type, setType] = useState('office'), [from, setFrom] = useState(''), [floor, setFloor] = useState('')
  return <Modal title="Thêm phòng mới" onClose={onClose}>
    <div className="stack">
      <label className="small">Tên tiếng Việt<input autoFocus value={vn} onChange={e => setVn(e.target.value)} placeholder="vd: Phòng họp 2" /></label>
      <label className="small">Tên tiếng Anh<input value={en} onChange={e => setEn(e.target.value)} placeholder="vd: Meeting Room 2" /></label>
      <label className="small">Loại phòng<select value={type} onChange={e => setType(e.target.value)}>{ROOM_TYPES.map(t => <option key={t.key} value={t.key}>{t.vn}</option>)}</select></label>
<label className="small">Tầng<select value={floor} onChange={e => setFloor(e.target.value)}><option value="">— chưa gán tầng —</option>{FLOORS.map(f => <option key={f.key} value={f.key}>{f.vn}</option>)}</select></label>
      <label className="small">Sao chép toàn bộ vật liệu từ phòng (tuỳ chọn – sau đó chỉnh từng ô)<select value={from} onChange={e => setFrom(e.target.value)}><option value="">— không sao chép —</option>{rows.filter(r => r.total > 0).map(r => <option key={r.room.id} value={r.room.id}>{r.room.code} {r.room.name_vn} ({r.total} mã)</option>)}</select></label>
      <div className="row gap"><button className="btn primary" disabled={!vn.trim()} onClick={() => run(() => createRoom(d, { name_vn: vn.trim(), name_en: en.trim(), room_type: type, floor }, from || undefined), 'Đã thêm phòng').then(onClose)}>Thêm phòng</button><button className="btn" onClick={onClose}>Huỷ</button></div>
    </div>
  </Modal>
}

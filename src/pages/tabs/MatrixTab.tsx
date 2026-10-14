// Tổng hợp phòng: ma trận Phòng × Hạng mục. Nhìn là biết phòng nào đủ / thiếu gì / chưa có phối cảnh; sửa ngay tại đây – các tab khác tự cập nhật.
import { Fragment, useMemo, useState } from 'react'
import type { ProjectData } from '../../lib/useProject'
import type { Entry, Room } from '../../lib/types'
import { CATEGORIES, ROOM_TYPES, roomTypeLabel } from '../../lib/codes'
import { symbolMap } from '../../lib/sections'
import { useAuth } from '../../lib/auth'
import { toast } from '../../lib/toast'
import { buildMatrix, copyCells, addToCell, removeFromCell, shotsIn, createRoom, updateRoom, moveRoomRow, deleteRoom, FLOORS, floorLabel, type Row } from '../../lib/roomMatrix'

type Filter = 'all' | 'missing' | 'norender' | 'none'
const catVn = (k: string) => CATEGORIES.find(c => c.key === k)?.vn ?? k

export default function MatrixTab({ d }: { d: ProjectData }) {
  const { canEdit } = useAuth()
  const rows = useMemo(() => buildMatrix(d), [d.rooms, d.occ, d.entries, d.pages])
  const sym = useMemo(() => symbolMap(d.entries), [d.entries])
  const [flt, setFlt] = useState<Filter>('all')
  const [cell, setCell] = useState<{ roomId: string; cat: string } | null>(null)
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

  const delRoom = (r: Row) => {
    const n = d.occ.filter(o => o.room_id === r.room.id), shots = n.filter(o => o.page_id || o.view).length
    const only = r.cells.size ? [...r.cells.values()].flat().filter(e => !d.occ.some(o => o.entry_id === e.id && o.room_id && o.room_id !== r.room.id)).length : 0
    if (!confirm(`Xoá phòng ${r.room.code} ${r.room.name_vn}?\n\n• ${r.total} mã vật liệu bị bỏ khỏi phòng này${shots ? `, kèm ${shots} ảnh khoanh` : ''}${only ? `\n• ${only} mã chỉ nằm ở phòng này sẽ thành "chưa gán phòng" (vẫn giữ trong danh mục)` : ''}\n• Các trang concept của phòng chỉ bị bỏ gán phòng\n\nCó thể hoàn tác bằng nút ↶ ở đầu trang.`)) return
    run(() => deleteRoom(r.room.id), `Đã xoá phòng ${r.room.code}`)
  }
  const onDrop = (e: React.DragEvent, toRoom: string, toCat: string | null) => {
    e.preventDefault(); if (!canEdit) return
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
                    {es.map(e => <span key={e.id} className={'mx-chip ' + e.status} title={`${e.name_vn}${e.brand ? ' · ' + e.brand : ''}`}>{sym.get(e.id) ?? e.code}</span>)}
                    {!es.length && r.need.includes(c.key) && r.state !== 'none' && <span className="mx-hint">thiếu</span>}
                  </td>
                })}
              </tr></Fragment>) })}
            {!shown.length && <tr><td colSpan={cats.length + 2} className="muted" style={{ padding: 16 }}>Không có phòng nào ở bộ lọc này.</td></tr>}
          </tbody>
        </table>
      </div>

      {zoom && <Modal title={`${zoom.code} ${zoom.name_vn} – mặt bằng`} onClose={() => setZoom(null)} w={900}><img src={imgSrc(zoom).replace(/\.png$/, '-ctx.png')} alt="" style={{ width: '100%', background: '#fff' }} /><p className="small muted">Cắt từ bộ mặt bằng khách sạn (PDF) kèm khu vực xung quanh; khung xanh = vùng ảnh nhỏ, vòng tròn xanh = vị trí phòng. Chỉ để đối chiếu đúng / thừa / thiếu.</p></Modal>}
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

function CellDialog({ d, sym, row, cat, canEdit, run, onCopy, onClose }: { d: ProjectData; sym: Map<string, string>; row: Row; cat: string; canEdit: boolean; run: (f: () => Promise<unknown>, ok?: string) => Promise<void>; onCopy: () => void; onClose: () => void }) {
  const [q, setQ] = useState(''), [all, setAll] = useState(false)
  const es = row.cells.get(cat) ?? []
  const naOn = (row.room.matrix_na ?? []).includes(cat)
  const pool = d.entries.filter(e => e.status !== 'rejected' && !es.some(x => x.id === e.id) && (all || e.category === cat || d.occ.some(o => o.entry_id === e.id && o.category === cat))
    && (!q.trim() || `${sym.get(e.id) ?? e.code} ${e.code} ${e.name_vn} ${e.brand ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 40)
  return <Modal title={`${row.room.code} ${row.room.name_vn} · ${catVn(cat)}`} onClose={onClose}>
    <div className="stack">
      {!es.length && <p className="muted small">Ô này chưa có vật liệu.</p>}
      {es.map(e => <div key={e.id} className="row between" style={{ gap: 8 }}>
        <div><span className={'mx-chip ' + e.status}>{sym.get(e.id) ?? e.code}</span> {e.name_vn}<div className="small muted">{e.brand ?? ''} {e.product_code ?? ''}</div></div>
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

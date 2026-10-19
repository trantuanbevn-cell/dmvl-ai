import { useAuth } from '../../lib/auth'
import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { uploadPdf, classifyPages, classifyLocalPages } from '../../lib/pipeline'
import FloorInput from '../../components/FloorInput'
import RenderViewer from '../../components/RenderViewer'
import { floorRank, floorLabel } from '../../lib/roomMatrix'
import type { ProjectData } from '../../lib/useProject'
import { roomStats, heroStyle } from '../../lib/progress'
import LogBox, { useLog } from '../../components/LogBox'
import FloorPlans from '../../components/FloorPlans'
import { roomPages, orphanPages } from '../../lib/roomPages'
import { syncSharedPages } from '../../lib/roomSplit'
import { toast } from '../../lib/toast'
import RoomSplit from '../../components/RoomSplit'
import { suggestSplits } from '../../lib/roomSplit'

const KINDS: Record<string, string> = { cover: 'Bìa', moodboard: 'Moodboard', plan: 'Mặt bằng', render: 'Phối cảnh', other: 'Khác', unknown: 'Chưa phân loại' }

export default function UploadTab({ d }: { d: ProjectData }) {
  const { canEdit, isAdmin, can } = useAuth(), canView = can('camplan')
  const [viewId, setViewId] = useState<string | null>(null)
  const p = d.project!
  const [lines, setLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const log = useLog(setLines)
  const nav = useNavigate()
  const [splitId, setSplitId] = useState<string | null>(null)
  const splits = suggestSplits(d.rooms, d.pages)
  const orphans = orphanPages(d.pages)
  const [sel, setSel] = useState<Set<string>>(new Set()), [newFor, setNewFor] = useState<string | null>(null), [newName, setNewName] = useState('')
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  /** Tạo phòng mới (gõ tên trực tiếp) và gán luôn trang này + các trang đang tích chọn */
  const createRoomFor = async (pageId: string) => {
    const name = newName.trim(); if (!name) return
    const used = new Set(d.rooms.map(r => r.code)); let n = d.rooms.length + 1, code = ''
    do { code = `R${String(n++).padStart(2, '0')}` } while (used.has(code))
    const { data, error } = await supabase.from('rooms').insert({ project_id: p.id, code, name_vn: name, sort: d.rooms.length + 1 }).select().single()
    if (error) return alert(error.message)
    await supabase.from('pages').update({ room_id: data.id }).in('id', [pageId, ...sel])
    setNewFor(null); setNewName(''); setSel(new Set()); d.reload()
  }
  const assignSel = async (roomId: string) => { if (!roomId || !sel.size) return; await supabase.from('pages').update({ room_id: roomId }).in('id', [...sel]); setSel(new Set()); d.reload() }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { log('LỖI: ' + String(e)) }
    setBusy(false); await d.reload()
  }
  const onFile = (f?: File) => {
    if (!f) return
    if (d.pages.length && !confirm('Tải file mới sẽ xoá toàn bộ trang, phòng và kết quả phân tích hiện có. Tiếp tục?')) return
    run(async () => { await uploadPdf(p, f, log); await d.reload(); log('Phân loại trang & gom phòng theo tiêu đề trang (không dùng AI)...'); await classifyLocalPages(p, log) })
  }
  const setPage = async (id: string, patch: Record<string, unknown>) => { const { error } = await supabase.from('pages').update(patch).eq('id', id); if (error) alert(/floor/.test(error.message) ? 'Chưa có cột “tầng” trong dữ liệu. Chạy file supabase/migrations/0035_floors_free.sql trong SQL Editor của Supabase rồi thử lại.' : error.message); d.reload() }
  const setRoom = async (id: string, patch: Record<string, unknown>) => { const { error } = await supabase.from('rooms').update(patch).eq('id', id); if (error) alert(/floor/.test(error.message) ? 'Chưa có cột “tầng” trong dữ liệu. Chạy file supabase/migrations/0035_floors_free.sql trong SQL Editor của Supabase rồi thử lại.' : error.message); d.reload() }
  const floorsUsed = [...d.rooms.map(r => r.floor), ...d.pages.map(x => x.floor)]
  const roomsByFloor = [...d.rooms].sort((a, b) => floorRank(a.floor) - floorRank(b.floor) || (a.sort ?? 0) - (b.sort ?? 0))
  const roomOf = (id: string | null) => id ? d.rooms.find(r => r.id === id) : undefined
  const addRoom = async () => {
    const n = d.rooms.length + 1
    await supabase.from('rooms').insert({ project_id: p.id, code: `R${String(n).padStart(2, '0')}`, name_vn: 'Phòng mới', sort: n }); d.reload()
  }
  const delRoom = async (id: string) => { if (confirm('Xoá phòng này? Các trang sẽ bị bỏ gán.')) { await supabase.from('rooms').delete().eq('id', id); d.reload() } }

  return (
    <fieldset className="plain stack" disabled={!canEdit}>
      <div className="card">
        <h3>File concept (PDF)</h3>
        <details className="small muted"><summary>Cách hoạt động</summary><p>Phần mềm tách từng trang thành ảnh ngay trong trình duyệt, đọc chữ trên trang để phân loại bìa / moodboard / mặt bằng / phối cảnh, gom theo phòng và đọc số liệu – <b>không dùng AI, không tốn phí</b>. Nếu PDF là ảnh scan không có chữ, dùng “AI phân loại”.</p></details>
        <div className="row gap">
          <label className="btn primary" style={isAdmin ? undefined : { opacity: .5, pointerEvents: 'none' }} title={isAdmin ? undefined : 'Chỉ quản trị viên'}>{d.pages.length ? 'Tải file khác' : 'Chọn file PDF'}<input type="file" accept="application/pdf" hidden disabled={busy || !isAdmin} onChange={e => onFile(e.target.files?.[0])} /></label>
          {d.pages.length > 0 && <button className="btn" disabled={busy || !isAdmin} title={isAdmin ? undefined : 'Chỉ quản trị viên'} onClick={() => run(() => classifyLocalPages(p, log))}>Phân loại lại (không AI)</button>}
          {d.pages.length > 0 && <button className="btn ghost" disabled={busy || !isAdmin} title="Chỉ quản trị viên · chỉ cần cho PDF scan không có chữ – dùng hạn mức AI" onClick={() => run(() => classifyPages(p, log))}>AI phân loại (PDF scan)</button>}
          {d.rooms.length > 0 && <button className="btn" disabled={orphans.length > 0} title={orphans.length ? 'Còn trang chưa xếp phòng' : undefined} onClick={() => nav(`/p/${p.id}/analyze`)}>Tiếp: Phân tích →</button>}
          {busy && <span className="spinner" />}
        </div>
        <LogBox lines={lines} />
      </div>

      <FloorPlans d={d} />

      {d.rooms.length > 0 && (
        <div className="card">
          <div className="row between"><h3>Phòng ({d.rooms.length})</h3><span><button className="btn sm" title="Cập nhật ảnh đại diện của các phòng đã tách theo từng ảnh phối cảnh" onClick={async () => { try { const n = await syncSharedPages(d); toast(n ? `Đã cập nhật ảnh cho ${n} slide đã tách` : 'Không có slide nào cần cập nhật (hoặc chưa nhận ra được ảnh)', n ? 'ok' : 'info'); if (n) d.reload() } catch (e) { alert(String((e as Error).message ?? e)) } }}>⟳ Đồng bộ ảnh phòng đã tách</button> <button className="btn sm" onClick={addRoom}>+ Thêm phòng</button></span></div>
          {splits.length > 0 && <div className="warn-box small" style={{ margin: '8px 0', padding: 8, background: '#fff6df', borderRadius: 8 }}>
            ⚠ Phát hiện phòng có thể đang gom nhiều phòng trong cùng một slide: {splits.map(x => <span key={x.room.id} style={{ marginRight: 10 }}><b>{x.room.code} {x.room.name_vn}</b> → {x.parts.map(p => p.name_vn).join(' | ')} <button className="btn sm" onClick={() => setSplitId(x.room.id)}>✂ Tách</button></span>)}
          </div>}
          <table className="tbl">
            <thead><tr><th /><th>Mã</th><th>Tên phòng (VN)</th><th>Tên (EN)</th><th>Tầng</th><th>Số liệu concept</th><th>Số trang</th><th /></tr></thead>
            <tbody>{roomsByFloor.map((r, ri) => (
              <Fragment key={r.id}>
              {(ri === 0 || (roomsByFloor[ri - 1].floor ?? '') !== (r.floor ?? '')) && <tr><td colSpan={8} style={{ background: 'var(--brown)', color: '#fff', padding: '6px 10px' }}><b>{floorLabel(r.floor)}</b> <span className="small" style={{ opacity: .8 }}>· {roomsByFloor.filter(x => (x.floor ?? '') === (r.floor ?? '')).length} phòng</span></td></tr>}
              <tr>
                <td style={{ width: 120 }}>{(() => { const st = heroStyle(d, roomStats(d).get(r.id)?.hero, r.id, 104 / 64); return st ? <span className="mini-hero lg" style={st} /> : null })()}</td>
                <td><input className="code-in" defaultValue={r.code} onBlur={e => e.target.value !== r.code && setRoom(r.id, { code: e.target.value })} /></td>
                <td><input defaultValue={r.name_vn} onBlur={e => e.target.value !== r.name_vn && setRoom(r.id, { name_vn: e.target.value })} /></td>
                <td><input defaultValue={r.name_en ?? ''} onBlur={e => setRoom(r.id, { name_en: e.target.value })} /></td>
                <td style={{ width: 110 }}><FloorInput id={'r' + r.id} value={r.floor} used={floorsUsed} onCommit={v => setRoom(r.id, { floor: v })} placeholder="Tầng…" /></td>
                <td className="small">{(r.concept_counts ?? []).map(c => `${c.label}: ${c.qty}`).join(' · ')}{d.warnings.filter(w => w.room_id === r.id).map(w => <div key={w.id} className="warn-text">⚠ {w.text}</div>)}</td>
                <td>{roomPages(d.pages, r.id).length}</td>
                <td><button className="btn ghost sm" title="Tách phòng này thành nhiều phòng" onClick={() => setSplitId(r.id)}>✂ Tách</button> <button className="btn ghost sm danger" onClick={() => delRoom(r.id)}>Xoá</button></td>
              </tr></Fragment>))}
            </tbody>
          </table>
        </div>
      )}

      {d.pages.length > 0 && (
        <div className="card">
          <h3>Trang ({d.pages.length}) – kiểm tra phân loại, đổi phòng nếu AI gom sai</h3>
          {orphans.length > 0 && <div style={{ background: '#fdeceb', border: '2px solid #c0392b', borderRadius: 8, padding: 10, margin: '8px 0' }}>
            <b style={{ color: '#c0392b' }}>⚠ {orphans.length} trang phối cảnh chưa thuộc phòng nào (Tr.{orphans.map(x => x.page_no).join(', ')}).</b>
            <div className="small">Phần mềm không đọc được tên phòng ở các trang này. Bắt buộc xếp vào một phòng có sẵn hoặc chọn “＋ Phòng mới…” rồi gõ tên – nếu bỏ sót, phòng sẽ không được phân tích. Có thể tích nhiều trang rồi gán cùng lúc.</div>
            {sel.size > 0 && <div className="row gap sm-gap" style={{ marginTop: 6 }}><b>{sel.size} trang đã tích →</b>
              <select value="" onChange={e => assignSel(e.target.value)}><option value="">Gán vào phòng…</option>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}</select></div>}
          </div>}
          <div className="page-grid">
            {d.pages.map(pg => {
              const bad = !pg.room_id && (pg.kind === 'render' || pg.kind === 'unknown')
              return (
              <div key={pg.id} className={'page-tile kind-' + pg.kind} style={bad ? { borderColor: '#c0392b', borderWidth: 3, background: '#fdeceb' } : undefined}>
                {pg.room_id && <span className="rc-code tile-code">{d.rooms.find(r => r.id === pg.room_id)?.code}</span>}
                {bad && <label className="small" style={{ position: 'absolute', top: 4, left: 6, zIndex: 2, background: '#fff', padding: '0 4px', borderRadius: 4 }}><input type="checkbox" checked={sel.has(pg.id)} onChange={() => toggle(pg.id)} /> chọn</label>}
                <img src={d.urls[pg.thumb_path ?? pg.image_path]} alt="" loading="lazy" style={canView ? { cursor: 'zoom-in' } : undefined} title={canView ? 'Kích đúp để phóng to, xem mặt bằng và đặt camera' : undefined} onDoubleClick={() => canView && setViewId(pg.id)} />
                <div className="row gap sm-gap">
                  <b>Tr.{pg.page_no}</b>
                  <select value={pg.kind} onChange={e => setPage(pg.id, { kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </div>
                <select value={pg.room_id ?? ''} style={bad ? { borderColor: '#c0392b', color: '#c0392b', fontWeight: 600 } : undefined} onChange={e => { if (e.target.value === '__new') { setNewFor(pg.id); setNewName('') } else setPage(pg.id, { room_id: e.target.value || null }) }}>
                  <option value="">{bad ? '⚠ CHƯA XẾP PHÒNG – bắt buộc chọn' : '— không thuộc phòng —'}</option>
                  {d.rooms.map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}
                  <option value="__new">＋ Phòng mới…</option>
                </select>
                {pg.kind === 'plan' ? <FloorInput id={'pg' + pg.id} value={pg.floor} used={floorsUsed} onCommit={v => setPage(pg.id, { floor: v })} placeholder="Tầng của mặt bằng này…" />
                  : pg.room_id && roomOf(pg.room_id) ? <FloorInput id={'pr' + pg.id} value={roomOf(pg.room_id)!.floor} used={floorsUsed} onCommit={v => setRoom(pg.room_id!, { floor: v })} placeholder="Tầng của phòng…" /> : null}
                {newFor === pg.id && <div className="row gap sm-gap"><input autoFocus placeholder="Gõ tên phòng mới" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createRoomFor(pg.id)} /><button className="btn sm primary" onClick={() => createRoomFor(pg.id)}>Tạo</button><button className="btn ghost sm" onClick={() => setNewFor(null)}>✕</button></div>}
              </div>)
            })}
          </div>
        </div>
      )}
      {viewId && d.pages.find(x => x.id === viewId) && <RenderViewer d={d} pageId={viewId} onClose={() => setViewId(null)} onGo={setViewId} />}
      {splitId && d.rooms.find(r => r.id === splitId) && <RoomSplit d={d} room={d.rooms.find(r => r.id === splitId)!} onClose={() => setSplitId(null)} />}
    </fieldset>
  )
}

import { useAuth } from '../../lib/auth'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { uploadPdf, classifyPages, classifyLocalPages } from '../../lib/pipeline'
import { ROOM_TYPES } from '../../lib/codes'
import type { ProjectData } from '../../lib/useProject'
import { roomStats, heroUrl } from '../../lib/progress'
import LogBox, { useLog } from '../../components/LogBox'
import FloorPlans from '../../components/FloorPlans'

const KINDS: Record<string, string> = { cover: 'Bìa', moodboard: 'Moodboard', plan: 'Mặt bằng', render: 'Phối cảnh', other: 'Khác', unknown: 'Chưa phân loại' }

export default function UploadTab({ d }: { d: ProjectData }) {
  const { canEdit } = useAuth()
  const p = d.project!
  const [lines, setLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const log = useLog(setLines)
  const nav = useNavigate()

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
  const setPage = async (id: string, patch: Record<string, unknown>) => { await supabase.from('pages').update(patch).eq('id', id); d.reload() }
  const setRoom = async (id: string, patch: Record<string, unknown>) => { await supabase.from('rooms').update(patch).eq('id', id); d.reload() }
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
          <label className="btn primary">{d.pages.length ? 'Tải file khác' : 'Chọn file PDF'}<input type="file" accept="application/pdf" hidden disabled={busy} onChange={e => onFile(e.target.files?.[0])} /></label>
          {d.pages.length > 0 && <button className="btn" disabled={busy} onClick={() => run(() => classifyLocalPages(p, log))}>Phân loại lại (không AI)</button>}
          {d.pages.length > 0 && <button className="btn ghost" disabled={busy} title="Chỉ cần cho PDF scan không có chữ – dùng hạn mức AI" onClick={() => run(() => classifyPages(p, log))}>AI phân loại (PDF scan)</button>}
          {d.rooms.length > 0 && <button className="btn" onClick={() => nav(`/p/${p.id}/analyze`)}>Tiếp: Phân tích →</button>}
          {busy && <span className="spinner" />}
        </div>
        <LogBox lines={lines} />
      </div>

      <FloorPlans d={d} />

      {d.rooms.length > 0 && (
        <div className="card">
          <div className="row between"><h3>Phòng ({d.rooms.length})</h3><button className="btn sm" onClick={addRoom}>+ Thêm phòng</button></div>
          <table className="tbl">
            <thead><tr><th /><th>Mã</th><th>Tên phòng (VN)</th><th>Tên (EN)</th><th>Loại phòng</th><th>Số liệu concept</th><th>Số trang</th><th /></tr></thead>
            <tbody>{d.rooms.map(r => (
              <tr key={r.id}>
                <td style={{ width: 120 }}>{(() => { const u = heroUrl(d, roomStats(d).get(r.id)?.hero); return u ? <span className="mini-hero lg" style={{ backgroundImage: `url("${u}")` }} /> : null })()}</td>
                <td><input className="code-in" defaultValue={r.code} onBlur={e => e.target.value !== r.code && setRoom(r.id, { code: e.target.value })} /></td>
                <td><input defaultValue={r.name_vn} onBlur={e => e.target.value !== r.name_vn && setRoom(r.id, { name_vn: e.target.value })} /></td>
                <td><input defaultValue={r.name_en ?? ''} onBlur={e => setRoom(r.id, { name_en: e.target.value })} /></td>
                <td><select value={r.room_type} onChange={e => setRoom(r.id, { room_type: e.target.value })}>{ROOM_TYPES.map(t => <option key={t.key} value={t.key}>{t.vn}</option>)}</select></td>
                <td className="small">{(r.concept_counts ?? []).map(c => `${c.label}: ${c.qty}`).join(' · ')}{d.warnings.filter(w => w.room_id === r.id).map(w => <div key={w.id} className="warn-text">⚠ {w.text}</div>)}</td>
                <td>{d.pages.filter(pg => pg.room_id === r.id).length}</td>
                <td><button className="btn ghost sm danger" onClick={() => delRoom(r.id)}>Xoá</button></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      {d.pages.length > 0 && (
        <div className="card">
          <h3>Trang ({d.pages.length}) – kiểm tra phân loại, đổi phòng nếu AI gom sai</h3>
          <div className="page-grid">
            {d.pages.map(pg => (
              <div key={pg.id} className={'page-tile kind-' + pg.kind}>
                {pg.room_id && <span className="rc-code tile-code">{d.rooms.find(r => r.id === pg.room_id)?.code}</span>}
                <img src={d.urls[pg.thumb_path ?? pg.image_path]} alt="" loading="lazy" />
                <div className="row gap sm-gap">
                  <b>Tr.{pg.page_no}</b>
                  <select value={pg.kind} onChange={e => setPage(pg.id, { kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </div>
                <select value={pg.room_id ?? ''} onChange={e => setPage(pg.id, { room_id: e.target.value || null })}>
                  <option value="">— không thuộc phòng —</option>
                  {d.rooms.map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  )
}

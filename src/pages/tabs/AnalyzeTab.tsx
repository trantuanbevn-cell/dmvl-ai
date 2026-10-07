import { useEffect, useState } from 'react'
import { aiInfo } from '../../lib/ai'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { analyzeRoom, applyInference, writeSpecs, fillColors } from '../../lib/pipeline'
import { roomTypeLabel } from '../../lib/codes'
import type { ProjectData } from '../../lib/useProject'
import LogBox, { useLog } from '../../components/LogBox'

const ST: Record<string, string> = { pending: 'Chưa chạy', running: 'Đang chạy…', done: 'Xong', error: 'Lỗi' }

export default function AnalyzeTab({ d }: { d: ProjectData }) {
  const p = d.project!
  const [lines, setLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const log = useLog(setLines)
  const nav = useNavigate()
  const [info, setInfo] = useState<{ provider: string; model: string } | null>(null)
  useEffect(() => { aiInfo().then(setInfo) }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { log('LỖI: ' + String(e)) }
    setBusy(false); await d.reload()
  }
  const doRooms = (ids: string[]) => run(async () => {
    for (const id of ids) {
      const room = d.rooms.find(r => r.id === id)!
      log(`▶ ${room.code} ${room.name_vn}`)
      try { await analyzeRoom(p, room, log); log(`✓ ${room.code} xong`) } catch (e) { log(`✗ ${room.code}: ${String(e)}`) }
      await d.reload()
    }
    await supabase.from('projects').update({ status: 'analyzed' }).eq('id', p.id)
    log('HOÀN TẤT. Chuyển sang tab "Theo phòng" hoặc "Theo nhóm vật liệu" để rà soát.')
  })

  const reapply = () => run(async () => {
    for (const r of d.rooms) { const n = await applyInference(p, r); log(`${r.code}: quy tắc suy luận → ${n} hạng mục`) }
    await fillColors(p)
    const n = await writeSpecs(p, { force: true })
    log(`Đã viết lại thông số cho ${n} mã theo mẫu (không dùng AI).`)
  })
  const renders = d.pages.filter(pg => pg.kind === 'render' && pg.room_id).length

  return (
    <div className="stack">
      <div className="card">
        <div className="row between"><h3>Phân tích bằng AI</h3><span className="pill">{info ? `AI: ${info.provider === 'gemini' ? 'Google Gemini' : 'Anthropic Claude'} · ${info.model}` : 'AI: đang kiểm tra…'}</span></div>
        <p className="muted"><b>AI chỉ làm một việc:</b> nhìn từng ảnh phối cảnh và liệt kê vật liệu, đồ đạc kèm khung vị trí (1 lần gọi/ảnh, dùng Gemini Flash – nằm trong hạn mức miễn phí). Phần mềm tự làm phần còn lại, không tốn phí: ghép mã trùng, lấy màu từ điểm ảnh, suy luận hạng mục thiếu theo bộ quy tắc (nắp thăm trần, phụ kiện cửa, len, thoát sàn…), viết thông số – tính chất – tiêu chuẩn theo mẫu. Dự án này cần khoảng <b>{renders} lần gọi AI</b>; giữa các lần có giãn cách vài giây để không vượt giới hạn tốc độ miễn phí.</p>
        <div className="row gap">
          <button className="btn primary" disabled={busy || !d.rooms.length} onClick={() => doRooms(d.rooms.map(r => r.id))}>▶ Phân tích tất cả phòng</button>
          <button className="btn" disabled={busy || !d.entries.length} onClick={reapply}>Áp lại quy tắc & viết lại thông số (không AI)</button>
          {busy && <span className="spinner" />}
        </div>
        <LogBox lines={lines} />
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Phòng</th><th>Loại</th><th>Trang phối cảnh / mặt bằng</th><th>Hạng mục</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>{d.rooms.map(r => {
            const pages = d.pages.filter(pg => pg.room_id === r.id && (pg.kind === 'render' || pg.kind === 'plan'))
            const n = new Set(d.occ.filter(o => o.room_id === r.id).map(o => o.entry_id)).size
            return (
              <tr key={r.id}>
                <td><b>{r.code}</b> {r.name_vn}</td><td>{roomTypeLabel(r.room_type)}</td>
                <td>{pages.map(pg => pg.page_no).join(', ') || <span className="warn-text">chưa có trang</span>}</td>
                <td>{n}</td>
                <td><span className={'pill st-' + r.analysis_status} title={r.analysis_log ?? ''}>{ST[r.analysis_status] ?? r.analysis_status}</span></td>
                <td className="row gap sm-gap">
                  <button className="btn sm" disabled={busy || !pages.length} onClick={() => doRooms([r.id])}>{r.analysis_status === 'done' ? 'Chạy lại' : 'Phân tích'}</button>
                  {n > 0 && <button className="btn ghost sm" onClick={() => nav(`/p/${p.id}/rooms?room=${r.id}`)}>Xem →</button>}
                </td>
              </tr>)
          })}</tbody>
        </table>
        <p className="muted small">Chạy lại một phòng sẽ gọi lại AI cho các ảnh của phòng đó (mã đã xác nhận hoặc thêm tay được giữ lại). Sửa quy tắc/checklist xong chỉ cần bấm “Áp lại quy tắc” – không tốn lượt AI.</p>
      </div>
    </div>
  )
}

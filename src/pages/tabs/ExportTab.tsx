import { useState } from 'react'
import { exportExcel, filterEntries } from '../../lib/exportExcel'
import { printSchedule } from '../../lib/exportPrint'
import type { ProjectData } from '../../lib/useProject'

export default function ExportTab({ d }: { d: ProjectData }) {
  const [inc, setInc] = useState(false)
  const [busy, setBusy] = useState('')
  const n = filterEntries(d.entries, inc).length
  const pend = d.entries.filter(e => e.status === 'pending' || e.status === 'review').length
  const go = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn() } catch (e) { alert(String(e)) } setBusy('') }
  const data = { project: d.project!, rooms: d.rooms, pages: d.pages, entries: d.entries, occ: d.occ }
  return (
    <div className="card stack">
      <h3>Xuất bảng danh mục</h3>
      <p className="muted">File tự sắp xếp theo nhóm vật liệu (CT → ES → … → FF → LT → SF → AW → ME), đánh STT liên tục, kèm ảnh crop phối cảnh, map vật liệu (ảnh hãng hoặc ô màu), tính chất, tiêu chuẩn, hãng, link, số lượng và cờ cảnh báo; khối nhà thầu đề xuất & đánh giá để trống. Sheet thứ 2 là bảng hoàn thiện theo phòng.</p>
      <label className="row sm-gap"><input type="checkbox" checked={inc} onChange={e => setInc(e.target.checked)} /> Gồm cả mã chưa duyệt ({pend}) – dùng cho bản nháp nội bộ</label>
      <div className="small">Sẽ xuất <b>{n}</b> mã{!inc && pend > 0 ? ` (còn ${pend} mã chờ duyệt không được xuất)` : ''}.</div>
      <div className="row gap">
        <button className="btn primary" disabled={!!busy || !n} onClick={() => go('vn', () => exportExcel(data, 'vn', inc))}>⬇ Excel tiếng Việt</button>
        <button className="btn primary" disabled={!!busy || !n} onClick={() => go('en', () => exportExcel(data, 'en', inc))}>⬇ Excel English</button>
        <button className="btn" disabled={!!busy || !n} onClick={() => go('pdf', () => printSchedule(data, 'vn', inc))}>🖨 PDF tiếng Việt</button>
        <button className="btn" disabled={!!busy || !n} onClick={() => go('pdf', () => printSchedule(data, 'en', inc))}>🖨 PDF English</button>
        {busy && <span className="spinner" />}
      </div>
      <p className="small muted">PDF: trang in mở ra trong tab mới → chọn “Lưu dưới dạng PDF”, khổ A3 ngang.</p>
    </div>
  )
}

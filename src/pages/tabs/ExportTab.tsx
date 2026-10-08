import { useState } from 'react'
import { exportExcel, filterEntries } from '../../lib/exportExcel'
import { printSchedule } from '../../lib/exportPrint'
import type { Lang } from '../../lib/sections'
import type { ProjectData } from '../../lib/useProject'

export default function ExportTab({ d }: { d: ProjectData }) {
  const [inc, setInc] = useState(false)
  const [lang, setLang] = useState<Lang>('both')
  const [busy, setBusy] = useState('')
  const n = filterEntries(d.entries, inc).length
  const pend = d.entries.filter(e => e.status === 'pending' || e.status === 'review').length
  const go = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn() } catch (e) { alert(String(e)) } setBusy('') }
  const data = { project: d.project!, rooms: d.rooms, pages: d.pages, entries: d.entries, occ: d.occ }
  return (
    <div className="card stack">
      <h3>Xuất bảng danh mục</h3>
      <p className="muted">File theo đúng bố cục DMVL của công ty (STT · Ký hiệu bản vẽ · Mã VL · Mục · Vị trí · Thống kê · Hình ảnh phối cảnh · Mẫu vật liệu · Thông số kỹ thuật · Xuất xứ/Thương hiệu · Ghi chú, khối nhà thầu & đánh giá để trống). Nhóm theo vật liệu: <b>sàn – tường – trần</b> trước, rồi vật liệu & cấu kiện khác, nội thất liền tường, nội thất rời, thiết bị, đèn, decor, artwork. Sheet thứ 2 là bảng hoàn thiện theo phòng.</p>
      <div className="row gap sm-gap"><b>Ngôn ngữ & ký hiệu:</b>
        {([['vn', 'Tiếng Việt (ký hiệu SG1, DA1, TH1…)'], ['en', 'English (ký hiệu CT-01, ST-01…)'], ['both', 'Song ngữ cả hai']] as const).map(([k, l]) => <button key={k} className={'chip' + (lang === k ? ' on' : '')} onClick={() => setLang(k)}>{l}</button>)}</div>
      <label className="row sm-gap"><input type="checkbox" checked={inc} onChange={e => setInc(e.target.checked)} /> Gồm cả mã chưa duyệt ({pend}) – dùng cho bản nháp nội bộ</label>
      <div className="small">Sẽ xuất <b>{n}</b> mã{!inc && pend > 0 ? ` (còn ${pend} mã chờ duyệt không được xuất)` : ''}.</div>
      <div className="row gap">
        <button className="btn primary" disabled={!!busy || !n} onClick={() => go('xlsx', () => exportExcel(data, lang, inc))}>⬇ Xuất Excel</button>
        <button className="btn" disabled={!!busy || !n} onClick={() => go('pdf', () => printSchedule(data, lang, inc))}>🖨 Xuất PDF</button>
        {busy && <span className="spinner" />}
      </div>
      <p className="small muted">PDF: trang in mở ra trong tab mới → chọn “Lưu dưới dạng PDF”, khổ A3 ngang.</p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { listBackups, makeBackup, downloadBackup, restoreBackup, deleteBackup, type BackupRow } from '../lib/backup'
import type { ProjectData } from '../lib/useProject'
import { toast } from '../lib/toast'

/** Sao lưu dữ liệu dự án: tạo bản mới, tải về máy, khôi phục (chỉ quản trị viên) */
export default function BackupPanel({ d }: { d: ProjectData }) {
  const { isAdmin } = useAuth()
  const p = d.project!
  const [rows, setRows] = useState<BackupRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => listBackups(p.id).then(r => { setRows(r); setErr('') }).catch(e => setErr(String(e.message ?? e)))
  useEffect(() => { if (isAdmin) load() }, [p.id, isAdmin])
  if (!isAdmin) return null
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast(ok, 'ok'); await load() } catch (e) { alert(String((e as Error).message ?? e)) } setBusy(false) }
  const fmt = (s: string) => new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
  return (
    <div className="card">
      <div className="row between"><h3 style={{ margin: 0 }}>Sao lưu dữ liệu</h3>
        <button className="btn primary sm" disabled={busy} onClick={() => { const l = prompt('Ghi chú cho bản sao lưu (có thể để trống):', ''); if (l !== null) run(() => makeBackup(p.id, l || 'Sao lưu thủ công'), 'Đã sao lưu') }}>＋ Sao lưu ngay</button></div>
      <p className="small muted">Phần mềm tự sao lưu trước mỗi lần phân tích, phân loại lại, tải PDF mới hoặc tách phòng (giữ 40 bản tự động gần nhất). Khôi phục sẽ đưa phòng, mã vật liệu, vị trí và hình ảnh phối cảnh về đúng thời điểm đó; trước khi khôi phục luôn có thêm một bản sao lưu tự động.</p>
      {err && <p className="warn-text small">{err}</p>}
      <table className="tbl small"><thead><tr><th>Thời điểm</th><th>Loại</th><th>Nội dung</th><th>Dữ liệu</th><th /></tr></thead>
        <tbody>{rows.map(b => (
          <tr key={b.id}><td>{fmt(b.created_at)}</td><td>{b.kind === 'auto' ? 'Tự động' : 'Thủ công'}</td><td>{b.label}</td>
            <td>{b.counts ? `${b.counts.rooms} phòng · ${b.counts.entries} mã · ${b.counts.occurrences} vị trí` : ''}</td>
            <td className="row gap sm-gap">
              <button className="btn sm" disabled={busy} onClick={() => run(() => downloadBackup(b.id, p.name), 'Đã tải về')}>⬇ Tải về</button>
              <button className="btn sm" disabled={busy} onClick={() => { if (confirm(`Khôi phục dữ liệu về ${fmt(b.created_at)}?\nMọi thay đổi sau thời điểm đó sẽ bị thay bằng bản này (vẫn có bản sao lưu tự động của hiện trạng để quay lại).`)) run(async () => { await restoreBackup(b.id); await d.reload() }, 'Đã khôi phục') }}>↩ Khôi phục</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => { if (confirm('Xoá bản sao lưu này?')) run(() => deleteBackup(b.id), 'Đã xoá') }}>Xoá</button></td></tr>))}
          {!rows.length && !err && <tr><td colSpan={5} className="muted">Chưa có bản sao lưu nào.</td></tr>}
        </tbody></table>
    </div>
  )
}

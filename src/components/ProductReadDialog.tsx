import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { readProductPage, planFill, applyFill, type Extracted, type FieldChange } from '../lib/productRead'
import type { Entry } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import { toast } from '../lib/toast'

/** Đọc lại thông số từ link sản phẩm và cho chọn từng ô muốn điền / ghi đè */
export default function ProductReadDialog({ d, entry, onClose }: { d: ProjectData; entry: Entry; onClose: () => void }) {
  const [ex, setEx] = useState<Extracted | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const ch: FieldChange[] = ex ? planFill(entry, ex, true) : []
  useEffect(() => {
    readProductPage(entry.product_url ?? '').then(x => { setEx(x); const c = planFill(entry, x, true); setPick(Object.fromEntries(c.map(f => [String(f.key), !f.old.trim()]))) }).catch(e => setErr(String((e as Error).message ?? e)))
  }, [entry.id, entry.product_url])
  const apply = async () => {
    setBusy(true)
    const er = await applyFill(entry, ch.filter(c => pick[String(c.key)]))
    setBusy(false)
    if (er) { alert(er.message); return }
    toast('Đã cập nhật thông số từ link', 'ok'); d.reload(); onClose()
  }
  return createPortal(
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(720px, 96vw)', maxHeight: '90vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>Thông số đọc từ link · {entry.code} {entry.name_vn}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="small muted" style={{ wordBreak: 'break-all' }}>{entry.product_url}</div>
        {!ex && !err && <p>Đang tải và đọc trang sản phẩm…</p>}
        {err && <p className="warn-text">{err}</p>}
        {ex && !ch.length && <p className="ok-text">Không có gì mới để điền – các ô đã giống thông tin trên trang.</p>}
        {ex && ch.length > 0 && <>
          <p className="small muted">Tích chọn ô muốn điền. Ô đang có nội dung được bỏ chọn sẵn (tích để ghi đè). Nguồn: {ex.found.join(', ') || 'meta trang'}.</p>
          <table className="tbl small" style={{ width: '100%' }}>
            <thead><tr><th /><th>Ô</th><th>Hiện tại</th><th>Đọc được</th></tr></thead>
            <tbody>{ch.map(c => <tr key={String(c.key)}>
              <td><input type="checkbox" checked={!!pick[String(c.key)]} onChange={x => setPick(p => ({ ...p, [String(c.key)]: x.target.checked }))} /></td>
              <td><b>{c.label}</b></td><td className="muted" style={{ whiteSpace: 'pre-wrap' }}>{c.old || '—'}</td><td style={{ whiteSpace: 'pre-wrap' }}>{c.value}</td></tr>)}</tbody>
          </table>
        </>}
        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn" onClick={onClose}>Đóng</button>
          {ch.length > 0 && <button className="btn primary" disabled={busy || !ch.some(c => pick[String(c.key)])} onClick={apply}>Điền các ô đã chọn</button>}
        </div>
      </div>
    </div>, document.body)
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import { loadUndo, toBatches, revert, type UndoRow } from '../lib/undo'
import type { ProjectData } from '../lib/useProject'

const when = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })

/** Nút Hoàn tác / Làm lại / Lịch sử thay đổi (Ctrl+Z, Ctrl+Shift+Z) – quay lại các thay đổi mã vật liệu, phòng, vị trí/hình khoanh */
export default function UndoBar({ d }: { d: ProjectData }) {
  const { can, session, isAdmin } = useAuth()
  const [rows, setRows] = useState<UndoRow[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const pid = d.project?.id
  const me = session.user.id
  const allowed = can('undo')
  const load = useCallback(async () => { if (pid && allowed) setRows(await loadUndo(pid)) }, [pid, allowed])
  // tải lại lịch sử mỗi khi dữ liệu dự án đổi (gộp trong 0,8 giây)
  const t = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(load, 800); return () => clearTimeout(t.current) }, [load, d.entries, d.occ, d.rooms, d.rules])
  const batches = useMemo(() => toBatches(rows), [rows])
  const mine = batches.filter(b => b.user_id === me)
  const undoB = mine.find(b => !b.via && !b.reverted)
  const redoB = (() => { const r = mine.find(b => b.via && !b.reverted); if (!r) return undefined; const newer = mine.find(b => !b.via && !b.reverted && b.maxId > r.maxId); return newer ? undefined : r })()

  const run = useCallback(async (ids: number[], redo: boolean, what: string) => {
    if (busy || !ids.length) return
    setBusy(true)
    try {
      const r = await revert(ids, redo)
      await d.reload(); await load()
      const extra = [r.skipped ? `${r.skipped} thay đổi bỏ qua vì đã bị sửa tiếp` : '', r.failed ? `${r.failed} thay đổi không áp dụng được` : ''].filter(Boolean).join(' · ')
      toast(`${redo ? 'Đã làm lại' : 'Đã hoàn tác'}: ${what}${extra ? ' — ' + extra : ''}`, r.skipped || r.failed ? 'info' : 'ok')
    } catch (e) { toast(String((e as Error).message ?? e)) }
    setBusy(false)
  }, [busy, d, load])
  const doUndo = () => undoB && run(undoB.ids, false, undoB.label)
  const doRedo = () => redoB && run(redoB.ids, true, redoB.label)

  // phím tắt (không bắt khi đang gõ trong ô nhập)
  const ref = useRef({ doUndo, doRedo }); ref.current = { doUndo, doRedo }
  useEffect(() => {
    if (!allowed) return
    const h = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return
      const el = ev.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const k = ev.key.toLowerCase()
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); ref.current.doUndo() }
      else if ((k === 'z' && ev.shiftKey) || k === 'y') { ev.preventDefault(); ref.current.doRedo() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [allowed])

  if (!allowed) return null
  const rollTo = (b: (typeof batches)[number]) => {
    const ids = batches.filter(x => x.user_id === b.user_id && !x.via && !x.reverted && x.maxId >= b.minId).flatMap(x => x.ids)
    const steps = batches.filter(x => x.user_id === b.user_id && !x.via && !x.reverted && x.maxId >= b.minId).length
    if (confirm(`Quay lại trạng thái trước bước này?\nSẽ hoàn tác ${steps} bước (từ mới nhất về bước đã chọn). Những chỗ đã bị người khác sửa tiếp sẽ được bỏ qua.`)) run(ids, false, `${steps} bước`)
  }
  return (
    <>
      <div className="undo-bar no-export" title="Phím tắt: Ctrl+Z hoàn tác · Ctrl+Shift+Z làm lại">
        <button className="btn sm" disabled={!undoB || busy} onClick={doUndo} title={undoB ? 'Hoàn tác: ' + undoB.label : 'Chưa có thay đổi nào để hoàn tác'}>↶ Hoàn tác</button>
        <button className="btn sm" disabled={!redoB || busy} onClick={doRedo} title={redoB ? 'Làm lại: ' + redoB.label : 'Không có gì để làm lại'}>↷ Làm lại</button>
        <button className="btn ghost sm" onClick={() => setOpen(true)} title="Xem lịch sử thay đổi và quay lại một bước bất kỳ">🕘 Lịch sử</button>
      </div>
      {open && (
        <div className="modal-bg center" onMouseDown={() => setOpen(false)}>
          <div className="modal qc-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>🕘 Lịch sử thay đổi – quay lại bước trước</h3><button className="btn ghost sm" onClick={() => setOpen(false)}>✕</button></div>
            <p className="small muted">Mỗi dòng là một thao tác ({isAdmin ? 'của mọi người' : 'của bạn'}). “Quay lại về trước bước này” sẽ hoàn tác bước đó và mọi bước mới hơn của cùng người. Chỗ đã bị sửa tiếp sau đó được bỏ qua, không ghi đè. Chỉ lưu thay đổi mã vật liệu, phòng, vị trí/hình khoanh, quy định (45 ngày gần nhất).</p>
            {!batches.length ? <div className="ok-text">Chưa có thay đổi nào được ghi.</div> : <div style={{ overflowX: 'auto' }}><table className="tbl small" style={{ width: '100%' }}>
              <thead><tr><th>Lúc</th><th>Ai</th><th>Thay đổi</th><th /></tr></thead>
              <tbody>{batches.slice(0, 80).map(b => (
                <tr key={b.minId} style={b.reverted ? { opacity: 0.5 } : undefined}>
                  <td>{when(b.at)}</td><td>{b.user_name ?? '?'}</td>
                  <td>{b.via ? '↶ (do hoàn tác) ' : ''}{b.label}{b.n > 1 ? <span className="muted"> · {b.n} dòng</span> : null}{b.reverted && <span className="chk-tag chk-info" style={{ marginLeft: 6 }}>đã hoàn tác</span>}</td>
                  <td className="row gap sm-gap">
                    {!b.via && !b.reverted && (b.user_id === me || isAdmin) && <button className="btn sm" disabled={busy} onClick={() => rollTo(b)}>↶ Quay lại về trước bước này</button>}
                    {b.via && !b.reverted && (b.user_id === me || isAdmin) && <button className="btn sm" disabled={busy} onClick={() => run(b.ids, true, b.label)}>↷ Làm lại bước này</button>}
                  </td>
                </tr>))}</tbody>
            </table></div>}
          </div>
        </div>)}
    </>
  )
}

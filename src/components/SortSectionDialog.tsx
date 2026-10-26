import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Entry } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import { symbolMap } from '../lib/sections'
import { KINDS, SORT_MODES, kindOf, sortEntries, type SortMode } from '../lib/entrySort'
import { locationsOf } from '../lib/locations'

/** Sắp xếp thứ tự các mã trong một mục (chỉ đổi thứ tự, không tạo nhóm mới). `apply` nhận danh sách đã sắp (theo từng nhóm mã) */
export default function SortSectionDialog({ d, title, items, onApply, onClose }: { d: ProjectData; title: string; items: Entry[]; onApply: (sorted: Entry[]) => Promise<void>; onClose: () => void }) {
  const [mode, setMode] = useState<SortMode>(() => { try { return (localStorage.getItem('dmvl-sort-mode') as SortMode) || 'kind' } catch { return 'kind' } })
  const [busy, setBusy] = useState(false)
  const symMap = useMemo(() => symbolMap(d.entries), [d.entries])
  const sorted = useMemo(() => {
    // sắp riêng từng nhóm mã (đổi thứ tự chỉ có nghĩa trong cùng nhóm); các nhóm giữ nguyên thứ tự xuất hiện
    const groups = [...new Set(items.map(e => e.group_code))]
    return groups.flatMap(g => sortEntries(items.filter(e => e.group_code === g), mode, d.occ, d.rooms))
  }, [items, mode, d.occ, d.rooms])
  const changed = sorted.some((e, i) => e.id !== items[i]?.id)
  const roomsOf = (e: Entry) => locationsOf(e.id, d.occ, d.rooms, d.pages).map(l => l.room.code).slice(0, 4).join(', ')
  const run = async () => { setBusy(true); try { await onApply(sorted); onClose() } catch (er) { alert((er as Error).message); setBusy(false) } }
  let last = ''
  return createPortal(
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(820px, 96vw)', maxHeight: '92vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>⇅ Sắp xếp {title}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row gap sm-gap" style={{ flexWrap: 'wrap', margin: '8px 0' }}>{SORT_MODES.map(m => <button key={m.key} className={'chip' + (mode === m.key ? ' on' : '')} onClick={() => { setMode(m.key); try { localStorage.setItem('dmvl-sort-mode', m.key) } catch { /* bỏ qua */ } }}>{m.label}</button>)}</div>
        <p className="small muted">{SORT_MODES.find(m => m.key === mode)!.hint} Chỉ đổi thứ tự: các mã được đánh lại số theo thứ tự mới (nội dung giữ nguyên, mã vật liệu liên quan tự cập nhật), không tạo nhóm mới. Tự sao lưu trước khi áp dụng.</p>
        <table className="tbl small" style={{ width: '100%' }}>
          <thead><tr><th>#</th><th>Ký hiệu hiện tại</th><th>Tên hạng mục</th><th>Loại</th><th>Phòng</th></tr></thead>
          <tbody>{sorted.map((e, i) => {
            const k = kindOf(e).label, head = mode === 'kind' && k !== last; last = k
            return [head && <tr key={'h' + e.id}><td colSpan={5} style={{ background: '#f3ebe0', fontWeight: 700 }}>{k}</td></tr>,
              <tr key={e.id}><td>{i + 1}</td><td><b>{symMap.get(e.id) ?? e.code}</b></td><td>{e.name_vn}</td><td className="muted">{k}</td><td>{roomsOf(e) || '—'}</td></tr>]
          })}</tbody>
        </table>
        {mode === 'kind' && <p className="small muted" style={{ marginTop: 6 }}>Loại đồ nhận từ tên hạng mục ({KINDS.length} loại + “Khác”). Mục nào xếp chưa đúng, bạn đổi tên rõ hơn (vd “Ghế bar …”) hoặc kéo tay sau khi sắp.</p>}
        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn" disabled={busy} onClick={onClose}>Huỷ</button><button className="btn primary" disabled={busy || !changed} onClick={run}>{busy ? 'Đang sắp xếp…' : changed ? '⇅ Áp dụng thứ tự này' : 'Đã đúng thứ tự này'}</button></div>
      </div>
    </div>, document.body)
}

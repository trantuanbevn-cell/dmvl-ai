import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Entry } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import { symbolMap } from '../lib/sections'
import { KIND_SETS, SORT_MODES, hasKinds, kindOf, sortEntries, type SortMode } from '../lib/entrySort'
import { locationsOf } from '../lib/locations'

/** Sắp xếp thứ tự các mã trong một mục (chỉ đổi thứ tự, không tạo nhóm mới). `apply` nhận danh sách đã sắp (theo từng nhóm mã) */
export default function SortSectionDialog({ d, title, sectionKey, items, onApply, onClose }: { d: ProjectData; title: string; sectionKey: string; items: Entry[]; onApply: (sorted: Entry[]) => Promise<void>; onClose: () => void }) {
  const kinds = hasKinds(sectionKey)
  const modes = SORT_MODES.filter(m => kinds || m.key !== 'kind')
  const [mode, setMode] = useState<SortMode>(() => { let m: SortMode = 'kind'; try { m = (localStorage.getItem('dmvl-sort-mode') as SortMode) || 'kind' } catch { /* bỏ qua */ } return !kinds && m === 'kind' ? 'room' : m })
  const [busy, setBusy] = useState(false)
  const symMap = useMemo(() => symbolMap(d.entries), [d.entries])
  const sorted = useMemo(() => {
    // sắp riêng từng nhóm mã (đổi thứ tự chỉ có nghĩa trong cùng nhóm); các nhóm giữ nguyên thứ tự xuất hiện
    const groups = [...new Set(items.map(e => e.group_code))]
    return groups.flatMap(g => sortEntries(items.filter(e => e.group_code === g), mode, d.occ, d.rooms, sectionKey))
  }, [items, mode, d.occ, d.rooms, sectionKey])
  const changed = sorted.some((e, i) => e.id !== items[i]?.id)
  const roomsOf = (e: Entry) => locationsOf(e.id, d.occ, d.rooms, d.pages).map(l => l.room.code).slice(0, 4).join(', ')
  const run = async () => { setBusy(true); try { await onApply(sorted); onClose() } catch (er) { alert((er as Error).message); setBusy(false) } }
  let last = ''
  return createPortal(
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(820px, 96vw)', maxHeight: '92vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>⇅ Sắp xếp {title}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row gap sm-gap" style={{ flexWrap: 'wrap', margin: '8px 0' }}>{modes.map(m => <button key={m.key} className={'chip' + (mode === m.key ? ' on' : '')} onClick={() => { setMode(m.key); try { localStorage.setItem('dmvl-sort-mode', m.key) } catch { /* bỏ qua */ } }}>{m.label}</button>)}</div>
        <p className="small muted">{modes.find(m => m.key === mode)!.hint} Chỉ đổi thứ tự: các mã được đánh lại số theo thứ tự mới (nội dung giữ nguyên, mã vật liệu liên quan tự cập nhật), không tạo nhóm mới. Tự sao lưu trước khi áp dụng.</p>
        <table className="tbl small" style={{ width: '100%' }}>
          <thead><tr><th>#</th><th>Ký hiệu hiện tại</th><th>Tên hạng mục</th>{kinds && <th>Loại</th>}<th>Phòng</th></tr></thead>
          <tbody>{sorted.map((e, i) => {
            const k = kinds ? kindOf(e, sectionKey).label : '', head = mode === 'kind' && k !== last; last = k
            return [head && <tr key={'h' + e.id}><td colSpan={kinds ? 5 : 4} style={{ background: '#f3ebe0', fontWeight: 700 }}>{k}</td></tr>,
              <tr key={e.id}><td>{i + 1}</td><td><b>{symMap.get(e.id) ?? e.code}</b></td><td>{e.name_vn}</td>{kinds && <td className="muted">{k}</td>}<td>{roomsOf(e) || '—'}</td></tr>]
          })}</tbody>
        </table>
        {mode === 'kind' && kinds && <p className="small muted" style={{ marginTop: 6 }}>Loại nhận từ tên hạng mục ({(KIND_SETS[sectionKey] ?? []).length} loại + “Khác”). Mục nào xếp chưa đúng, bạn đổi tên rõ hơn hoặc kéo tay sau khi sắp.</p>}
        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn" disabled={busy} onClick={onClose}>Huỷ</button><button className="btn primary" disabled={busy || !changed} onClick={run}>{busy ? 'Đang sắp xếp…' : changed ? '⇅ Áp dụng thứ tự này' : 'Đã đúng thứ tự này'}</button></div>
      </div>
    </div>, document.body)
}
